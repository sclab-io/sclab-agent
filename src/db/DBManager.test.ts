import { DBManager } from './DBManager';

describe('DBManager', () => {
  afterEach(() => {
    DBManager.dbMap.clear();
  });

  test('getClient throws error when not exists', () => {
    expect(() => DBManager.getClient('no')).toThrow('no client does not exists in DBManager.dbMap');
  });

  test('getClient returns stored client', () => {
    const client = { client: {}, type: 'test' } as any;
    DBManager.dbMap.set('name', client);
    expect(DBManager.getClient('name')).toBe(client);
  });

  test('getKeepAliveTimeoutId returns undefined when no tunnel', () => {
    expect(DBManager.getKeepAliveTimeoutId(undefined, 'name')).toBeUndefined();
  });
});