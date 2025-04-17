import { ManageHandler } from './ManageHandler';

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
});