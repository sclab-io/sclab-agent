import type { API, DB, IOT, SCLABResponseData } from '../../types';
import { logger } from '../../util/logger';
import { CommonHandler } from '../CommonHandler';
import { z } from 'zod';
import { DBManager } from '../../db/DBManager';
import { App } from '../../app';
import { IOTManager } from '../../iot/IOTManager';
import MybatisMapper from 'mybatis-mapper';
import { USE_MYBATIS } from '../../config';
import { Request } from 'express';
import { replaceString } from '../../util/util';

const dbOptionsSchema = z.object({
  host: z.string(),
  port: z.optional(z.number()),
  user: z.optional(z.string()),
  password: z.optional(z.string()),
  authType: z.optional(z.enum(['basic', 'custom'])),
  customAuth: z.optional(z.string()),
  catalog: z.optional(z.string()),
  schema: z.optional(z.string()),
  engine: z.optional(z.enum(['presto', 'trino'])),
  maxPool: z.optional(z.number()),
  minPool: z.optional(z.number()),
  poolInc: z.optional(z.number()),
  allowPublicKeyRetrieval: z.optional(z.boolean()),
  ssl: z.optional(
    z
      .object({
        ca: z.optional(z.string()),
        pfx: z.optional(z.string()),
        passphrase: z.optional(z.string()),
        rejectUnauthorized: z.optional(z.boolean()),
      })
      .or(z.boolean()),
  ),
  sshHost: z.optional(z.string()),
  sshPort: z.optional(z.number()),
  sshUser: z.optional(z.string()),
  sshPassword: z.optional(z.string()),
  sshPrivateKey: z.optional(z.string()),
  warehouse: z.optional(z.string()), // snowflake
  role: z.optional(z.string()), // snowflake
  token: z.optional(z.string()), // databricks
  httpPath: z.optional(z.string()), // databricks
});
const dbInsertSchema = z.object({
  name: z.string(),
  type: z.enum(['trino', 'mysql', 'oracle', 'sqlserver', 'odbc', 'altibase', 'postgres', 'hana', 'bigquery', 'snowflake', 'databricks']),
  options: dbOptionsSchema,
});
const dbUpdateSchema = z.object({
  name: z.string(),
  type: z.enum(['trino', 'mysql', 'oracle', 'sqlserver', 'odbc', 'altibase', 'postgres', 'hana', 'bigquery', 'snowflake', 'databricks']),
  oldName: z.string(),
  options: dbOptionsSchema,
});
const singleStringSchema = z.string();
const getSchemaSchema = z.object({
  name: z.string(),
  catalog: z.optional(z.string()),
});
const getTablesSchema = z.object({
  name: z.string(),
  catalog: z.optional(z.string()),
  schema: z.string(),
});
const getTableSchema = z.object({
  name: z.string(),
  catalog: z.optional(z.string()),
  schema: z.optional(z.string()),
  table: z.string(),
});
const getHistorySchema = z.object({
  name: z.string(),
  path: z.optional(z.string()),
  topic: z.optional(z.string()),
});
const runSQLSchema = z.object({
  name: z.string(),
  sql: z.string(),
  params: z.optional(z.any()),
});
const apiInsertSchema = z.object({
  path: z.string(),
  name: z.string(),
  SQL: z.string(),
  injectionCheck: z.boolean(),
  desc: z.optional(z.string()),
});
const apiUpdateSchema = z.object({
  path: z.string(),
  name: z.string(),
  SQL: z.string(),
  injectionCheck: z.boolean(),
  desc: z.optional(z.string()),
  oldPath: z.string(),
});
const iotInsertSchema = z.object({
  topic: z.string(),
  name: z.string(),
  SQL: z.string(),
  interval: z.number(),
  broker: z.object({
    host: z.string(),
    clientId: z.string(),
    id: z.string(),
    password: z.string(),
  }),
  desc: z.optional(z.string()),
});
const iotUpdateSchema = z.object({
  topic: z.string(),
  name: z.string(),
  SQL: z.string(),
  interval: z.number(),
  broker: z.object({
    host: z.string(),
    clientId: z.string(),
    id: z.string(),
    password: z.string(),
  }),
  desc: z.optional(z.string()),
  oldTopic: z.string(),
});
export class ManageHandler extends CommonHandler {
  static async handle(req: Request): Promise<SCLABResponseData> {
    try {
      switch (req.path) {
        case '/manage/db/insert': {
          const data: any = req.body;
          return await ManageHandler.dbInsert(data);
        }
        case '/manage/db/update': {
          const data: any = req.body;
          return await ManageHandler.dbUpdate(data);
        }
        case '/manage/db/get': {
          return await ManageHandler.dbGet(req.query['name'] as string);
        }
        case '/manage/db/delete': {
          return await ManageHandler.dbDelete(req.query['name'] as string);
        }
        case '/manage/db/connectionTest': {
          const data: any = req.body;
          if (data && data.name) {
            return await ManageHandler.dbConnectionTestWithDB(data);
          } else {
            return await ManageHandler.dbConnectionTest(req.query['name'] as string);
          }
        }
        case '/manage/db/sql': {
          const data: any = req.body;
          return await ManageHandler.runSQL(data);
        }
        case '/manage/history/list': {
          const data: any = req.body;
          return await ManageHandler.getHistoryList(data);
        }
        case '/manage/history/delete': {
          const data: any = req.body['id'] as string;
          return await ManageHandler.historyDelete(data);
        }
        case '/manage/history/delete/all': {
          const data: any = req.body;
          return await ManageHandler.historyDeleteAll(data);
        }
        case '/manage/db/list': {
          return await ManageHandler.dbList();
        }
        case '/manage/db/catalogs': {
          return await ManageHandler.getCatalogs(req.query['name'] as string);
        }
        case '/manage/db/schemas': {
          return await ManageHandler.getSchemas({
            name: req.query['name'] as string,
            catalog: (req.query['catalog'] as string) || '',
          });
        }
        case '/manage/db/tables': {
          return await ManageHandler.getTables({
            name: req.query['name'] as string,
            catalog: (req.query['catalog'] as string) || '',
            schema: (req.query['schema'] as string) || '',
          });
        }
        case '/manage/db/table': {
          return await ManageHandler.getTable({
            name: req.query['name'] as string,
            catalog: (req.query['catalog'] as string) || '',
            schema: req.query['schema'] as string,
            table: req.query['table'] as string,
          });
        }
        case '/manage/api/insert': {
          const data: any = req.body;
          return await ManageHandler.apiInsert(data);
        }
        case '/manage/api/update': {
          const data: any = req.body;
          return await ManageHandler.apiUpdate(data);
        }
        case '/manage/api/delete': {
          return await ManageHandler.apiDelete(req.query['path'] as string);
        }
        case '/manage/api/get': {
          return await ManageHandler.apiGet(req.query['path'] as string);
        }
        case '/manage/api/list': {
          return await ManageHandler.apiList(req.query['name'] as string);
        }
        case '/manage/iot/insert': {
          const data: any = req.body;
          return await ManageHandler.iotInsert(data);
        }
        case '/manage/iot/update': {
          const data: any = req.body;
          return await ManageHandler.iotUpdate(data);
        }
        case '/manage/iot/delete': {
          return await ManageHandler.iotDelete(req.query['topic'] as string);
        }
        case '/manage/iot/get': {
          return await ManageHandler.iotGet(req.query['topic'] as string);
        }
        case '/manage/iot/list': {
          return await ManageHandler.iotList(req.query['name'] as string);
        }
      }
    } catch (e) {
      logger.error(e);
      return { status: 'error', result: e };
    }

    return super.handle(req);
  }

  static async getHistoryList(data: { name: string; path?: string; topic?: string }): Promise<SCLABResponseData> {
    getHistorySchema.parse(data);
    const result = await App.agentConfig.getHistoryList(data.name, data.path || null, data.topic || null);
    return {
      status: 'ok',
      result,
    };
  }

  static async historyDelete(idStr: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(idStr);
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return { status: 'error', result: 'Invalid history id' };
    }
    await App.agentConfig.deleteHistory(id);
    return {
      status: 'ok',
      result: 'history delete complete',
    };
  }

  static async historyDeleteAll(data: { name: string; path?: string; topic?: string }): Promise<SCLABResponseData> {
    getHistorySchema.parse(data);
    await App.agentConfig.deleteHistoryAll(data.name, data.path || null, data.topic || null);
    return {
      status: 'ok',
      result: 'history delete complete',
    };
  }

  static async getTable(data: { name: string; catalog?: string; schema: string; table: string }): Promise<SCLABResponseData> {
    getTableSchema.parse(data);
    const result = await DBManager.getTable(data);
    return {
      status: 'ok',
      result,
    };
  }

  static async getTables(data: { name: string; catalog?: string; schema: string }): Promise<SCLABResponseData> {
    getTablesSchema.parse(data);
    const result = await DBManager.getTables(data);
    return {
      status: 'ok',
      result,
    };
  }

  static async getSchemas(data: { name: string; catalog?: string }): Promise<SCLABResponseData> {
    getSchemaSchema.parse(data);
    const result = await DBManager.getSchemas(data);
    return {
      status: 'ok',
      result,
    };
  }

  static async getCatalogs(dbName: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(dbName);
    const result = await DBManager.getCatalogs(dbName);
    return {
      status: 'ok',
      result,
    };
  }

  static async dbList(): Promise<SCLABResponseData> {
    const result = await App.agentConfig.getDBList();
    return {
      status: 'ok',
      result,
    };
  }

  static async dbConnectionTest(dbName: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(dbName);

    const result = await DBManager.testConnection(dbName);
    if (result) {
      return {
        status: 'ok',
        result: 'DB Connected',
      };
    } else {
      return {
        status: 'error',
        result: 'Cannot connect database',
      };
    }
  }

  static async runSQL(data: { name: string; sql: string; params: any }): Promise<SCLABResponseData> {
    runSQLSchema.parse(data);
    const path = data.name;
    let sql: string;
    if (USE_MYBATIS === '1') {
      App.registerAPI(
        {
          path,
          name: data.name,
          SQL: data.sql,
          injectionCheck: false,
          desc: '',
        },
        'test',
      );
      sql = MybatisMapper.getStatement('test', path, data.params || {});
    } else {
      sql = replaceString(data.sql, data.params);
    }

    const limit = /SELECT/i.test(sql) ? 10 : 0;
    const result = await DBManager.runSQL(data.name, sql, limit);
    return {
      status: 'ok',
      result,
      sql,
    };
  }

  static async dbInsert(data: DB): Promise<SCLABResponseData> {
    dbInsertSchema.parse(data);
    await App.agentConfig.insertDatabase(data);
    await DBManager.addDB(data);
    return {
      status: 'ok',
      result: 'db insert complete',
    };
  }

  static async dbConnectionTestWithDB(data: DB): Promise<SCLABResponseData> {
    data.name = data.name + new Date().getTime();
    try {
      const db = await App.agentConfig.getDatabase(data.name);
      if (db) {
        await ManageHandler.dbDelete(data.name);
      }
    } catch (e) {
      if (typeof e === 'string' && e.startsWith('Removed')) {
        await ManageHandler.dbInsert(data);
      }
    }

    let result: SCLABResponseData;
    try {
      result = await ManageHandler.dbConnectionTest(data.name);
      await ManageHandler.dbDelete(data.name);
    } catch (e) {
      await ManageHandler.dbDelete(data.name);
      throw e;
    }

    return result;
  }

  static async dbUpdate(data: DB): Promise<SCLABResponseData> {
    dbUpdateSchema.parse(data);
    await App.agentConfig.updateDatabase(data);
    await DBManager.removeDB(data.oldName!);
    await DBManager.addDB(data);
    return {
      status: 'ok',
      result: 'db update complete',
    };
  }

  static async dbGet(dbName: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(dbName);
    const result = await App.agentConfig.getDatabase(dbName);
    return {
      status: 'ok',
      result,
    };
  }

  static async dbDelete(dbName: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(dbName);
    await App.agentConfig.deleteDatabase(dbName);
    await DBManager.removeDB(dbName);
    return {
      status: 'ok',
      result: 'db delete complete',
    };
  }

  static async apiInsert(data: API): Promise<SCLABResponseData> {
    apiInsertSchema.parse(data);
    await App.agentConfig.insertAPI(data);
    if (USE_MYBATIS === '1') {
      App.registerAPI(data);
    }

    return {
      status: 'ok',
      result: 'api insert complete',
    };
  }

  static async apiUpdate(data: API): Promise<SCLABResponseData> {
    apiUpdateSchema.parse(data);
    await App.agentConfig.updateAPI(data);
    if (USE_MYBATIS === '1') {
      App.registerAPI(data);
    }
    return {
      status: 'ok',
      result: 'api update complete',
    };
  }

  static async apiDelete(path: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(path);
    await App.agentConfig.deleteAPI(path);
    return {
      status: 'ok',
      result: 'api delete complete',
    };
  }

  static async apiGet(path: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(path);
    const result = await App.agentConfig.getAPI(path);
    return {
      status: 'ok',
      result,
    };
  }

  static async apiList(name: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(name);
    const result = await App.agentConfig.getAPIList(name);
    return {
      status: 'ok',
      result,
    };
  }

  static async iotInsert(data: IOT): Promise<SCLABResponseData> {
    iotInsertSchema.parse(data);
    await App.agentConfig.insertIOT(data);
    await IOTManager.add(data);
    return {
      status: 'ok',
      result: 'iot insert complete',
    };
  }

  static async iotUpdate(data: IOT): Promise<SCLABResponseData> {
    iotUpdateSchema.parse(data);
    await IOTManager.remove(data.oldTopic);
    await App.agentConfig.updateIOT(data);
    await IOTManager.add(data);
    return {
      status: 'ok',
      result: 'iot update complete',
    };
  }

  static async iotDelete(topic: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(topic);
    await IOTManager.remove(topic);
    await App.agentConfig.deleteIOT(topic);
    return {
      status: 'ok',
      result: 'iot delete complete',
    };
  }

  static async iotGet(topic: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(topic);
    const result = await App.agentConfig.getIOT(topic);
    return {
      status: 'ok',
      result,
    };
  }

  static async iotList(name: string): Promise<SCLABResponseData> {
    singleStringSchema.parse(name);
    const result = await App.agentConfig.getIOTList(name);
    return {
      status: 'ok',
      result,
    };
  }
}
