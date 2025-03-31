// hasSql.test.ts
import { hasSql } from './util';

describe('hasSql 함수 테스트', () => {
  it('null 또는 undefined 입력에 대해 false를 반환해야 함', () => {
    expect(hasSql(null as unknown as string)).toBe(false);
    expect(hasSql(undefined as unknown as string)).toBe(false);
  });

  it('정상적인 문자열 입력은 false를 반환해야 함', () => {
    expect(hasSql('Hello, world!')).toBe(false);
    expect(hasSql('This is a safe string.')).toBe(false);
  });

  it('SQL 메타 문자들이 포함된 문자열은 true를 반환해야 함', () => {
    expect(hasSql("'")).toBe(true);
    expect(hasSql('%27')).toBe(true);
    expect(hasSql('--')).toBe(true);
    expect(hasSql('%23')).toBe(true);
    expect(hasSql('#')).toBe(true);
  });

  it('비교 연산자를 포함하는 SQL 인젝션 패턴을 감지해야 함', () => {
    expect(hasSql("= '")).toBe(true);
    expect(hasSql("%3D'")).toBe(true);
  });

  it('논리 연산자 (or/and)를 사용하는 패턴을 감지해야 함', () => {
    expect(hasSql('1 or 1=1')).toBe(true);
    expect(hasSql('1 and 1=1')).toBe(true);
  });

  it('SQL 예약어가 포함된 경우를 감지해야 함', () => {
    expect(hasSql('SELECT * FROM users')).toBe(true);
    expect(hasSql('DROP TABLE users')).toBe(true);
    expect(hasSql('insert into table')).toBe(true);
  });

  it('union 패턴을 감지해야 함', () => {
    expect(hasSql("'union")).toBe(true);
    expect(hasSql('%27union')).toBe(true);
  });

  // --- 추가 테스트 케이스 ---
  it('단일 인젝션 패턴: " OR " 및 비교 연산자 포함', () => {
    expect(hasSql("' OR '1'='1")).toBe(true);
    expect(hasSql('1 OR 1=1')).toBe(true);
    expect(hasSql('1 AND 1=1')).toBe(true);
  });

  it('예약어가 단어의 일부로 포함되어 있어 false가 반환되어야 하는 경우', () => {
    // "select"가 "selection"의 일부로 등장하면 매칭되지 않아야 함
    expect(hasSql('selection')).toBe(false);
    // "update"가 "updateable"의 일부로 등장할 경우 false
    expect(hasSql('updateable')).toBe(false);
  });

  it('URL 인코딩된 패턴 테스트', () => {
    // URL 인코딩된 작은 따옴표와 혼합 케이스 확인
    expect(hasSql('abc%27def')).toBe(true);
    expect(hasSql('%27Union%20Select')).toBe(true);
  });

  it('문자열 내 다른 단어의 일부인 경우 false 반환', () => {
    // "orphan"은 "or"가 별도의 단어로 사용되지 않으므로 false
    expect(hasSql('orphan')).toBe(false);
    // "anderson" 역시 false여야 함
    expect(hasSql('anderson')).toBe(false);
  });

  it('불완전한 패턴 (단순 비교문)인 경우 false 반환', () => {
    // 단순 "=" 기호만 있는 경우는 위험 패턴으로 판단하지 않음
    expect(hasSql('1=2')).toBe(false);
  });

  it('혼합 SQL 인젝션 패턴 테스트', () => {
    const testString = '1 or 1=1; drop table users';
    expect(hasSql(testString)).toBe(true);
  });

  it('복합 표현 테스트', () => {
    const injectionString = "admin'-- SELECT * FROM users WHERE username='admin'";
    expect(hasSql(injectionString)).toBe(true);
  });

  it('대소문자 무시 테스트', () => {
    expect(hasSql('SeLeCt * FrOm users')).toBe(true);
    expect(hasSql('1 Or 1=1')).toBe(true);
  });

  it('문자열 끝에 공백 포함 테스트', () => {
    // 문자열 끝의 공백이 결과에 영향을 주지 않아야 함
    expect(hasSql('1 or 1=1   ')).toBe(true);
  });
});
