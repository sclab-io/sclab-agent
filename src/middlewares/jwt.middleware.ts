import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { JWT_PUBLIC_KEY_PATH, SECRET_KEY } from '../config';

let pubKey: Buffer;
try {
  pubKey = fs.readFileSync(JWT_PUBLIC_KEY_PATH!);
} catch (e) {
  console.info('JWT_PUBLIC_KEY_PATH is not set');
  console.info('JWT_PUBLIC_KEY_PATH : ' + JWT_PUBLIC_KEY_PATH);
}

export const jwtMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers && req.headers.authorization) {
    let key: string = req.headers.authorization;
    if (key.startsWith('JWT ')) {
      key = key.replace('JWT ', '');
    }
    jwt.verify(key, pubKey, function (err, decode: any) {
      if (err !== null || (decode && decode.id !== SECRET_KEY)) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
        });
        res.end(
          JSON.stringify({
            message: 'The JWT token value is malformed. Please check the JWT token value and verify the key in the log.',
          }),
        );
      } else {
        next();
      }
    });
  } else {
    res.writeHead(401, {
      'Content-Type': 'application/json',
    });
    res.end(
      JSON.stringify({
        message: 'authorization header is empty',
      }),
    );
  }
};
