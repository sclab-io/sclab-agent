import { Database } from 'sqlite3';
import type { API, DB, HISTORY, IOT } from '../types';
import { logger } from '@/util/logger';
import { resolve } from 'path';

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

  static parseHistory(row: any): HISTORY {
    if (!row) {
      throw new Error('Cannot found row data');
    }
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      topic: row.topic,
      SQL: row.SQL,
      desc: row.desc,
      createdAt: row.createdAt,
    };
  }

  public db: Database;
  constructor(dbPath: string, callback: (err?: any) => void) {
    this.db = new Database(dbPath, async () => {
      try {
        await this.setupTables();
        if (callback) {
          callback();
        }
      } catch (e) {
        if (callback) {
          callback(e);
        }
      }
    });
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
      this.db.exec(`PRAGMA foreign_keys = ON`, err => {
        if (err) {
          reject(err);
          return;
        }
        this.db.run(
          `CREATE TABLE IF NOT EXISTS DB ( 
            name    TEXT    PRIMARY KEY, 
            type    TEXT    NOT NULL, 
            options TEXT    NOT NULL
        )`,
          err => {
            if (err) {
              reject(err);
              return;
            }
            this.db.run(
              `
            CREATE TABLE IF NOT EXISTS API (
                path	          TEXT	  PRIMARY KEY,
                name            TEXT    NOT NULL,
                SQL	            TEXT	  NOT NULL,
                injectionCheck  BOOLEAN NOT NULL,
                desc            TEXT    NULL,
                FOREIGN KEY (name) REFERENCES DB(name)
            )
            `,
              err => {
                if (err) {
                  reject(err);
                  return;
                }
                this.db.run(
                  `
                CREATE TABLE IF NOT EXISTS IOT (
                    topic	      TEXT	    PRIMARY KEY,
                    name        TEXT      NOT NULL,
                    SQL	        TEXT	    NOT NULL,
                    interval    INTEGER   NOT NULL,
                    broker      TEXT      NOT NULL,
                    desc        TEXT    NULL,
                    FOREIGN KEY (name) REFERENCES DB(name)
                )
                `,
                  err => {
                    if (err) {
                      reject(err);
                      return;
                    }

                    this.db.run(
                      `
                    CREATE TABLE IF NOT EXISTS HISTORY (
                        id	        INTEGER	  PRIMARY KEY,
                        name        TEXT      NOT NULL,
                        path        TEXT      NULL,
                        topic       TEXT      NULL,
                        SQL	        TEXT	    NOT NULL,
                        desc        TEXT      NULL,
                        createdAt   INTEGER   NOT NULL,
                        FOREIGN KEY (name) REFERENCES DB(name)
                        FOREIGN KEY (path) REFERENCES API(path),
                        FOREIGN KEY (topic) REFERENCES IOT(topic)
                    )
                    `,
                      err => {
                        if (err) {
                          reject(err);
                          return;
                        }

                        resolve();
                      },
                    );
                  },
                );
              },
            );
          },
        );
      });
    });
  }

  insertIOT(iot: IOT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO IOT (topic, name, SQL, interval, broker, desc) VALUES (?, ?, ?, ?, ?, ?)`,
        [iot.topic, iot.name, iot.SQL, iot.interval, JSON.stringify(iot.broker), iot.desc],
        err => {
          if (err) {
            reject(err);
            return;
          }

          this.insertHistory({
            name: iot.name,
            topic: iot.topic,
            SQL: iot.SQL,
            desc: iot.desc,
            createdAt: Date.now(),
          })
            .then(resolve)
            .catch(reject);
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
        err => {
          if (err) {
            reject(err);
            return;
          }

          this.insertHistory({
            name: iot.name,
            topic: iot.topic,
            SQL: iot.SQL,
            desc: iot.desc,
            createdAt: Date.now(),
          })
            .then(resolve)
            .catch(reject);
        },
      );
    });
  }

  deleteIOT(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM HISTORY WHERE topic = ?', [topic], err => {
        if (err) {
          reject(err);
          return;
        }
        this.db.run('DELETE FROM IOT WHERE topic = ?', [topic], function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
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

  getHistoryList(name: string, path: string | null, topic: string | null): Promise<HISTORY[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM HISTORY
        WHERE name = ?
          AND (path = ? OR (? IS NULL AND path IS NULL))
          AND (topic = ? OR (? IS NULL AND topic IS NULL))
      `;
      const params = [name, path, path, topic, topic];
      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map((row: any) => AgentConfig.parseHistory(row)));
      });
    });
  }

  insertAPI(api: API): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO API (path, name, SQL, injectionCheck, desc) VALUES (?, ?, ?, ?, ?)`,
        [api.path, api.name, api.SQL, api.injectionCheck, api.desc],
        err => {
          if (err) {
            reject(err);
            return;
          }

          this.insertHistory({
            name: api.name,
            path: api.path,
            SQL: api.SQL,
            desc: api.desc,
            createdAt: Date.now(),
          })
            .then(resolve)
            .catch(reject);
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
        err => {
          if (err) {
            reject(err);
            return;
          }

          this.insertHistory({
            name: api.name,
            path: api.path,
            SQL: api.SQL,
            desc: api.desc,
            createdAt: Date.now(),
          })
            .then(resolve)
            .catch(reject);
        },
      );
    });
  }

  deleteAPI(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM HISTORY WHERE path = ?', [path], err => {
        if (err) {
          reject(err);
          return;
        }

        this.db.run('DELETE FROM API WHERE path = ?', [path], function (err) {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
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

  insertHistory(history: HISTORY): Promise<void> {
    return new Promise((resolve, reject) => {
      const { name, path, topic, SQL, desc, createdAt } = history;

      this.db.run(
        `INSERT INTO HISTORY (name, path, topic, SQL, desc, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, path ?? null, topic ?? null, SQL, desc ?? null, createdAt],
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

  deleteHistory(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM HISTORY WHERE id = ?', [id], function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Delete all history entries matching name, path, and topic.
   */
  deleteHistoryAll(name: string, path: string | null, topic: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM HISTORY
        WHERE name = ?
          AND (path = ? OR (? IS NULL AND path IS NULL))
          AND (topic = ? OR (? IS NULL AND topic IS NULL))
      `;
      const params = [name, path, path, topic, topic];
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}
