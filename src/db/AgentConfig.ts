import { Database } from 'sqlite3';
import type { API, DB, IOT } from '../types';
import { AGENT_DB_PATH } from '../config';

export class AgentConfig {
  static parse(row: any): DB {
    if (!row) {
      throw new Error('Cannot found row data');
    }
    return {
      name: row.name,
      type: row.type,
      options: JSON.parse(row.options),
    };
  }

  static parseAPI(row: any): API {
    if (!row) {
      throw new Error('Cannot found row data');
    }
    return {
      path: row.path,
      name: row.name,
      SQL: row.SQL,
      injectionCheck: !!row.injectionCheck,
      desc: row.desc,
    };
  }

  static parseIOT(row: any): IOT {
    if (!row) {
      throw new Error('Cannot found row data');
    }
    return {
      topic: row.topic,
      name: row.name,
      SQL: row.SQL,
      interval: row.interval,
      broker: JSON.parse(row.broker),
    };
  }

  public db: Database;
  constructor(dbPath: string = AGENT_DB_PATH!) {
    this.db = new Database(dbPath);
    this.setupTables();
  }

  async getDBList(): Promise<Array<DB>> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM DB', function (err, rows) {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          rows.map((row: any) => {
            return AgentConfig.parse(row);
          }),
        );
      });
    });
  }

  async getAPIList(name: string): Promise<Array<API>> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM API WHERE name = ?', [name], function (err, rows) {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          rows.map((row: any) => {
            return AgentConfig.parseAPI(row);
          }),
        );
      });
    });
  }

  insertDatabase(db: DB): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO DB (name, type, options) VALUES (?, ?, ?)`, [db.name, db.type, JSON.stringify(db.options)], function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  updateDatabase(db: DB): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE DB SET name = ?, options = ? WHERE name = ?`, [db.name, JSON.stringify(db.options), db.oldName!], function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  getDatabase(dbName: string): Promise<DB> {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM DB WHERE name = ?`, [dbName], function (err, res) {
        if (err) {
          reject(err);
          return;
        }
        if (!res) {
          reject('Removed database');
          return;
        }
        resolve(AgentConfig.parse(res));
      });
    });
  }

  deleteDatabase(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 데이터 베이스에 할당된 API, IOT 삭제
      this.db.run(`DELETE FROM API WHERE name = ?`, [dbName], err => {
        if (err) {
          reject(err);
          return;
        }

        this.db.run(`DELETE FROM IOT WHERE name = ?`, [dbName], err => {
          if (err) {
            reject(err);
            return;
          }

          this.db.run(`DELETE FROM DB WHERE name = ?`, [dbName], function (err) {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      });
    });
  }

  setupTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(`PRAGMA foreign_keys = ON`, () => {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS DB ( 
            name    TEXT    PRIMARY KEY, 
            type    TEXT    NOT NULL, 
            options TEXT    NOT NULL
        )`,
        );
        this.db.run(`
            CREATE TABLE IF NOT EXISTS API (
                path	          TEXT	  PRIMARY KEY,
                name            TEXT    NOT NULL,
                SQL	            TEXT	  NOT NULL,
                injectionCheck  BOOLEAN NOT NULL,
                desc            TEXT    NULL,
                FOREIGN KEY (name) REFERENCES DB(name)
            )
            `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS IOT (
                topic	      TEXT	    PRIMARY KEY,
                name        TEXT      NOT NULL,
                SQL	        TEXT	    NOT NULL,
                interval    INTEGER   NOT NULL,
                broker      TEXT      NOT NULL,
                desc        TEXT    NULL,
                FOREIGN KEY (name) REFERENCES DB(name)
            )
            `);
      });
    });
  }

  insertIOT(iot: IOT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO IOT (topic, name, SQL, interval, broker, desc) VALUES (?, ?, ?, ?, ?, ?)`,
        [iot.topic, iot.name, iot.SQL, iot.interval, JSON.stringify(iot.broker), iot.desc],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        },
      );
    });
  }

  updateIOT(iot: IOT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `
        UPDATE IOT
        SET
          topic = ?,
          name = ?,
          SQL = ?,
          interval = ?,
          broker = ?,
          desc = ?
        WHERE
          topic = ?
        `,
        [iot.topic, iot.name, iot.SQL, iot.interval, JSON.stringify(iot.broker), iot.desc, iot.oldTopic!],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        },
      );
    });
  }

  deleteIOT(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM IOT WHERE topic = ?', [topic], function (err) {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  getIOT(topic: string): Promise<IOT> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM IOT WHERE topic = ?', [topic], function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        if (!res) {
          reject('Removed topic.');
          return;
        }
        resolve(AgentConfig.parseIOT(res));
      });
    });
  }

  getIOTList(name: string): Promise<IOT[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM IOT WHERE name = ?', [name], function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        resolve(
          res.map((row: any) => {
            return AgentConfig.parseIOT(row);
          }),
        );
      });
    });
  }

  getAllIOT(): Promise<IOT[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM IOT', function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        resolve(
          res.map((row: any) => {
            return AgentConfig.parseIOT(row);
          }),
        );
      });
    });
  }

  insertAPI(api: API): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO API (path, name, SQL, injectionCheck, desc) VALUES (?, ?, ?, ?, ?)`,
        [api.path, api.name, api.SQL, api.injectionCheck, api.desc],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        },
      );
    });
  }

  updateAPI(api: API): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `
      UPDATE API 
      SET 
        path = ?, 
        name = ?, 
        SQL = ?, 
        injectionCheck = ?,
        desc = ?
      WHERE path = ?
      `,
        [api.path, api.name, api.SQL, api.injectionCheck, api.desc, api.oldPath!],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        },
      );
    });
  }

  deleteAPI(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM API WHERE path = ?', [path], function (err) {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  getAPI(path: string): Promise<API> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM API WHERE path = ?', [path], function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        if (!res) {
          reject('Removed API');
          return;
        }

        resolve(AgentConfig.parseAPI(res));
      });
    });
  }

  getAPIListAll(): Promise<API[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM API', function (err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          res.map((row: any) => {
            return AgentConfig.parseAPI(row);
          }),
        );
      });
    });
  }
}
