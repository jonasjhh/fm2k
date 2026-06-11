import { sfx, fmtDate, fmt } from './formatting';

describe('sfx (ordinal suffix):', () => {
  it('given 1/2/3 then returns st/nd/rd', () => {
    expect(sfx(1)).toBe('st');
    expect(sfx(2)).toBe('nd');
    expect(sfx(3)).toBe('rd');
  });

  it('given the 11-13 teens then returns th regardless of last digit', () => {
    expect(sfx(11)).toBe('th');
    expect(sfx(12)).toBe('th');
    expect(sfx(13)).toBe('th');
    expect(sfx(111)).toBe('th');
    expect(sfx(212)).toBe('th');
  });

  it('given 21/22/23 then returns st/nd/rd again', () => {
    expect(sfx(21)).toBe('st');
    expect(sfx(22)).toBe('nd');
    expect(sfx(23)).toBe('rd');
  });

  it('given other digits then returns th', () => {
    expect(sfx(4)).toBe('th');
    expect(sfx(10)).toBe('th');
    expect(sfx(100)).toBe('th');
  });
});

describe('fmtDate:', () => {
  it('given a game date then formats as "day Mon year" using the month name', () => {
    expect(fmtDate({ day: 5, month: 3, year: 2026 })).toBe('5 Mar 2026');
    expect(fmtDate({ day: 28, month: 12, year: 2025 })).toBe('28 Dec 2025');
    expect(fmtDate({ day: 1, month: 1, year: 2000 })).toBe('1 Jan 2000');
  });
});

describe('fmt:', () => {
  it('given a fractional number then rounds to the nearest integer', () => {
    expect(fmt(5.4)).toBe('5');
    expect(fmt(5.6)).toBe('6');
    expect(fmt(0.49)).toBe('0');
  });
});
