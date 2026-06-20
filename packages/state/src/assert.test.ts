import { assertDefined } from './assert.ts';

describe('assertDefined:', () => {
  test('returns the value unchanged when it is defined', () => {
    expect(assertDefined('value', 'should not throw')).toBe('value');
  });

  test('returns falsy-but-defined values unchanged (0, "", false)', () => {
    expect(assertDefined(0, 'msg')).toBe(0);
    expect(assertDefined('', 'msg')).toBe('');
    expect(assertDefined(false, 'msg')).toBe(false);
  });

  test('throws an Error with the given message when value is null', () => {
    expect(() => assertDefined(null, 'value was null')).toThrow('value was null');
  });

  test('throws an Error with the given message when value is undefined', () => {
    expect(() => assertDefined(undefined, 'value was undefined')).toThrow('value was undefined');
  });

  test('the thrown error is an instance of Error', () => {
    expect(() => assertDefined(null, 'msg')).toThrow(Error);
  });
});
