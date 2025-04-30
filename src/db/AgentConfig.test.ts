import { AgentConfig } from './AgentConfig';
import type { DB, API, IOT, HISTORY } from '../types';

// Helper to create an AgentConfig instance with an in-memory SQLite database
async function createAgentConfig(): Promise<AgentConfig> {
  return new Promise<AgentConfig>((resolve, reject) => {
    const config = new AgentConfig(':memory:', (err?: any) => {
      if (err) reject(err);
      else resolve(config);
    });
  });
}

describe('AgentConfig History Logging', () => {
  let agentConfig: AgentConfig;

  beforeEach(async () => {
    agentConfig = await createAgentConfig();
  });

  test('insertAPI logs a history entry', async () => {
    const db: DB = { name: 'db1', type: 'test', options: {} };
    await agentConfig.insertDatabase(db);
    const api: API = {
      path: '/test-api',
      name: 'db1',
      SQL: 'SELECT 1',
      injectionCheck: false,
      desc: 'test api',
    };
    await agentConfig.insertAPI(api);
    const historyList: HISTORY[] = await agentConfig.getHistoryList('db1', api.path, null);
    expect(historyList).toHaveLength(1);
    const hist = historyList[0];
    expect(hist.name).toBe('db1');
    expect(hist.path).toBe(api.path);
    expect(hist.topic).toBeNull();
    expect(hist.SQL).toBe(api.SQL);
    expect(hist.desc).toBe(api.desc);
    expect(typeof hist.createdAt).toBe('number');
  });

  test('updateAPI logs an additional history entry', async () => {
    const db: DB = { name: 'db1', type: 'test', options: {} };
    await agentConfig.insertDatabase(db);
    const api: API = {
      path: '/test-api',
      name: 'db1',
      SQL: 'SELECT 1',
      injectionCheck: false,
      desc: 'initial',
    };
    await agentConfig.insertAPI(api);
    const updated: API = {
      path: '/test-api',
      name: 'db1',
      SQL: 'SELECT 2',
      injectionCheck: false,
      desc: 'updated',
      oldPath: api.path,
    };
    await agentConfig.updateAPI(updated);
    const historyList: HISTORY[] = await agentConfig.getHistoryList('db1', api.path, null);
    expect(historyList).toHaveLength(2);
    const [first, second] = historyList;
    expect(first.SQL).toBe('SELECT 1');
    expect(second.SQL).toBe('SELECT 2');
  });

  test('insertIOT logs a history entry', async () => {
    const db: DB = { name: 'db2', type: 'test', options: {} };
    await agentConfig.insertDatabase(db);
    const iot: IOT = {
      topic: 'topic1',
      name: 'db2',
      SQL: 'UPDATE t SET x=1',
      interval: 500,
      broker: { host: 'localhost', clientId: 'cid', id: 'uid', password: 'pwd' },
      desc: 'iot test',
    };
    await agentConfig.insertIOT(iot);
    const historyList: HISTORY[] = await agentConfig.getHistoryList('db2', null, iot.topic);
    expect(historyList).toHaveLength(1);
    const hist = historyList[0];
    expect(hist.name).toBe('db2');
    expect(hist.topic).toBe(iot.topic);
    expect(hist.path).toBeNull();
    expect(hist.SQL).toBe(iot.SQL);
    expect(hist.desc).toBe(iot.desc);
  });

  test('updateIOT logs an additional history entry', async () => {
    const db: DB = { name: 'db2', type: 'test', options: {} };
    await agentConfig.insertDatabase(db);
    const iot: IOT = {
      topic: 'topic1',
      name: 'db2',
      SQL: 'UPDATE t SET x=1',
      interval: 500,
      broker: { host: 'localhost', clientId: 'cid', id: 'uid', password: 'pwd' },
      desc: 'initial',
    };
    await agentConfig.insertIOT(iot);
    // remove initial history to prevent foreign key constraint on update
    await new Promise<void>((resolve, reject) => {
      agentConfig.db.run('DELETE FROM HISTORY WHERE topic = ?', [iot.topic], err => {
        if (err) reject(err);
        else resolve();
      });
    });
    const updated: IOT = {
      topic: 'topic2',
      name: 'db2',
      SQL: 'UPDATE t SET x=2',
      interval: 1000,
      broker: iot.broker,
      desc: 'updated',
      oldTopic: iot.topic,
    };
    await agentConfig.updateIOT(updated);
    const historyNew: HISTORY[] = await agentConfig.getHistoryList('db2', null, updated.topic);
    expect(historyNew).toHaveLength(1);
    expect(historyNew[0].SQL).toBe(updated.SQL);
  });
});

describe('AgentConfig CRUD operations', () => {
  let agentConfig: AgentConfig;
  beforeEach(async () => {
    agentConfig = await createAgentConfig();
  });

  test('DB operations: insert, list, get, update, delete', async () => {
    const db: DB = { name: 'db1', type: 'type1', options: {} };
    // insert and list
    await agentConfig.insertDatabase(db);
    let dbList = await agentConfig.getDBList();
    expect(dbList).toEqual([db]);
    // get
    const got = await agentConfig.getDatabase('db1');
    expect(got).toEqual(db);
    // update
    const updated: DB = { oldName: 'db1', name: 'db2', type: 'type1', options: { host: 'h2' } } as any;
    await agentConfig.updateDatabase(updated);
    dbList = await agentConfig.getDBList();
    expect(dbList).toEqual([{ name: 'db2', type: 'type1', options: { host: 'h2' } }]);
    await expect(agentConfig.getDatabase('db1')).rejects.toEqual('Removed database');
    const got2 = await agentConfig.getDatabase('db2');
    expect(got2).toEqual({ name: 'db2', type: 'type1', options: { host: 'h2' } });
    // delete
    await agentConfig.deleteDatabase('db2');
    const empty = await agentConfig.getDBList();
    expect(empty).toEqual([]);
  });

  test('API operations: insert, list, get, listAll, update, delete', async () => {
    const db: DB = { name: 'dbA', type: 'typeA', options: {} };
    await agentConfig.insertDatabase(db);
    // initially empty
    let apis = await agentConfig.getAPIList('dbA');
    expect(apis).toEqual([]);
    // insert API
    const api: API = { path: '/p', name: 'dbA', SQL: 'Q', injectionCheck: true, desc: 'd' };
    await agentConfig.insertAPI(api);
    apis = await agentConfig.getAPIList('dbA');
    expect(apis).toEqual([api]);
    // getAPI
    const got = await agentConfig.getAPI('/p');
    expect(got).toEqual(api);
    // listAll
    const all = await agentConfig.getAPIListAll();
    expect(all).toEqual([api]);
    // update API
    const updated: API = { ...api, SQL: 'Q2', injectionCheck: false, desc: 'd2', oldPath: api.path } as any;
    await agentConfig.updateAPI(updated);
    const list2 = await agentConfig.getAPIList('dbA');
    expect(list2).toEqual([{ path: '/p', name: 'dbA', SQL: 'Q2', injectionCheck: false, desc: 'd2' }]);
    // delete API
    await agentConfig.deleteAPI('/p');
    const after = await agentConfig.getAPIList('dbA');
    expect(after).toEqual([]);
    await expect(agentConfig.getAPI('/p')).rejects.toEqual('Removed API');
  });

  test('IOT operations: insert, list, get, listAll, update, delete', async () => {
    const db: DB = { name: 'dbI', type: 'typeI', options: {} };
    await agentConfig.insertDatabase(db);
    // initially empty
    let iots = await agentConfig.getIOTList('dbI');
    expect(iots).toEqual([]);
    // insert IOT
    const broker = { host: 'h', clientId: 'c', id: 'i', password: 'p' };
    const iot: IOT = { topic: 't1', name: 'dbI', SQL: 'S', interval: 10, broker, desc: 'd' };
    await agentConfig.insertIOT(iot);
    iots = await agentConfig.getIOTList('dbI');
    expect(iots).toEqual([{ topic: 't1', name: 'dbI', SQL: 'S', interval: 10, broker }]);
    // getIOT
    const got = await agentConfig.getIOT('t1');
    expect(got).toEqual({ topic: 't1', name: 'dbI', SQL: 'S', interval: 10, broker });
    // listAll
    const all = await agentConfig.getAllIOT();
    expect(all).toEqual([{ topic: 't1', name: 'dbI', SQL: 'S', interval: 10, broker }]);
    // update IOT
    const updated: IOT = { ...iot, SQL: 'S2', interval: 20, broker, desc: 'd2', oldTopic: 't1' } as any;
    await agentConfig.updateIOT(updated);
    const list2 = await agentConfig.getIOTList('dbI');
    expect(list2).toEqual([{ topic: 't1', name: 'dbI', SQL: 'S2', interval: 20, broker }]);
    // delete IOT
    await agentConfig.deleteIOT('t1');
    const after = await agentConfig.getIOTList('dbI');
    expect(after).toEqual([]);
    await expect(agentConfig.getIOT('t1')).rejects.toEqual('Removed topic.');
  });
});