import type { Catalog, Column, DB, Schema, Table } from '../types';
import { DB_TYPE } from '../types/consts';
import presto from 'presto-client';
import type { ClientOptions } from 'presto-client';
import { logger } from '../util/logger';
import mariadb from 'mariadb';
import oracledb from 'oracledb';
import sql from 'mssql';
import { MSSQL_IDLE_TIMEOUT_MS, TUNNEL_KEEP_ALIVE_INTERVAL_MS, USE_SQL_ENV, USE_AWS_SECRET_MANAGER } from '../config';
import odbc from 'odbc';
import { App } from '../app';
import postgres from 'pg';
import hana from '@sap/hana-client';
import { BigQuery } from '@google-cloud/bigquery';
import { createTunnel, ForwardOptions, TunnelOptions, SshOptions } from 'tunnel-ssh';
import { AddressInfo, Server } from 'net';
import { Client } from 'ssh2';
import { SecretManager } from '@/config/SecretManager';

// BigInt bug fix to string
(BigInt.prototype as any).toJSON = function () {
  if (this.valueOf() > Number.MAX_SAFE_INTEGER) {
    return this.toString();
  }
  return parseInt(this.toString(), 10);
};
interface DBClient {
  client: presto.Client | mariadb.Pool | oracledb.Pool | sql.ConnectionPool | odbc.Pool | postgres.Pool | hana.ConnectionPool | BigQuery;
  type: string;
  tunnel?: TunnelInfo;
  keepAliveTimeoutId?: NodeJS.Timeout;
}

interface TunnelInfo {
  tunnelServer: Server;
  tunnelAddressInfo: AddressInfo;
  tunnelClient: Client;
}

const CLIENT_NOT_FOUNT_ERROR = 'client does not exists in DBManager.dbMap';

export class DBManager {
  static addDBStack: Map<string, { resolve: Function; reject: Function }[]> = new Map();
  static dbMap: Map<string, DBClient> = new Map();

  static async createTunnel(db: DB): Promise<TunnelInfo> {
    const { sshHost, sshPort, sshUser, sshPassword, host, port, sshPrivateKey } = db.options;
    const tunnelOptions: TunnelOptions = { autoClose: false, reconnectOnError: false };
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
      dstAddr: host,
      dstPort: port,
    };
    const [server, client] = await createTunnel(tunnelOptions, null, sshOptions, forwardOptions);
    server.on('error', async (err: any) => {
      logger.error('tunnel server : ' + JSON.stringify(err));
      DBManager.removeDB(db.name);
    });

    client.on('error', async (err: any) => {
      logger.error('tunnel client : ' + JSON.stringify(err));
      DBManager.removeDB(db.name);
    });
    return { tunnelServer: server, tunnelAddressInfo: server.address() as AddressInfo, tunnelClient: client };
  }

  static getKeepAliveTimeoutId(tunnel: TunnelInfo | undefined, dbName: string): NodeJS.Timeout | undefined {
    if (!tunnel) {
      return undefined;
    }

    const keepAliveInterval = TUNNEL_KEEP_ALIVE_INTERVAL_MS ? parseInt(TUNNEL_KEEP_ALIVE_INTERVAL_MS, 10) : 3600000;
    return setTimeout(async () => {
      try {
        logger.info('keepAliveTimeoutRunning: ' + dbName);
        await DBManager.testConnection(dbName);
      } catch (e) {
        logger.error('KeepAliveTimeoutId error : ' + JSON.stringify(e));
        try {
          DBManager.removeDB(dbName);
          DBManager.addDB(await App.agentConfig.getDatabase(dbName));
        } catch (e) {
          logger.error('keepAliveReConnectError : ' + JSON.stringify(e));
        }
      } finally {
        const dbClient = DBManager.getClient(dbName);
        if (dbClient.keepAliveTimeoutId) {
          clearTimeout(dbClient.keepAliveTimeoutId);
        }
        dbClient.keepAliveTimeoutId = DBManager.getKeepAliveTimeoutId(dbClient.tunnel, dbName);
      }
    }, keepAliveInterval);
  }

  static updateKeepAliveTimeoutId(dbClient: DBClient, dbName: string) {
    if (dbClient.keepAliveTimeoutId) {
      clearTimeout(dbClient.keepAliveTimeoutId);
      dbClient.keepAliveTimeoutId = DBManager.getKeepAliveTimeoutId(dbClient.tunnel, dbName);
    }
  }

  static async addDB(db: DB): Promise<boolean> {
    if (!db) {
      return false;
    }
    if (DBManager.addDBStack.has(db.name)) {
      logger.debug('addDBStack', db.name);
      // wait until previous addDB is done
      return new Promise((resolve, reject) => {
        DBManager.addDBStack.get(db.name)?.push({ resolve, reject });
      });
    }

    DBManager.addDBStack.set(db.name, []);
    let tunnel: TunnelInfo | undefined;

    try {
      switch (db.type) {
        case DB_TYPE.TRINO: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          const prestoOptions: ClientOptions = {
            host: tunnel ? tunnel.tunnelAddressInfo.address : db.options.host,
            port: tunnel ? tunnel.tunnelAddressInfo.port : db.options.port,
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
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });

          break;
        }

        case DB_TYPE.MYSQL: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          const DBPool = mariadb.createPool({
            host: tunnel ? tunnel.tunnelAddressInfo.address : db.options.host,
            port: tunnel ? tunnel.tunnelAddressInfo.port : db.options.port,
            user: db.options.user,
            password: db.options.password,
            database: db.options.database,
            connectionLimit: db.options.maxPool || 10,
            allowPublicKeyRetrieval: !!db.options.allowPublicKeyRetrieval,
            ssl:
              db.options.ssl === true
                ? {
                    rejectUnauthorized: false,
                  }
                : false,
          });

          DBManager.dbMap.set(db.name, {
            client: DBPool,
            type: db.type,
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });
          break;
        }

        case DB_TYPE.HANA: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          const DBPool = hana.createPool(
            {
              host: tunnel ? tunnel.tunnelAddressInfo.address : db.options.host,
              port: tunnel ? tunnel.tunnelAddressInfo.port : db.options.port,
              user: db.options.user,
              password: db.options.password,
            },
            { max: db.options.maxPool || 10 },
          );
          DBManager.dbMap.set(db.name, {
            client: DBPool,
            type: db.type,
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });
          break;
        }

        case DB_TYPE.POSTGRES: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          const postgresSQL = new postgres.Pool({
            host: tunnel ? tunnel.tunnelAddressInfo.address : db.options.host,
            port: tunnel ? tunnel.tunnelAddressInfo.port : db.options.port,
            user: db.options.user,
            password: db.options.password,
            database: db.options.database,
            ssl:
              db.options.ssl === true
                ? {
                    rejectUnauthorized: false,
                  }
                : false,
            max: db.options.maxPool || 10,
          });
          DBManager.dbMap.set(db.name, {
            client: postgresSQL,
            type: db.type,
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });
          break;
        }

        case DB_TYPE.ORACLE: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          await oracledb.createPool({
            user: db.options.user,
            password: db.options.password,
            connectString: tunnel
              ? `${tunnel.tunnelAddressInfo.address}:${tunnel.tunnelAddressInfo.port}`
              : `${db.options.host}:${db.options.port || 1521}`,
            poolIncrement: db.options.poolInc || 1,
            poolMax: db.options.maxPool || 10,
            poolMin: db.options.minPoll || 4,
            poolAlias: db.name,
          });
          DBManager.dbMap.set(db.name, {
            client: oracledb.getPool(db.name),
            type: db.type,
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });
          break;
        }

        case DB_TYPE.SQL_SERVER: {
          if (db.options.sshHost && db.options.sshPort && db.options.sshUser) {
            tunnel = await DBManager.createTunnel(db);
          }
          const pool = await new sql.ConnectionPool({
            user: db.options.user,
            password: db.options.password,
            server: tunnel ? tunnel.tunnelAddressInfo.address : db.options.host,
            port: tunnel ? tunnel.tunnelAddressInfo.port : db.options.port || 1433,
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
            tunnel,
            keepAliveTimeoutId: DBManager.getKeepAliveTimeoutId(tunnel, db.name),
          });
          break;
        }

        case DB_TYPE.ALTIBASE:
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

        case DB_TYPE.BIGQUERY: {
          const client = new BigQuery({
            projectId: db.options.host,
            credentials: JSON.parse(db.options.password),
          });
          DBManager.dbMap.set(db.name, {
            client,
            type: db.type,
          });
          break;
        }

        default: {
          logger.info(`Not implemented database ${db.type}`);
          break;
        }
      }
    } catch (e) {
      logger.error('add db error :' + JSON.stringify(e));
      if (tunnel) {
        tunnel.tunnelServer.close();
        tunnel.tunnelClient.end();
      }
      DBManager.addDBStack.get(db.name).forEach(fn => {
        fn.reject(false);
      });
      DBManager.addDBStack.delete(db.name);
      return false;
    }

    if (DBManager.addDBStack.get(db.name).length > 0) {
      DBManager.addDBStack.get(db.name).forEach(fn => {
        fn.resolve(true);
      });
    }

    DBManager.addDBStack.delete(db.name);

    logger.info(`DB Added : ${db.name}`);

    return true;
  }

  static async removeDB(name: string) {
    if (!DBManager.dbMap.has(name)) {
      return;
    }

    logger.info(`DB Removed : ${name}`);

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

      case DB_TYPE.ALTIBASE:
      case DB_TYPE.ODBC: {
        await (dbClient.client as odbc.Pool).close();
        break;
      }

      case DB_TYPE.BIGQUERY: {
        break;
      }
    }

    if (dbClient.tunnel) {
      // close ssh tunnel
      dbClient.tunnel.tunnelServer.close();
      dbClient.tunnel.tunnelClient.end();
      dbClient.tunnel = undefined;
    }

    if (dbClient.keepAliveTimeoutId) {
      clearTimeout(dbClient.keepAliveTimeoutId);
      dbClient.keepAliveTimeoutId = undefined;
    }

    DBManager.dbMap.delete(name);
  }

  static getClient(name: string): DBClient {
    if (DBManager.dbMap.has(name)) {
      return DBManager.dbMap.get(name)!;
    }

    throw new Error(`${name} ${CLIENT_NOT_FOUNT_ERROR}`);
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

          case DB_TYPE.ALTIBASE:
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

          case DB_TYPE.BIGQUERY: {
            try {
              const client = dbClient.client as BigQuery;
              await client.query('SELECT 1');
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to BigQuery. Please check your config.`);
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

  static applyENV(sql: string): string {
    // __EN_VARIABLE NAME__ 를 환경변수로 치환
    // SQL에서 단일 인용부호로 구분된 부분으로 나눕니다.
    // 인용부호 안쪽은 실제 토큰 값으로 간주합니다.
    const parts = sql.split("'");
    for (let i = 1; i < parts.length; i += 2) {
      const segment = parts[i];
      if (segment.startsWith('__EN_') && segment.endsWith('__')) {
        const keyContent = segment.slice(5, segment.length - 2);
        const value: string = process.env[keyContent];
        parts[i] = value;
      }
    }

    return parts.join("'");
  }

  static async applyAWSSecret(sql: string): Promise<string> {
    const keyCache: { [key: string]: string } = {};

    // SQL에서 단일 인용부호로 구분된 부분으로 나눕니다.
    // 인용부호 안쪽은 실제 토큰 값으로 간주합니다.
    const parts = sql.split("'");

    for (let i = 1; i < parts.length; i += 2) {
      const segment = parts[i];
      if (segment.startsWith('__AS_') && segment.endsWith('__')) {
        const keyContent = segment.slice(5, segment.length - 2);

        let value: string;
        if (keyCache[keyContent]) {
          value = keyCache[keyContent];
        } else {
          // "::"를 기준으로 분리하여 SecretManager에서 값을 가져옵니다.
          const [firstKey, secondKey] = keyContent.split('::');
          value = await SecretManager.getKey(firstKey, secondKey);
          keyCache[keyContent] = value;
        }

        parts[i] = value;
      }
    }

    return parts.join("'");
  }

  static runSQL(name: string, sql: string, limit: number = 0, retry: number = 1): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        logger.debug(`DB NAME : ${name}`);
        const dbClient = DBManager.getClient(name);

        if (USE_SQL_ENV) {
          sql = DBManager.applyENV(sql);
        }

        if (USE_AWS_SECRET_MANAGER) {
          sql = await DBManager.applyAWSSecret(sql);
        }

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
              state: function (error) {
                if (error) {
                  logger.error(error);
                  reject(error);
                }
              },
              columns: function (error) {
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
              success: function (error) {
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

            // 커넥션 풀 관련 이슈로 인해 커넥션을 가져오지 못하는 경우 재시도
            if (client.closed || (client.idleConnections() === 0 && client.activeConnections() === 0)) {
              // reconnect
              if (retry > 0) {
                await DBManager.removeDB(name);
                await DBManager.addDB(await App.agentConfig.getDatabase(name));
                resolve(await DBManager.runSQL(name, sql, limit, retry - 1));
                return;
              }
            }

            let conn: mariadb.PoolConnection;
            try {
              conn = await client.getConnection();
            } catch (e) {
              // 기타 이유로 커넥션을 가져오지 못하는 경우
              // reconnect
              if (retry > 0) {
                await DBManager.removeDB(name);
                await DBManager.addDB(await App.agentConfig.getDatabase(name));
                resolve(await DBManager.runSQL(name, sql, limit, retry - 1));
                return;
              }
              reject(e);
              return;
            }

            try {
              const rows = await conn.query(sql);
              resolve(rows);
            } catch (e) {
              reject(e);
              return;
            } finally {
              await conn.release();
              DBManager.updateKeepAliveTimeoutId(dbClient, name);
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
              return;
            } finally {
              conn.clean();
              DBManager.updateKeepAliveTimeoutId(dbClient, name);
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
              return;
            } finally {
              DBManager.updateKeepAliveTimeoutId(dbClient, name);
            }
            break;
          }

          case DB_TYPE.ORACLE: {
            const client = dbClient.client as oracledb.Pool;
            const conn: oracledb.Connection = await client.getConnection();
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
              return;
            } finally {
              await conn.close();
              DBManager.updateKeepAliveTimeoutId(dbClient, name);
            }
            break;
          }

          case DB_TYPE.SQL_SERVER: {
            const client = dbClient.client as sql.ConnectionPool;
            const result = await client.query(sql);
            resolve(result.recordset);
            DBManager.updateKeepAliveTimeoutId(dbClient, name);
            break;
          }

          case DB_TYPE.ALTIBASE:
          case DB_TYPE.ODBC: {
            const client = dbClient.client as odbc.Pool;
            const rows = await client.query(sql);
            resolve(rows);
            break;
          }

          case DB_TYPE.BIGQUERY: {
            const client = dbClient.client as BigQuery;
            const [job] = await client.createQueryJob({ query: sql });
            const [rows] = await job.getQueryResults();
            resolve(rows as any);
            break;
          }
        }
      } catch (e) {
        if (e.message && typeof e.message === 'string' && e.message.includes(CLIENT_NOT_FOUNT_ERROR)) {
          // try to add db
          try {
            const db = await App.agentConfig.getDatabase(name);
            if (await DBManager.addDB(db)) {
              resolve(await DBManager.runSQL(name, sql, limit));
            } else {
              reject('Connection lost, check your database connection');
            }
            return;
          } catch (e) {
            logger.error('run sql reconnect fail : ' + JSON.stringify(e));
            reject('Connection lost, check your database connection');
            return;
          }
        }
        reject(e);
      }
    });
  }

  static async getCatalogs(dbName: string): Promise<Catalog[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const dbClient = DBManager.getClient(dbName);
        const db = await App.agentConfig.getDatabase(dbName);
        let result: any;
        switch (dbClient.type) {
          case DB_TYPE.TRINO: {
            if (db.options.catalog) {
              resolve([{ name: db.options.catalog }]);
              return;
            }
            result = (await DBManager.runSQL(dbName, 'SHOW CATALOGS')).map((row: { Catalog: string }) => {
              return {
                name: row.Catalog,
              };
            });

            break;
          }
          case DB_TYPE.POSTGRES: {
            if (db.options.database) {
              resolve([{ name: db.options.database }]);
              return;
            }
            result = (
              await DBManager.runSQL(
                dbName,
                `
              SELECT datname FROM pg_database WHERE datistemplate = false
              `,
              )
            ).map((row: { datname: string }) => {
              return {
                name: row.datname,
              };
            });

            break;
          }
          case DB_TYPE.HANA: {
            if (db.options.database) {
              resolve([{ name: db.options.database }]);
              return;
            }
            result = (
              await DBManager.runSQL(
                dbName,
                `
              SELECT DATABASE_NAME FROM M_DATABASES
              `,
              )
            ).map((row: { DATABASE_NAME: string }) => {
              return {
                name: row.DATABASE_NAME,
              };
            });
            break;
          }
          case DB_TYPE.BIGQUERY: {
            if (db.options.host) {
              result = [{ name: db.options.host }];
            } else {
              result = [];
            }
            break;
          }
          default: {
            throw new Error('Retrieving catalogs is only supported in Trino or Presto.');
          }
        }

        resolve(result);
      } catch (e) {
        if (e.message && typeof e.message === 'string' && e.message.includes(CLIENT_NOT_FOUNT_ERROR)) {
          // try to add db
          try {
            const db = await App.agentConfig.getDatabase(dbName);
            if (await DBManager.addDB(db)) {
              resolve(await DBManager.getCatalogs(dbName));
            } else {
              reject('Connection lost, check your database connection');
            }
            return;
          } catch (e) {
            logger.error('run sql reconnect fail', e);
            reject('Connection lost, check your database connection');
            return;
          }
        }

        reject(e);
      }
    });
  }

  static async getSchemas(data: { name: string; catalog?: string }): Promise<Schema[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const dbClient = DBManager.getClient(data.name);
        const db = await App.agentConfig.getDatabase(data.name);
        let result: any;
        switch (dbClient.type) {
          case DB_TYPE.TRINO: {
            if (db.options.schema) {
              resolve([{ name: db.options.schema }]);
              return;
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
              resolve([{ name: db.options.database }]);
              return;
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
              resolve([{ name: db.options.schema }]);
              return;
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

          case DB_TYPE.ALTIBASE:
          case DB_TYPE.ODBC: {
            result = {
              status: 'error',
              result: 'ODBC does not support retrieving schemas.',
            };
            break;
          }

          case DB_TYPE.BIGQUERY: {
            const client = dbClient.client as BigQuery;
            const [datasets] = await client.getDatasets();
            result = datasets.map(d => ({ name: d.id! }));
            break;
          }
        }

        resolve(result);
      } catch (e) {
        if (e.message && typeof e.message === 'string' && e.message.includes(CLIENT_NOT_FOUNT_ERROR)) {
          // try to add db
          try {
            const db = await App.agentConfig.getDatabase(data.name);
            if (await DBManager.addDB(db)) {
              resolve(await DBManager.getSchemas(data));
            } else {
              reject('Connection lost, check your database connection');
            }
            return;
          } catch (e) {
            logger.error('run sql reconnect fail', e);
            reject('Connection lost, check your database connection');
            return;
          }
        }

        reject(e);
      }
    });
  }

  static async getTables(data: { name: string; catalog?: string; schema: string }): Promise<Table[]> {
    return new Promise(async (resolve, reject) => {
      try {
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

          case DB_TYPE.ALTIBASE: {
            const db = await App.agentConfig.getDatabase(data.name);
            const connection = await odbc.connect(db.options.host);
            result = (await connection.tables(data.catalog || null, data.schema || null, null, 'TABLE,VIEW')).map((row: { TABLE_NAME: string }) => {
              return {
                name: row.TABLE_NAME,
              };
            });
            await connection.close();
            break;
          }

          case DB_TYPE.ODBC: {
            const db = await App.agentConfig.getDatabase(data.name);
            const connection = await odbc.connect(db.options.host);
            result = (await connection.tables(data.catalog || null, data.schema || null, null, null)).map((row: { TABLE_NAME: string }) => {
              return {
                name: row.TABLE_NAME,
              };
            });
            await connection.close();
            break;
          }

          case DB_TYPE.BIGQUERY: {
            const client = dbClient.client as BigQuery;
            const [tables] = await client.dataset(data.schema).getTables();
            result = tables.map(t => ({ name: t.id! }));
            break;
          }
        }
        resolve(result);
      } catch (e) {
        if (e.message && typeof e.message === 'string' && e.message.includes(CLIENT_NOT_FOUNT_ERROR)) {
          // try to add db
          try {
            const db = await App.agentConfig.getDatabase(data.name);
            if (await DBManager.addDB(db)) {
              resolve(await DBManager.getTables(data));
            } else {
              reject('Connection lost, check your database connection');
            }
            return;
          } catch (e) {
            logger.error('run sql reconnect fail', e);
            reject('Connection lost, check your database connection');
            return;
          }
        }
        reject(e);
      }
    });
  }

  static async getTable(data: { name: string; catalog?: string; schema: string; table: string }): Promise<Column> {
    return new Promise(async (resolve, reject) => {
      try {
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

          case DB_TYPE.ALTIBASE:
          case DB_TYPE.ODBC: {
            const db = await App.agentConfig.getDatabase(data.name);
            const connection = await odbc.connect(db.options.host);
            result = (await connection.columns(data.catalog || null, data.schema || null, data.table, null)).map(
              (row: { COLUMN_NAME: string; TYPE_NAME: string }) => {
                return {
                  name: row.COLUMN_NAME,
                  type: row.TYPE_NAME,
                };
              },
            );
            await connection.close();
            break;
          }

          case DB_TYPE.BIGQUERY: {
            const client = dbClient.client as BigQuery;
            const [metadata] = await client.dataset(data.schema).table(data.table).getMetadata();
            result = metadata.schema.fields.map((f: any) => ({ name: f.name, type: f.type }));
            break;
          }
        }
        resolve(result);
      } catch (e) {
        if (e.message && typeof e.message === 'string' && e.message.includes(CLIENT_NOT_FOUNT_ERROR)) {
          // try to add db
          try {
            const db = await App.agentConfig.getDatabase(data.name);
            if (await DBManager.addDB(db)) {
              resolve(await DBManager.getTable(data));
            } else {
              reject('Connection lost, check your database connection');
            }
            return;
          } catch (e) {
            logger.error('run sql reconnect fail', e);
            reject('Connection lost, check your database connection');
            return;
          }
        }

        reject(e);
      }
    });
  }
}
