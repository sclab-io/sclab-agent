import { logger, stream } from './util/logger';
import figlet from 'figlet';
import {
  AGENT_DB_PATH,
  JWT_PRIVATE_KEY_PATH,
  JWT_PUBLIC_KEY_PATH,
  LD_LIBRARY_PATH,
  LOG_DIR,
  NODE_ENV,
  ORACLE_CLIENT_DIR,
  PORT,
  SECRET_KEY,
  TLS_CERT,
  TLS_KEY,
  USE_MYBATIS,
} from './config';
import jwt from 'jsonwebtoken';
import type { API, DB, SCLABResponseData } from './types';
import { AgentConfig } from './db/AgentConfig';
import { DBManager } from './db/DBManager';
import { APIHandler } from './api/endpoint/APIHandler';
import { ManageHandler } from './api/manage/ManageHandler';
import MybatisMapper from 'mybatis-mapper';
import { IOTManager } from './iot/IOTManager';
import oracledb from 'oracledb';
import express, { NextFunction, Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import morgan from 'morgan';
import { jwtMiddleware } from './middlewares/jwt.middleware';
import helmet from 'helmet';
import errorMiddleware from './middlewares/error.middleware';
import { resolve } from 'path';

export class App {
  public port: number | string;
  public jwtPubKey?: Buffer;
  public app: express.Application;
  public static agentConfig: AgentConfig;

  public static registerAPI(api: API, namespace: string = 'api') {
    const mapper = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="${namespace}">
  <select id="${api.path}">
      ${api.SQL}
  </select>
</mapper>
      `;
    MybatisMapper.createMapper([mapper]);
  }

  constructor() {
    this.app = express();
    this.port = PORT || 7890;
    logger.info('\n' + figlet.textSync('SCLAB AGENT', 'Star Wars'));
    logger.info(`======================================================================================`);
    logger.info(`NODE_ENV: ${NODE_ENV}`);
    logger.info(`LOG_DIR: ${LOG_DIR}`);
    logger.info(`🚀 App listening on the port ${this.port}`);
    this.generateJWTKey();
    this.initializeMiddlewares();
  }

  public async init() {
    this.app.all('/*', async (req: Request, res: Response, next: NextFunction) => {
      const ip = req.headers['x-forwarded-for'] || req.ip;
      logger.info(`path: ${req.path}, ip: ${ip}`);

      let data: SCLABResponseData;

      try {
        if (req.path.startsWith('/api')) {
          data = await APIHandler.handle(req);
        } else if (req.path.startsWith('/manage')) {
          data = await ManageHandler.handle(req);
        } else if (req.path === '/') {
          data = {
            status: 'ok',
            result: 'Authentication complete.',
          };
        }

        if (data.status === 'error') {
          const error = JSON.stringify(data.result);
          const errData = JSON.parse(error);
          errData.message = data.result.message;
          data.result = errData;
        }
        this.response(res, data);
      } catch (e) {
        this.error(res, e);
      }
    });
    this.listen();

    await this.initDB();
    try {
      await this.initAPI();
    } catch (e) {
      logger.error(e);
    }

    try {
      await this.initIOT();
    } catch (e) {
      logger.error(e);
    }
  }

  public async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ORACLE_CLIENT_DIR) {
        logger.info('ORACLE_CLIENT_DIR : ' + ORACLE_CLIENT_DIR);
        try {
          oracledb.initOracleClient({
            libDir: ORACLE_CLIENT_DIR,
          });
        } catch (e) {
          console.log(e);
          reject(e);
        }
      } else if (LD_LIBRARY_PATH) {
        logger.info('LD_LIBRARY_PATH : ' + LD_LIBRARY_PATH);
        try {
          oracledb.initOracleClient();
        } catch (e) {
          console.log(e);
          reject(e);
        }
      }

      App.agentConfig = new AgentConfig(AGENT_DB_PATH, async () => {
        const dbList = await App.agentConfig.getDBList();
        for (let i = 0, len = dbList.length; i < len; i++) {
          try {
            await DBManager.addDB(dbList[i]);
          } catch (e) {
            logger.error(e);
            reject(e);
          }
        }

        resolve();
      });
    });
  }

  public async initIOT() {
    const iotList = await App.agentConfig.getAllIOT();
    for (let i = 0, len = iotList.length; i < len; i++) {
      try {
        await IOTManager.add(iotList[i]);
      } catch (e) {
        logger.error(e);
      }
    }
  }

  public async initAPI() {
    if (USE_MYBATIS !== '1') {
      return;
    }
    const apiList = await App.agentConfig.getAPIListAll();
    for (let i = 0, len = apiList.length; i < len; i++) {
      try {
        App.registerAPI(apiList[i]);
      } catch (e) {
        logger.error(e);
      }
    }
  }

  public generateJWTKey() {
    try {
      const token = jwt.sign({ id: SECRET_KEY }, fs.readFileSync(JWT_PRIVATE_KEY_PATH!), {
        algorithm: 'RS256',
      });
      logger.info('Add authorization to Headers');
      logger.info(`authorization: ${token}`);
      this.app.use(jwtMiddleware);
    } catch (e) {
      console.error(e);
    }
  }

  private initializeMiddlewares() {
    this.app.use(morgan('combined', { stream }));
    this.app.use(hpp());
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
    this.app.use(errorMiddleware);
  }

  public listen() {
    https
      .createServer(
        {
          key: fs.readFileSync(TLS_KEY!),
          cert: fs.readFileSync(TLS_CERT!),
        },
        this.app,
      )
      .listen(this.port);
  }

  public error(res: Response, err: any, status: number = 401) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ error: err }));
  }

  public response(res: Response, data: SCLABResponseData, status: number = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data));
  }
}
