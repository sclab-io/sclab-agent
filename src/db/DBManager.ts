import type { Catalog, Column, DB, Schema, Table } from '../types';
import { DB_TYPE } from '../types/consts';
import presto from 'presto-client';
import type { ClientOptions } from 'presto-client';
import { logger } from '../util/logger';
import mariadb from 'mariadb';
import oracledb from 'oracledb';
import sql from 'mssql';
import { MSSQL_IDLE_TIMEOUT_MS } from '../config';
import odbc from 'odbc';
import { App } from '../app';
import postgres from 'pg';
import hana from '@sap/hana-client';
import { createTunnel, ForwardOptions, ServerOptions, TunnelOptions, SshOptions } from 'tunnel-ssh';
import { AddressInfo, Server } from 'net';

// BigInt bug fix to string
(BigInt.prototype as any).toJSON = function () {
  if (this.valueOf() > Number.MAX_SAFE_INTEGER) {
    return this.toString();
  }
  return parseInt(this.toString(), 10);
};
interface DBClient {
  client: presto.Client | mariadb.Pool | oracledb.Pool | sql.ConnectionPool | odbc.Pool | postgres.Pool | hana.ConnectionPool;
  type: string;
  tunnel?: Server;
}

export class DBManager {
  static dbMap: Map<string, DBClient> = new Map();

  static async createTunnel(
    sshHost: string,
    sshPort: number,
    sshUser: string,
    sshPassword: string,
    targetHost: string,
    targetPort: number,
    sshPrivateKey: string | null = null,
  ): Promise<{ tunnelServer: Server; tunnelAddressInfo: AddressInfo }> {
    const tunnelOptions: TunnelOptions = { autoClose: false, reconnectOnError: true };
    const sshOptions: SshOptions = {
      host: sshHost,
      port: sshPort || 22,
      username: sshUser,
      password: sshPassword,
    };

    if (sshPrivateKey) {
      sshOptions.privateKey = sshPrivateKey;
      if (sshPassword) {
        sshOptions.passphrase = sshPassword;
      }

      delete sshOptions.password;
    }

    const forwardOptions: ForwardOptions = {
      dstAddr: targetHost,
      dstPort: targetPort,
    };
    const [server, client] = await createTunnel(tunnelOptions, null, sshOptions, forwardOptions);
    return { tunnelServer: server, tunnelAddressInfo: server.address() as AddressInfo };
  }

  static async addDB(db: DB): Promise<boolean> {
    let tunnelAddressInfo: AddressInfo | undefined;
    let tunnelServer: Server | undefined;
    switch (db.type) {
      case DB_TYPE.TRINO: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        const prestoOptions: ClientOptions = {
          host: tunnelAddressInfo ? tunnelAddressInfo.address : db.options.host,
          port: tunnelAddressInfo ? tunnelAddressInfo.port : db.options.port,
          user: db.options.user,
          catalog: db.options.catalog,
          schema: db.options.schema,
          engine: db.options.engine,
          source: 'SCLAB Agent',
        };

        if (db.options.authType === 'basic' && db.options.user) {
          prestoOptions.basic_auth = {
            user: db.options.user,
            password: db.options.password || '',
          };
        } else if (db.options.authType === 'custom' && db.options.customAuth) {
          prestoOptions.custom_auth = db.options.customAuth;
        }
        DBManager.dbMap.set(db.name, {
          client: new presto.Client(prestoOptions),
          type: db.type,
        });

        break;
      }

      case DB_TYPE.MYSQL: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        const DBPool = mariadb.createPool({
          host: tunnelAddressInfo ? tunnelAddressInfo.address : db.options.host,
          port: tunnelAddressInfo ? tunnelAddressInfo.port : db.options.port,
          user: db.options.user,
          password: db.options.password,
          database: db.options.database,
          connectionLimit: db.options.maxPool || 10,
          allowPublicKeyRetrieval: !!db.options.allowPublicKeyRetrieval,
          ssl: db.options.ssl || false,
        });
        DBManager.dbMap.set(db.name, { client: DBPool, type: db.type });
        break;
      }

      case DB_TYPE.HANA: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        const DBPool = hana.createPool(
          {
            host: tunnelAddressInfo ? tunnelAddressInfo.address : db.options.host,
            port: tunnelAddressInfo ? tunnelAddressInfo.port : db.options.port,
            user: db.options.user,
            password: db.options.password,
          },
          { max: db.options.maxPool || 10 },
        );
        DBManager.dbMap.set(db.name, { client: DBPool, type: db.type });
        break;
      }

      case DB_TYPE.POSTGRES: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        const postgresSQL = new postgres.Pool({
          host: tunnelAddressInfo ? tunnelAddressInfo.address : db.options.host,
          port: tunnelAddressInfo ? tunnelAddressInfo.port : db.options.port,
          user: db.options.user,
          password: db.options.password,
          database: db.options.database,
          ssl: db.options.ssl || false,
          max: db.options.maxPool || 10,
        });
        DBManager.dbMap.set(db.name, { client: postgresSQL, type: db.type });
        break;
      }

      case DB_TYPE.ORACLE: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port || 1521,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        await oracledb.createPool({
          user: db.options.user,
          password: db.options.password,
          connectString: tunnelAddressInfo
            ? `${tunnelAddressInfo.address}:${tunnelAddressInfo.port}`
            : `${db.options.host}:${db.options.port || 1521}`,
          poolIncrement: db.options.poolInc || 1,
          poolMax: db.options.maxPool || 10,
          poolMin: db.options.minPoll || 4,
          poolAlias: db.name,
        });
        DBManager.dbMap.set(db.name, {
          client: oracledb.getPool(db.name),
          type: db.type,
        });
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
          const tunnel = await DBManager.createTunnel(
            db.options.sshHost,
            db.options.sshPort,
            db.options.sshUser,
            db.options.sshPassword,
            db.options.host,
            db.options.port || 1433,
            db.options.sshPrivateKey || null,
          );
          tunnelAddressInfo = tunnel.tunnelAddressInfo;
          tunnelServer = tunnel.tunnelServer;
        }
        const pool = await new sql.ConnectionPool({
          user: db.options.user,
          password: db.options.password,
          server: tunnelAddressInfo ? tunnelAddressInfo.address : db.options.host,
          port: tunnelAddressInfo ? tunnelAddressInfo.port : db.options.port || 1433,
          database: db.options.database,
          pool: {
            max: db.options.maxPool || 10,
            min: db.options.minPoll || 0,
            idleTimeoutMillis: (MSSQL_IDLE_TIMEOUT_MS && parseInt(MSSQL_IDLE_TIMEOUT_MS, 10)) || 30000,
          },
          options: {
            trustedConnection: true,
            encrypt: true,
            enableArithAbort: true,
            trustServerCertificate: true,
          },
        }).connect();
        DBManager.dbMap.set(db.name, {
          client: pool,
          type: db.type,
        });
        break;
      }

      case DB_TYPE.ODBC: {
        const pool = await odbc.pool({
          connectionString: db.options.host!,
          connectionTimeout: 10,
          loginTimeout: 10,
          maxSize: db.options.maxPool,
        });
        DBManager.dbMap.set(db.name, {
          client: pool,
          type: db.type,
        });
        break;
      }

      default: {
        logger.info(`Not implemented database ${db.type}`);
        break;
      }
    }

    return true;
  }

  static async removeDB(name: string) {
    if (!DBManager.dbMap.has(name)) {
      return;
    }

    const dbClient = DBManager.getClient(name);
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        break;
      }

      case DB_TYPE.MYSQL: {
        await (dbClient.client as mariadb.Pool).end();
        break;
      }

      case DB_TYPE.HANA: {
        (dbClient.client as hana.ConnectionPool).clear();
        break;
      }

      case DB_TYPE.POSTGRES: {
        await (dbClient.client as postgres.Pool).end();
        break;
      }

      case DB_TYPE.ORACLE: {
        await (dbClient.client as oracledb.Pool).close();
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        await (dbClient.client as sql.ConnectionPool).close();
        break;
      }

      case DB_TYPE.ODBC: {
        await (dbClient.client as odbc.Pool).close();
        break;
      }
    }

    if (dbClient.tunnel) {
      // close ssh tunnel
      dbClient.tunnel.close();
    }

    DBManager.dbMap.delete(name);
  }

  static getClient(name: string): DBClient {
    if (DBManager.dbMap.has(name)) {
      return DBManager.dbMap.get(name)!;
    }

    throw new Error(`${name} client does not exists in DBManager.dbMap`);
  }

  static testConnection(name: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const dbClient = DBManager.getClient(name);
        switch (dbClient.type) {
          case DB_TYPE.TRINO: {
            const client = dbClient.client as presto.Client;
            client.execute({
              query: 'select 1',
              success: function (error: any) {
                if (error) {
                  return;
                }
                logger.info('Presto/Trino connection success');
                resolve(true);
              },
              error: (error: any) => {
                console.error(error);
                logger.info(`Cannot connect to Presto/Trino. Please check your config.`);
                reject(error);
              },
            });

            break;
          }

          case DB_TYPE.MYSQL: {
            const client = dbClient.client as mariadb.Pool;
            try {
              const conn = await client.getConnection();
              try {
                await conn.query('select 1');
                resolve(true);
              } catch (e) {
                console.error(e);
                logger.info(`Cannot connect to MySQL. Please check your config.`);
                reject(e);
              } finally {
                await conn.release();
              }
            } catch (e) {
              reject(e);
            }

            break;
          }

          case DB_TYPE.HANA: {
            const client = dbClient.client as hana.ConnectionPool;
            try {
              const conn = client.getConnection();
              try {
                await conn.exec('SELECT 1 FROM DUMMY');
                resolve(true);
              } catch (e) {
                console.error(e);
                logger.info(`Cannot connect to SAP/HANA. Please check your config.`);
                reject(e);
              } finally {
                conn.clean();
              }
            } catch (e) {
              reject(e);
            }

            break;
          }

          case DB_TYPE.POSTGRES: {
            const client = dbClient.client as postgres.Pool;
            try {
              await client.query(`select 1`);
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to PostgreSQL. Please check your config.`);
              reject(e);
            }
            break;
          }

          case DB_TYPE.ORACLE: {
            const client = dbClient.client as oracledb.Pool;
            const conn = await client.getConnection();
            try {
              await conn.execute('SELECT 1 FROM DUAL');
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to ORACLE. Please check your config.`);
              reject(e);
            } finally {
              await conn.close();
            }
            break;
          }

          case DB_TYPE.SQL_SERVER: {
            const client = dbClient.client as sql.ConnectionPool;
            try {
              await client.query('SELECT 1');
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to SQL Server. Please check your config.`);
              reject(e);
            }
            break;
          }

          case DB_TYPE.ODBC: {
            try {
              const client = dbClient.client as odbc.Pool;
              if (client) {
                resolve(true);
              } else {
                throw new Error('ODBC Connection fail');
              }
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to ODBC. Please check your config.`);
              reject(e);
            }
            break;
          }
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  static hasLimitClause(sql: string): boolean {
    return /\bSELECT\b[\s\S]*?\bLIMIT\b\s+\d+/i.test(sql) || /SELECT\s+TOP\s+\d+/i.test(sql);
  }

  static removeLimitClause(sql: string): string {
    return sql.replace(/\sLIMIT\s+\d+\s*;?$/i, '');
  }

  static ensureLimitClause(sql: string, limit: number = 10, dbType?: string): string {
    if (DBManager.hasLimitClause(sql)) {
      return sql;
    }

    if (dbType === DB_TYPE.SQL_SERVER) {
      return sql.trim().replace(/SELECT/i, `SELECT TOP ${limit}`);
    } else {
      return sql.trim() + ` LIMIT ${limit}`;
    }
  }

  static runSQL(name: string, sql: string, limit: number = 0): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        logger.debug(`DB NAME : ${name}`);
        const dbClient = DBManager.getClient(name);

        if (limit > 0) {
          sql = DBManager.ensureLimitClause(sql, limit, dbClient.type);
        }
        logger.debug(`RUN SQL : ${sql}`);
        switch (dbClient.type) {
          case DB_TYPE.TRINO: {
            let rows: any[] | null = [];
            const client = dbClient.client as presto.Client;
            client.execute({
              query: sql,
              state: function (error, query_id, stats) {
                if (error) {
                  logger.error(error);
                  reject(error);
                }
              },
              columns: function (error, data) {
                if (error) {
                  logger.error(error);
                  reject(error);
                  return;
                }
              },
              data: function (error, data, columns) {
                if (error) {
                  logger.error(error);
                  reject(error);
                  return;
                }
                for (let i = 0; i < data.length; i++) {
                  const obj: any = {};
                  for (let j = 0; j < columns.length; j++) {
                    obj[columns[j].name] = data[i][j];
                  }

                  rows!.push(obj);
                }
              },
              success: function (error, stats) {
                if (error) {
                  logger.error(error);
                  reject(error);
                  return;
                }
                resolve(rows);
                rows = null;
              },
              error: function (error) {
                logger.error(error);
                rows = null;
                reject(error);
              },
            });
            break;
          }

          case DB_TYPE.MYSQL: {
            const client = dbClient.client as mariadb.Pool;
            const conn = await client.getConnection();
            try {
              const rows = await conn.query(sql);
              resolve(rows);
            } catch (e) {
              reject(e);
            } finally {
              await conn.release();
            }
            break;
          }

          case DB_TYPE.HANA: {
            const client = dbClient.client as hana.ConnectionPool;
            const conn = client.getConnection();
            try {
              const rows = await conn.exec(sql);
              resolve(rows);
            } catch (e) {
              reject(e);
            } finally {
              conn.clean();
            }
            break;
          }

          case DB_TYPE.POSTGRES: {
            const client = dbClient.client as postgres.Pool;
            try {
              const result = await client.query(sql);
              resolve(result.rows);
            } catch (e) {
              reject(e);
            }
            break;
          }

          case DB_TYPE.ORACLE: {
            const client = dbClient.client as oracledb.Pool;
            let conn: oracledb.Connection = await client.getConnection();
            try {
              const result = await conn.execute(sql)!;
              const rows = [];
              let row: any[], obj: any;
              for (let i = 0; i < result.rows!.length; i++) {
                obj = {};
                row = result.rows![i] as any;
                for (let j = 0; j < result.metaData!.length; j++) {
                  obj[result.metaData![j].name] = row[j];
                }
                rows.push(obj);
              }
              resolve(rows);
            } catch (e) {
              reject(e);
            } finally {
              await conn.close();
            }
            break;
          }

          case DB_TYPE.SQL_SERVER: {
            const client = dbClient.client as sql.ConnectionPool;
            const result = await client.query(sql);
            resolve(result.recordset);
            break;
          }

          case DB_TYPE.ODBC: {
            const client = dbClient.client as odbc.Pool;
            const rows = await client.query(sql);
            resolve(rows);
            break;
          }
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  static async getCatalogs(dbName: string): Promise<Catalog[]> {
    const dbClient = DBManager.getClient(dbName);
    const db = await App.agentConfig.getDatabase(dbName);
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        if (db.options.catalog) {
          return [{ name: db.options.catalog }];
        }
        const result = await DBManager.runSQL(dbName, 'SHOW CATALOGS');
        return result.map((row: { Catalog: string }) => {
          return {
            name: row.Catalog,
          };
        });
      }
      case DB_TYPE.POSTGRES: {
        if (db.options.database) {
          return [{ name: db.options.database }];
        }
        const result = await DBManager.runSQL(
          dbName,
          `
          SELECT datname FROM pg_database WHERE datistemplate = false
          `,
        );
        return result.map((row: { datname: string }) => {
          return {
            name: row.datname,
          };
        });
      }
      case DB_TYPE.HANA: {
        if (db.options.database) {
          return [{ name: db.options.database }];
        }
        const result = await DBManager.runSQL(
          dbName,
          `
          SELECT DATABASE_NAME FROM M_DATABASES
          `,
        );
        return result.map((row: { DATABASE_NAME: string }) => {
          return {
            name: row.DATABASE_NAME,
          };
        });
      }
      default: {
        throw new Error('Retrieving catalogs is only supported in Trino or Presto.');
      }
    }
  }

  static async getSchemas(data: { name: string; catalog?: string }): Promise<Schema[]> {
    const dbClient = DBManager.getClient(data.name);
    const db = await App.agentConfig.getDatabase(data.name);
    let result: any;
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        if (db.options.schema) {
          return [{ name: db.options.schema }];
        }
        result = (await DBManager.runSQL(data.name, `SHOW SCHEMAS FROM ${data.catalog}`)).map((row: { Schema: string }) => {
          return {
            name: row.Schema,
          };
        });
        break;
      }

      case DB_TYPE.MYSQL: {
        if (db.options.database) {
          return [{ name: db.options.database }];
        }
        result = (await DBManager.runSQL(data.name, 'SHOW DATABASES')).map((row: { Database: string }) => {
          return {
            name: row.Database,
          };
        });
        break;
      }

      case DB_TYPE.HANA: {
        result = (await DBManager.runSQL(data.name, 'SELECT SCHEMA_NAME FROM SCHEMAS'))
          // hide system schema
          // .filter((row: { SCHEMA_NAME: string }) => {
          //   return row.SCHEMA_NAME.startsWith('_') === false;
          // })
          .map((row: { SCHEMA_NAME: string }) => {
            return {
              name: row.SCHEMA_NAME,
            };
          });
        break;
      }

      case DB_TYPE.POSTGRES: {
        if (db.options.schema) {
          return [{ name: db.options.schema }];
        }
        result = (
          await DBManager.runSQL(
            data.name,
            `
          SELECT nspname FROM pg_namespace
          WHERE nspname NOT LIKE 'pg_%'
          AND nspname <> 'information_schema'
          `,
          )
        ).map((row: { nspname: string }) => {
          return {
            name: row.nspname,
          };
        });
        break;
      }

      case DB_TYPE.ORACLE: {
        result = (await DBManager.runSQL(data.name, 'SELECT username FROM all_users')).map((row: { USERNAME: string }) => {
          return {
            name: row.USERNAME,
          };
        });
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `
        SELECT 
          name
        FROM 
          sys.databases
        `,
        );
        break;
      }

      case DB_TYPE.ODBC: {
        result = {
          status: 'error',
          result: 'ODBC does not support retrieving schemas.',
        };
      }
    }

    return result;
  }

  static async getTables(data: { name: string; catalog?: string; schema: string }): Promise<Table[]> {
    let result: any;
    const dbClient = DBManager.getClient(data.name);
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        if (data.catalog) {
          result = (await DBManager.runSQL(data.name, `SHOW TABLES FROM ${data.catalog}.${data.schema}`)).map((row: { Table: string }) => {
            return {
              name: row.Table,
            };
          });
        } else {
          result = (await DBManager.runSQL(data.name, `SHOW TABLES FROM ${data.schema}`)).map((row: { Table: string }) => {
            return {
              name: row.Table,
            };
          });
        }
        break;
      }

      case DB_TYPE.MYSQL: {
        result = (await DBManager.runSQL(data.name, 'SHOW TABLES')).map((row: any) => {
          return {
            name: row[`Tables_in_${data.schema}`],
          };
        });
        break;
      }

      case DB_TYPE.HANA: {
        result = (await DBManager.runSQL(data.name, `SELECT TABLE_NAME FROM TABLES WHERE SCHEMA_NAME = '${data.schema}'`)).map(
          (row: { TABLE_NAME: string }) => {
            return {
              name: row.TABLE_NAME,
            };
          },
        );
        break;
      }

      case DB_TYPE.POSTGRES: {
        result = (
          await DBManager.runSQL(
            data.name,
            `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = '${data.schema}'
          `,
          )
        ).map((row: any) => {
          return {
            name: row['table_name'],
          };
        });
        break;
      }

      case DB_TYPE.ORACLE: {
        result = (await DBManager.runSQL(data.name, `SELECT table_name FROM all_tables WHERE owner = '${data.schema}'`)).map(
          (row: { TABLE_NAME: string }) => {
            return {
              name: row.TABLE_NAME,
            };
          },
        );
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `SELECT 
              TABLE_NAME AS name
          FROM 
              ${data.schema}.INFORMATION_SCHEMA.TABLES
          WHERE 
              TABLE_TYPE = 'BASE TABLE'`,
        );
        break;
      }

      case DB_TYPE.ODBC: {
        const db = await App.agentConfig.getDatabase(data.name);
        const connection = await odbc.connect(db.options.host);
        result = (await connection.tables(data.catalog, data.schema, null, null)).map((row: { TABLE_NAME: string }) => {
          return {
            name: row.TABLE_NAME,
          };
        });
        await connection.close();
      }
    }
    return result;
  }

  static async getTable(data: { name: string; catalog?: string; schema: string; table: string }): Promise<Column> {
    const dbClient = DBManager.getClient(data.name);
    let result: any;
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        let sql: string;
        if (data.catalog) {
          sql = `DESCRIBE ${data.catalog}.${data.schema}.${data.table}`;
        } else {
          sql = `DESCRIBE ${data.schema}.${data.table}`;
        }

        result = (await DBManager.runSQL(data.name, sql)).map((row: { Column: string; Type: string }) => {
          return {
            name: row.Column,
            type: row.Type,
          };
        });
        break;
      }

      case DB_TYPE.MYSQL: {
        result = (await DBManager.runSQL(data.name, `DESCRIBE ${data.schema}.${data.table}`)).map((row: { Field: string; Type: string }) => {
          return {
            name: row.Field,
            type: row.Type,
          };
        });
        break;
      }

      case DB_TYPE.HANA: {
        result = (
          await DBManager.runSQL(
            data.name,
            `
          SELECT COLUMN_NAME, DATA_TYPE_NAME 
          FROM SYS.COLUMNS 
          WHERE SCHEMA_NAME = '${data.schema}' AND TABLE_NAME = '${data.table}'
        `,
          )
        ).map((row: { COLUMN_NAME: string; DATA_TYPE_NAME: string }) => {
          return {
            name: row.COLUMN_NAME,
            type: row.DATA_TYPE_NAME,
          };
        });
        break;
      }

      case DB_TYPE.POSTGRES: {
        result = (
          await DBManager.runSQL(
            data.name,
            `
          SELECT 
              column_name,
              data_type
          FROM 
              information_schema.columns
          WHERE 
              table_name = '${data.table}'
              AND table_schema = '${data.schema}'
          `,
          )
        ).map((row: { column_name: string; data_type: string }) => {
          return {
            name: row.column_name,
            type: row.data_type,
          };
        });
        break;
      }

      case DB_TYPE.ORACLE: {
        result = (
          await DBManager.runSQL(
            data.name,
            `SELECT 
            column_name, data_type
          FROM 
            all_tab_columns 
          WHERE 
            table_name = '${data.table}' AND owner = '${data.schema}'`,
          )
        ).map((row: { COLUMN_NAME: string; DATA_TYPE: string }) => {
          return {
            name: row.COLUMN_NAME,
            type: row.DATA_TYPE,
          };
        });
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `
          SELECT 
              COLUMN_NAME AS name, 
              DATA_TYPE AS type
          FROM 
              ${data.schema}.INFORMATION_SCHEMA.COLUMNS
          WHERE 
              TABLE_NAME = '${data.table}';
          `,
        );
        break;
      }

      case DB_TYPE.ODBC: {
        const db = await App.agentConfig.getDatabase(data.name);
        const connection = await odbc.connect(db.options.host);
        result = (await connection.columns(data.catalog, data.schema, data.table, null)).map((row: { COLUMN_NAME: string; TYPE_NAME: string }) => {
          return {
            name: row.COLUMN_NAME,
            type: row.TYPE_NAME,
          };
        });
        await connection.close();
        break;
      }
    }
    return result;
  }
}
