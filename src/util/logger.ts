import fs from 'fs-extra';
import path from 'path';
import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import { LOG_DIR, LOG_LEVEL } from '../config';

// logs dir
let logDir = '';
if (LOG_DIR) {
  const absPath = path.resolve(LOG_DIR.startsWith('.') ? process.cwd() : '', LOG_DIR);
  if (!fs.existsSync(absPath)) {
    console.log('create log folder : ' + absPath);
    fs.mkdirs(absPath, {
      mode: parseInt('755', 8),
    });
  }
  logDir = absPath;
}

// Define log format
const logFormat = winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`);

/*
 * Log Level
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */
let logger: winston.Logger;
if (logDir) {
  logger = winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      logFormat,
    ),
    transports: [
      // debug log setting
      new winstonDaily({
        level: LOG_LEVEL || 'debug',
        datePattern: 'YYYY-MM-DD',
        dirname: logDir + '/debug', // log file /logs/debug/*.log in save
        filename: `%DATE%.log`,
        maxFiles: 31,
        json: false,
        zippedArchive: true,
      }),
      // error log setting
      new winstonDaily({
        level: 'error',
        datePattern: 'YYYY-MM-DD',
        dirname: logDir + '/error', // log file /logs/error/*.log in save
        filename: `%DATE%.log`,
        maxFiles: 31, // 31 Days saved
        handleExceptions: true,
        json: false,
        zippedArchive: true,
      }),
    ],
  });
} else {
  logger = winston.createLogger({
    level: LOG_LEVEL || 'debug',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      logFormat,
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });
}

const stream = {
  write: (message: string) => {
    console.info(message.substring(0, message.lastIndexOf('\n')));
  },
};

// override console log
if (process.env.NODE_ENV === 'production') {
  logger.exitOnError = false;
  console.log = (...args) => logger.info.call(logger, ...args);
  console.info = (...args) => logger.info.call(logger, ...args);
  console.warn = (...args) => {
    args.push(JSON.stringify(new Error().stack));
    logger.warn.call(logger, ...args);
  };
  console.error = (...args) => {
    args.push(JSON.stringify(new Error().stack));
    logger.error.call(logger, ...args);
  };
  console.debug = (...args) => logger.debug.call(logger, ...args);
}

export { logger, stream };
