import { ManageHandler } from './ManageHandler';
import { DBManager } from '../../db/DBManager';
import { App } from '../../app';
import { IOTManager } from '../../iot/IOTManager';
import { replaceString } from '../../util/util';

describe('ManageHandler', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('fallback to CommonHandler for unknown path', async () => {
    const req = { path: '/unknown', query: {} } as any;
    const res = await ManageHandler.handle(req);
    expect(res).toEqual({ status: 'error', result: 'Undefined api /unknown' });
  });

  test('dbGet route calls dbGet and returns result', async () => {
    jest.spyOn(ManageHandler, 'dbGet').mockResolvedValue({ status: 'ok', result: 'data' });
    const req = { path: '/manage/db/get', query: { name: 'db1' } } as any;
    const res = await ManageHandler.handle(req);
    expect(ManageHandler.dbGet).toHaveBeenCalledWith('db1');
    expect(res).toEqual({ status: 'ok', result: 'data' });
  });
  // additional route mapping tests
  test('dbDelete route calls dbDelete and returns result', async () => {
    jest.spyOn(ManageHandler, 'dbDelete').mockResolvedValue({ status: 'ok', result: 'deleted' });
    const req = { path: '/manage/db/delete', query: { name: 'db1' } } as any;
    const res = await ManageHandler.handle(req);
    expect(ManageHandler.dbDelete).toHaveBeenCalledWith('db1');
    expect(res).toEqual({ status: 'ok', result: 'deleted' });
  });

  test('dbList route calls dbList and returns result', async () => {
    jest.spyOn(ManageHandler, 'dbList').mockResolvedValue({ status: 'ok', result: ['db1', 'db2'] });
    const req = { path: '/manage/db/list', query: {} } as any;
    const res = await ManageHandler.handle(req);
    expect(ManageHandler.dbList).toHaveBeenCalled();
    expect(res).toEqual({ status: 'ok', result: ['db1', 'db2'] });
  });

  test('apiDelete route calls apiDelete and returns result', async () => {
    jest.spyOn(ManageHandler, 'apiDelete').mockResolvedValue({ status: 'ok', result: 'api deleted' });
    const req = { path: '/manage/api/delete', query: { path: '/test/api' } } as any;
    const res = await ManageHandler.handle(req);
    expect(ManageHandler.apiDelete).toHaveBeenCalledWith('/test/api');
    expect(res).toEqual({ status: 'ok', result: 'api deleted' });
  });

  test('iotGet route calls iotGet and returns result', async () => {
    jest.spyOn(ManageHandler, 'iotGet').mockResolvedValue({ status: 'ok', result: 'iot data' });
    const req = { path: '/manage/iot/get', query: { topic: 'topic1' } } as any;
    const res = await ManageHandler.handle(req);
    expect(ManageHandler.iotGet).toHaveBeenCalledWith('topic1');
    expect(res).toEqual({ status: 'ok', result: 'iot data' });
  });

  // static method tests
  test('getTable returns OK status and result', async () => {
    // mockResult should match a single Column object (name and type)
    const mockResult = { name: 'col1', type: 'varchar' };
    jest.spyOn(DBManager, 'getTable').mockResolvedValue(mockResult as any);
    const data = { name: 'db1', catalog: 'cat', schema: 'schema', table: 'table1' };
    const res = await ManageHandler.getTable(data);
    expect(DBManager.getTable).toHaveBeenCalledWith(data);
    expect(res).toEqual({ status: 'ok', result: mockResult });
  });

  test('runSQL returns OK status, result and sql', async () => {
    // use string placeholder and string param for replaceString
    const data = { name: 'db1', sql: 'SELECT * FROM t WHERE id = ${id}', params: { id: '5' } };
    const expectedSql = replaceString(data.sql, data.params as { [key: string]: string });
    const mockResult = [{ id: 5 }];
    jest.spyOn(DBManager, 'runSQL').mockResolvedValue(mockResult as any);
    const res = await ManageHandler.runSQL(data as any);
    expect(DBManager.runSQL).toHaveBeenCalledWith('db1', expectedSql, 10);
    expect(res).toEqual({ status: 'ok', result: mockResult, sql: expectedSql });
  });
});
