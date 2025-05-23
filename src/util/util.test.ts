import { isEmpty, getPlaceHolders, replaceString, hasSql } from './util';

describe('util', () => {
  describe('isEmpty', () => {
    test('returns true for null, undefined, empty string, empty object', () => {
      expect(isEmpty(null as any)).toBe(true);
      expect(isEmpty(undefined as any)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty({})).toBe(true);
    });

    test('returns false for non-empty values', () => {
      expect(isEmpty('text')).toBe(false);
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });

  describe('getPlaceHolders', () => {
    test('extracts placeholders from string', () => {
      const sql = 'SELECT ${id}, #{name} FROM table';
      expect(getPlaceHolders(sql)).toEqual(['id', 'name']);
    });

    test('returns empty array when no placeholders', () => {
      expect(getPlaceHolders('SELECT *')).toEqual([]);
    });
  });

  describe('replaceString', () => {
    test('replaces placeholders with values', () => {
      const sql = 'SELECT ${id}, #{name}';
      const map = { id: '1', name: 'John' };
      expect(replaceString(sql, map)).toBe('SELECT 1, John');
    });

    test('leaves unmatched placeholders unchanged', () => {
      const sql = 'SELECT ${id}, #{age}';
      const map = { id: '2' };
      expect(replaceString(sql, map)).toBe('SELECT 2, undefined');
    });
  });

  describe('hasSql', () => {
    test('detects SQL injection patterns', () => {
      expect(hasSql('1 OR 1=1')).toBe(true);
      expect(hasSql("'; DROP TABLE users; --")).toBe(true);
    });

    test('returns false for safe strings', () => {
      expect(hasSql('normaltext')).toBe(false);
    });
  });
});
