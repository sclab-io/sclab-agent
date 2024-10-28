import { Request } from 'express';
import { App } from '../../app';
import { USE_MYBATIS } from '../../config';
import { DBManager } from '../../db/DBManager';
import type { SCLABResponseData } from '../../types';
import { logger } from '../../util/logger';
import { hasSql, replaceString } from '../../util/util';
import { CommonHandler } from '../CommonHandler';
import MybatisMapper from 'mybatis-mapper';

export class APIHandler extends CommonHandler {
  static async handle(req: Request): Promise<SCLABResponseData> {
    try {
      const path = req.path;
      const api = await App.agentConfig.getAPI(path);
      const valueObj: any = {};
      const paramKeys = Object.keys(req.query);
      const keys: string[] = [];
      for (const key of paramKeys) {
        keys.push(key);
      }
      if (keys.length > 0) {
        let paramKey: string, reqData: any;
        for (let i = 0, len = keys.length; i < len; i++) {
          paramKey = keys[i];
          reqData = req.query[paramKey];

          if (reqData && api.injectionCheck) {
            if (hasSql(reqData)) {
              return {
                status: 'error',
                result: `SQL injection detect with query param: ${paramKey}, ${reqData}`,
              };
            }
          }

          try {
            valueObj[paramKey] = JSON.parse(reqData);
          } catch (e) {
            valueObj[paramKey] = reqData;
          }
        }
      }

      let sql: string;
      if (USE_MYBATIS === '1') {
        sql = MybatisMapper.getStatement('api', path, valueObj);
      } else {
        sql = replaceString(api.SQL, valueObj);
      }

      const result = await DBManager.runSQL(api.name, sql, 10);

      if (req.headers && req.headers['total-count']) {
        const countResult = await DBManager.runSQL(api.name, `SELECT COUNT(*) AS count FROM (${DBManager.removeLimitClause(sql)})`, 1);
        return { status: 'ok', result, totalCount: countResult[0].count };
      }

      return { status: 'ok', result };
    } catch (e) {
      return { status: 'error', result: e };
    }
  }
}
