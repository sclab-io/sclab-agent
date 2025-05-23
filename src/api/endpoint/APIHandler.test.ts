// Mock config, App, and DBManager to isolate APIHandler tests
jest.mock('../../config', () => ({ USE_MYBATIS: '0' }));
jest.mock('../../app', () => ({
  App: { agentConfig: { getAPI: jest.fn() } },
}));
jest.mock('../../db/DBManager', () => ({
  DBManager: { runSQL: jest.fn() },
}));
import { APIHandler } from './APIHandler';
import { App } from '../../app';
import { DBManager } from '../../db/DBManager';

// Use real App and DBManager, stub methods directly

describe('APIHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REMOVE_KEYWORD_INJECTION_CHECK = '1';
  });

  test('returns error on SQL injection detect', async () => {
    // mock getAPI to return injectionCheck true
    (App.agentConfig.getAPI as jest.Mock).mockResolvedValue({
      path: '/test',
      SQL: 'SELECT 1',
      injectionCheck: true,
      name: 'test',
      desc: '',
    });
    const req = { path: '/test', query: { id: "' OR 1=1" }, headers: {} } as any;
    const res = await APIHandler.handle(req);
    expect(res.status).toBe('error');
    expect(res.result).toMatch(/SQL injection detect/);
  });

  test('handles normal request and returns result', async () => {
    // mock getAPI to return injectionCheck false and placeholder SQL
    (App.agentConfig.getAPI as jest.Mock).mockResolvedValue({
      path: '/test',
      SQL: 'SELECT ${id}',
      injectionCheck: false,
      name: 'test',
      desc: '',
    });
    // spy on runSQL
    jest.spyOn(DBManager, 'runSQL').mockResolvedValue([{ id: 1 }]);
    const req = { path: '/test', query: { id: '1' }, headers: {} } as any;
    const res = await APIHandler.handle(req);
    // expect the stubbed runSQL to produce the result
    expect(res).toEqual({ status: 'ok', result: [{ id: 1 }] });
  });
});
