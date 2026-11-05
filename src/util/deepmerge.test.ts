// jest-config depends on deepmerge, which has no upstream fix for prototype poisoning
// (GHSA-gcqx-w48m-w2h4). package.json overrides it with the patched copy in vendor/deepmerge.
// This test fails if that override is lost.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deepmerge = require('deepmerge');

describe('patched deepmerge', () => {
  const evil = JSON.parse('{"__proto__":{"polluted":true},"a":1}');

  test('does not let a __proto__ key in the source pollute the result', () => {
    expect(deepmerge({ a: 0 }, evil).polluted).toBeUndefined();
  });

  test('does not let a __proto__ key in the target pollute the result', () => {
    expect(deepmerge(evil, { b: 2 }).polluted).toBeUndefined();
  });

  test('still merges normally', () => {
    expect(deepmerge({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({ a: { x: 1, y: 2 } });
    expect(deepmerge([1], [2])).toEqual([1, 2]);
  });
});
