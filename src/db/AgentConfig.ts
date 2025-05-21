import { Database } from 'sqlite3';
import type { API, DB, HISTORY, IOT } from '../types';

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
    return await this.all<DB>('SELECT * FROM DB', [], AgentConfig.parse);
  }

  async getAPIList(name: string): Promise<Array<API>> {
    return await this.all<API>('SELECT * FROM API WHERE name = ?', [name], AgentConfig.parseAPI);
  }

  async insertDatabase(db: DB): Promise<void> {
    await this.run(`INSERT INTO DB (name, type, options) VALUES (?, ?, ?)`, [db.name, db.type, JSON.stringify(db.options)]);
  }

  async updateDatabase(db: DB): Promise<void> {
    return await this.run(`UPDATE DB SET name = ?, options = ? WHERE name = ?`, [db.name, JSON.stringify(db.options), db.oldName!]);
  }

  async getDatabase(dbName: string): Promise<DB> {
    return await this.get<DB>(`SELECT * FROM DB WHERE name = ?`, [dbName], AgentConfig.parse);
  }

  async deleteDatabase(dbName: string): Promise<void> {
    await this.run(`DELETE FROM HISTORY WHERE name = ?`, [dbName]);
    await this.run(`DELETE FROM API WHERE name = ?`, [dbName]);
    await this.run(`DELETE FROM IOT WHERE name = ?`, [dbName]);
    await this.run(`DELETE FROM DB WHERE name = ?`, [dbName]);
  }

  async setupTables(): Promise<void> {
    await this.exec(`PRAGMA foreign_keys = ON`);
    await this.run(
      `CREATE TABLE IF NOT EXISTS DB (
        name    TEXT    PRIMARY KEY,
        type    TEXT    NOT NULL,
        options TEXT    NOT NULL
    )`,
      [],
    );
    await this.run(
      `
    CREATE TABLE IF NOT EXISTS API (
        path	          TEXT	  PRIMARY KEY,
        name            TEXT    NOT NULL,
        SQL	            TEXT	  NOT NULL,
        injectionCheck  BOOLEAN NOT NULL,
        desc            TEXT    NULL,
        FOREIGN KEY (name) REFERENCES DB(name)
    )`,
      [],
    );
    await this.run(
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
      [],
    );
    await this.run(
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
      [],
    );
  }

  async insertIOT(iot: IOT): Promise<void> {
    await this.run(`INSERT INTO IOT (topic, name, SQL, interval, broker, desc) VALUES (?, ?, ?, ?, ?, ?)`, [
      iot.topic,
      iot.name,
      iot.SQL,
      iot.interval,
      JSON.stringify(iot.broker),
      iot.desc,
    ]);
    await this.insertHistory({
      name: iot.name,
      topic: iot.topic,
      SQL: iot.SQL,
      desc: iot.desc,
      createdAt: Date.now(),
    });
  }

  async updateIOT(iot: IOT): Promise<void> {
    await this.run(
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
    );

    await this.insertHistory({
      name: iot.name,
      topic: iot.topic,
      SQL: iot.SQL,
      desc: iot.desc,
      createdAt: Date.now(),
    });
  }

  async deleteIOT(topic: string): Promise<void> {
    await this.run('DELETE FROM HISTORY WHERE topic = ?', [topic]);
    await this.run('DELETE FROM IOT WHERE topic = ?', [topic]);
  }

  async getIOT(topic: string): Promise<IOT> {
    return this.get<IOT>('SELECT * FROM IOT WHERE topic = ?', [topic], AgentConfig.parseIOT);
  }

  async getIOTList(name: string): Promise<IOT[]> {
    return await this.all<IOT>('SELECT * FROM IOT WHERE name = ?', [name], AgentConfig.parseIOT);
  }

  async getAllIOT(): Promise<IOT[]> {
    return await this.all<IOT>('SELECT * FROM IOT', [], AgentConfig.parseIOT);
  }

  async getHistoryList(name: string, path: string | null, topic: string | null): Promise<HISTORY[]> {
    const sql = `
        SELECT * FROM HISTORY
        WHERE name = ?
          AND (path = ? OR (? IS NULL AND path IS NULL))
          AND (topic = ? OR (? IS NULL AND topic IS NULL))
        ORDER BY createdAt DESC
      `;
    const params = [name, path, path, topic, topic];
    return await this.all<HISTORY>(sql, params, AgentConfig.parseHistory);
  }

  async insertAPI(api: API): Promise<void> {
    await this.run(`INSERT INTO API (path, name, SQL, injectionCheck, desc) VALUES (?, ?, ?, ?, ?)`, [
      api.path,
      api.name,
      api.SQL,
      api.injectionCheck,
      api.desc,
    ]);

    await this.insertHistory({
      name: api.name,
      path: api.path,
      SQL: api.SQL,
      desc: api.desc,
      createdAt: Date.now(),
    });
  }

  async updateAPI(api: API): Promise<void> {
    await this.run(
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
    );
    await this.insertHistory({
      name: api.name,
      path: api.path,
      SQL: api.SQL,
      desc: api.desc,
      createdAt: Date.now(),
    });
  }

  async deleteAPI(path: string): Promise<void> {
    await this.run('DELETE FROM HISTORY WHERE path = ?', [path]);
    await this.run('DELETE FROM API WHERE path = ?', [path]);
  }

  async getAPI(path: string): Promise<API> {
    return await this.get<API>('SELECT * FROM API WHERE path = ?', [path], AgentConfig.parseAPI);
  }

  async getAPIListAll(): Promise<API[]> {
    return await this.all<API>('SELECT * FROM API', [], AgentConfig.parseAPI);
  }

  async insertHistory(history: HISTORY): Promise<void> {
    const { name, path, topic, SQL, desc, createdAt } = history;

    return await this.run(`INSERT INTO HISTORY (name, path, topic, SQL, desc, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [
      name,
      path ?? null,
      topic ?? null,
      SQL,
      desc ?? null,
      createdAt,
    ]);
  }

  async deleteHistory(id: number): Promise<void> {
    return await this.run('DELETE FROM HISTORY WHERE id = ?', [id]);
  }

  /**
   * Delete all history entries matching name, path, and topic.
   */
  async deleteHistoryAll(name: string, path: string | null, topic: string | null): Promise<void> {
    const sql = `
        DELETE FROM HISTORY
        WHERE name = ?
          AND (path = ? OR (? IS NULL AND path IS NULL))
          AND (topic = ? OR (? IS NULL AND topic IS NULL))
      `;
    const params = [name, path, path, topic, topic];
    return await this.run(sql, params);
  }

  async run(sql: string, params: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async get<T>(sql: string, params: any[], parser: (obj: any) => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        if (!res) {
          reject('Removed Data');
          return;
        }

        resolve(parser(res));
      });
    });
  }

  async all<T>(sql: string, params: any[], parser: (obj: any) => T): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, function (err, res) {
        if (err) {
          reject(err);
          return;
        }

        if (!res) {
          reject('Removed Data');
          return;
        }

        resolve(
          res.map((row: any) => {
            return parser(row);
          }),
        );
      });
    });
  }

  async exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}
