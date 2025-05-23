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

  describe('limit clause helpers', () => {
    test('hasLimitClause detects LIMIT and TOP syntax', () => {
      expect(DBManager.hasLimitClause('SELECT * FROM t LIMIT 1')).toBe(true);
      expect(DBManager.hasLimitClause('SELECT TOP 5 * FROM t')).toBe(true);
      expect(DBManager.hasLimitClause('SELECT * FROM t')).toBe(false);
    });

    test('removeLimitClause strips trailing LIMIT clause', () => {
      expect(DBManager.removeLimitClause('SELECT * FROM t LIMIT 10')).toBe('SELECT * FROM t');
      expect(DBManager.removeLimitClause('SELECT * FROM t LIMIT 10;')).toBe('SELECT * FROM t');
    });

    test('ensureLimitClause adds LIMIT or TOP as needed', () => {
      expect(DBManager.ensureLimitClause('SELECT * FROM t', 3)).toBe('SELECT * FROM t LIMIT 3');
      expect(DBManager.ensureLimitClause('SELECT * FROM t LIMIT 2', 5)).toBe('SELECT * FROM t LIMIT 2');
      expect(DBManager.ensureLimitClause('SELECT * FROM t', 4, 'sqlserver')).toBe('SELECT TOP 4 * FROM t');
      expect(DBManager.ensureLimitClause('SELECT TOP 2 * FROM t', 5, 'sqlserver')).toBe('SELECT TOP 2 * FROM t');
    });
  });
});
