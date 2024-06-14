import type { DB } from "../types";
import { DB_TYPE } from "../types/consts";
import presto from "presto-client";
import type { ClientOptions } from "presto-client";
import { logger } from "../util/logger";
import mariadb from "mariadb";
import oracledb from "oracledb";
import sql from "mssql";
import { MSSQL_IDLE_TIMEOUT_MS } from "../config";
import odbc from "odbc";
import { App } from "../app";

// BigInt bug fix to string
(BigInt.prototype as any).toJSON = function () {
  if (this.valueOf() > Number.MAX_SAFE_INTEGER) {
    return this.toString();
  }
  return parseInt(this.toString(), 10);
};
interface DBClient {
  client:
    | presto.Client
    | mariadb.Pool
    | oracledb.Pool
    | sql.ConnectionPool
    | odbc.Pool;
  type: string;
}

export class DBManager {
  static dbMap: Map<string, DBClient> = new Map();

  static async addDB(db: DB): Promise<boolean> {
    switch (db.type) {
      case DB_TYPE.TRINO: {
        const prestoOptions: ClientOptions = {
          host: db.options.host,
          port: db.options.port,
          user: db.options.user,
          catalog: db.options.catalog,
          schema: db.options.schema,
          engine: db.options.engine,
          source: "SCLAB Agent",
        };
        if (db.options.authType === "basic" && db.options.user) {
          prestoOptions.basic_auth = {
            user: db.options.user,
            password: db.options.password || "",
          };
        } else if (db.options.authType === "custom" && db.options.customAuth) {
          prestoOptions.custom_auth = db.options.customAuth;
        }
        DBManager.dbMap.set(db.name, {
          client: new presto.Client(prestoOptions),
          type: db.type,
        });
        break;
      }

      case DB_TYPE.MYSQL: {
        const DBPool = mariadb.createPool({
          host: db.options.host,
          port: db.options.port,
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

      case DB_TYPE.ORACLE: {
        await oracledb.createPool({
          user: db.options.user,
          password: db.options.password,
          connectString: db.options.host,
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
        const pool = await new sql.ConnectionPool({
          user: db.options.user,
          password: db.options.password,
          server: db.options.host!,
          port: db.options.port || 1433,
          database: db.options.database,
          pool: {
            max: db.options.maxPool || 10,
            min: db.options.minPoll || 0,
            idleTimeoutMillis:
              (MSSQL_IDLE_TIMEOUT_MS && parseInt(MSSQL_IDLE_TIMEOUT_MS, 10)) ||
              30000,
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
              query: "select 1",
              success: function (error: any) {
                if (error) {
                  return;
                }
                logger.info("Presto/Trino connection success");
                resolve(true);
              },
              error: (error: any) => {
                console.error(error);
                logger.info(
                  `Cannot connect to Presto/Trino. Please check your config.`
                );
                reject(false);
              },
            });

            break;
          }

          case DB_TYPE.MYSQL: {
            const client = dbClient.client as mariadb.Pool;
            const conn = await client.getConnection();
            try {
              await conn.query("select 1");
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to MySQL. Please check your config.`);
              reject(false);
            } finally {
              await conn.release();
            }
            break;
          }

          case DB_TYPE.ORACLE: {
            const client = dbClient.client as oracledb.Pool;
            const conn = await client.getConnection();
            try {
              await conn.execute("SELECT 1 FROM DUAL");
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(
                `Cannot connect to ORACLE. Please check your config.`
              );
              reject(false);
            } finally {
              await conn.close();
            }
            break;
          }

          case DB_TYPE.SQL_SERVER: {
            const client = dbClient.client as sql.ConnectionPool;
            try {
              await client.query("SELECT 1");
              resolve(true);
            } catch (e) {
              console.error(e);
              logger.info(
                `Cannot connect to SQL Server. Please check your config.`
              );
              reject(false);
            }
            break;
          }

          case DB_TYPE.ODBC: {
            try {
              const client = dbClient.client as odbc.Pool;
              if (client) {
                resolve(true);
              } else {
                throw new Error("ODBC Connection fail");
              }
            } catch (e) {
              console.error(e);
              logger.info(`Cannot connect to ODBC. Please check your config.`);
              reject(false);
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
    return (
      /\bSELECT\b[\s\S]*?\bLIMIT\b\s+\d+/i.test(sql) ||
      /SELECT\s+TOP\s+\d+/i.test(sql)
    );
  }

  static ensureLimitClause(
    sql: string,
    limit: number = 10,
    dbType?: string
  ): string {
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

  static async getCatalogs(dbName: string): Promise<any> {
    const dbClient = DBManager.getClient(dbName);
    if (dbClient.type !== DB_TYPE.TRINO) {
      return {
        status: "error",
        result: "Retrieving catalogs is only supported in Trino or Presto.",
      };
    }
    const result = await DBManager.runSQL(dbName, "SHOW CATALOGS");
    return result;
  }

  static async getSchemas(data: {
    name: string;
    catalog?: string;
  }): Promise<any> {
    const dbClient = DBManager.getClient(data.name);
    let result: any;
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        result = await DBManager.runSQL(
          data.name,
          `SHOW SCHEMAS FROM ${data.catalog}`
        );
        break;
      }

      case DB_TYPE.MYSQL: {
        result = await DBManager.runSQL(data.name, "SHOW DATABASES");
        break;
      }

      case DB_TYPE.ORACLE: {
        result = await DBManager.runSQL(
          data.name,
          "SELECT username FROM all_users"
        );
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `
        SELECT 
          name, database_id, create_date, state_desc, owner_sid 
        FROM 
          sys.databases
        `
        );
        break;
      }

      case DB_TYPE.ODBC: {
        result = {
          status: "error",
          result: "ODBC does not support retrieving schemas.",
        };
      }
    }

    return result;
  }

  static async getTables(data: {
    name: string;
    catalog?: string;
    schema: string;
  }): Promise<any> {
    let result: any;
    const dbClient = DBManager.getClient(data.name);
    switch (dbClient.type) {
      case DB_TYPE.TRINO: {
        if (data.catalog) {
          result = await DBManager.runSQL(
            data.name,
            `SHOW TABLES FROM ${data.catalog}.${data.schema}`
          );
        } else {
          result = await DBManager.runSQL(
            data.name,
            `SHOW TABLES FROM ${data.schema}`
          );
        }
        break;
      }

      case DB_TYPE.MYSQL: {
        result = await DBManager.runSQL(data.name, "SHOW TABLES");
        break;
      }

      case DB_TYPE.ORACLE: {
        result = await DBManager.runSQL(
          data.name,
          `SELECT table_name FROM all_tables WHERE owner = '${data.schema}'`
        );
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `SELECT 
              TABLE_CATALOG AS DatabaseName, 
              TABLE_SCHEMA AS SchemaName, 
              TABLE_NAME AS TableName, 
              TABLE_TYPE AS TableType
          FROM 
              ${data.schema}.INFORMATION_SCHEMA.TABLES
          WHERE 
              TABLE_TYPE = 'BASE TABLE'`
        );
        break;
      }

      case DB_TYPE.ODBC: {
        const db = await App.agentConfig.getDatabase(data.name);
        const connection = await odbc.connect(db.options.host);
        result = await connection.tables(data.catalog, data.schema, null, null);
        await connection.close();
      }
    }
    return result;
  }

  static async getTable(data: {
    name: string;
    catalog?: string;
    schema: string;
    table: string;
  }): Promise<any> {
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

        result = await DBManager.runSQL(data.name, sql);
        break;
      }

      case DB_TYPE.MYSQL: {
        result = await DBManager.runSQL(
          data.name,
          `DESCRIBE ${data.schema}.${data.table}`
        );
        break;
      }

      case DB_TYPE.ORACLE: {
        result = await DBManager.runSQL(
          data.name,
          `SELECT 
            column_name, data_type, nullable, data_default 
          FROM 
            all_tab_columns 
          WHERE 
            table_name = '${data.table}' AND owner = '${data.schema}'`
        );
        break;
      }

      case DB_TYPE.SQL_SERVER: {
        result = await DBManager.runSQL(
          data.name,
          `
          SELECT 
              TABLE_CATALOG AS DatabaseName, 
              TABLE_SCHEMA AS SchemaName, 
              TABLE_NAME AS TableName, 
              COLUMN_NAME AS ColumnName, 
              ORDINAL_POSITION AS OrdinalPosition, 
              COLUMN_DEFAULT AS ColumnDefault, 
              IS_NULLABLE AS IsNullable, 
              DATA_TYPE AS DataType, 
              CHARACTER_MAXIMUM_LENGTH AS CharacterMaximumLength, 
              NUMERIC_PRECISION AS NumericPrecision, 
              NUMERIC_SCALE AS NumericScale, 
              DATETIME_PRECISION AS DatetimePrecision
          FROM 
              ${data.schema}.INFORMATION_SCHEMA.COLUMNS
          WHERE 
              TABLE_NAME = '${data.table}';
          `
        );
        break;
      }

      case DB_TYPE.ODBC: {
        const db = await App.agentConfig.getDatabase(data.name);
        const connection = await odbc.connect(db.options.host);
        result = await connection.columns(
          data.catalog,
          data.schema,
          data.table,
          null
        );
        await connection.close();
        break;
      }
    }
    return result;
  }
}
