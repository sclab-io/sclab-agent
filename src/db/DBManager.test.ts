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

  describe('result size guard', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('rejects unlimited results over MAX_RESULT_ROWS', () => {
      jest.spyOn(DBManager, 'getMaxResultRows').mockReturnValue(3);
      expect(() => DBManager.assertResultSize([1, 2, 3, 4], 0)).toThrow('Result set too large');
    });

    test('allows results within the cap, limited queries, non-arrays and disabled cap', () => {
      const spy = jest.spyOn(DBManager, 'getMaxResultRows').mockReturnValue(3);
      expect(() => DBManager.assertResultSize([1, 2, 3], 0)).not.toThrow();
      expect(() => DBManager.assertResultSize([1, 2, 3, 4], 10)).not.toThrow();
      expect(() => DBManager.assertResultSize({ affectedRows: 9 }, 0)).not.toThrow();
      spy.mockReturnValue(0);
      expect(() => DBManager.assertResultSize(new Array(10), 0)).not.toThrow();
    });

    test('defaults to 100000 rows when MAX_RESULT_ROWS is unset', () => {
      expect(DBManager.getMaxResultRows()).toBe(100000);
      expect(() => DBManager.assertResultSize(new Array(100000), 0)).not.toThrow();
      expect(() => DBManager.assertResultSize(new Array(100001), 0)).toThrow('Result set too large');
    });

    test('runSQL applies the guard to executed results', async () => {
      jest.spyOn(DBManager, 'getMaxResultRows').mockReturnValue(2);
      jest.spyOn(DBManager as any, 'executeSQL').mockResolvedValue([1, 2, 3]);
      await expect(DBManager.runSQL('x', 'SHOW TABLES')).rejects.toThrow('Result set too large');
    });
  });
});
