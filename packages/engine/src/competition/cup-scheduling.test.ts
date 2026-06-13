import { cupRoundMatchdays, cupRoundDate, cupRoundDates } from './cup-scheduling.ts';
import { createGameDateTime, addDays } from '@fm2k/timeline';

// 2025-08-16 is a Saturday — the league season start used across the game.
const SEASON_START = createGameDateTime(2025, 8, 16, 15, 0);

function weekday(d: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay(); // 0=Sun … 6=Sat
}

describe('cupRoundMatchdays:', () => {
  test('spreads 6 rounds evenly from mid-season to the final matchday', () => {
    expect(cupRoundMatchdays(30, 6)).toEqual([15, 18, 21, 24, 27, 30]);
  });

  test('starts at the middle of the season', () => {
    expect(cupRoundMatchdays(30, 6)[0]).toBe(15);
    expect(cupRoundMatchdays(20, 5)[0]).toBe(10);
  });

  test('ends on the final matchday', () => {
    const a = cupRoundMatchdays(30, 6);
    const b = cupRoundMatchdays(24, 4);
    expect(a[a.length - 1]).toBe(30);
    expect(b[b.length - 1]).toBe(24);
  });

  test('is non-decreasing', () => {
    const mds = cupRoundMatchdays(30, 6);
    for (let i = 1; i < mds.length; i++) { expect(mds[i]).toBeGreaterThanOrEqual(mds[i - 1]); }
  });
});

describe('cupRoundDate:', () => {
  test('the season start is a Saturday (precondition)', () => {
    expect(weekday(SEASON_START)).toBe(6);
  });

  test('each cup round falls on a Wednesday at 15:00', () => {
    for (const md of cupRoundMatchdays(30, 6)) {
      const d = cupRoundDate(SEASON_START, md);
      expect(weekday(d)).toBe(3); // Wednesday
      expect(d.hour).toBe(15);
      expect(d.minute).toBe(0);
    }
  });

  test('sits strictly between its matchday Saturday and the next', () => {
    const md = 15;
    const saturday = addDays(SEASON_START, (md - 1) * 7);
    const nextSaturday = addDays(saturday, 7);
    const wed = cupRoundDate(SEASON_START, md);
    // wed is after `saturday` and before `nextSaturday`
    expect(new Date(Date.UTC(wed.year, wed.month - 1, wed.day)).getTime())
      .toBeGreaterThan(new Date(Date.UTC(saturday.year, saturday.month - 1, saturday.day)).getTime());
    expect(new Date(Date.UTC(wed.year, wed.month - 1, wed.day)).getTime())
      .toBeLessThan(new Date(Date.UTC(nextSaturday.year, nextSaturday.month - 1, nextSaturday.day)).getTime());
  });
});

describe('cupRoundDates:', () => {
  test('returns one Wednesday per round, strictly increasing', () => {
    const dates = cupRoundDates(SEASON_START, 30, 6);
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(Date.UTC(dates[i - 1].year, dates[i - 1].month - 1, dates[i - 1].day)).getTime();
      const curr = new Date(Date.UTC(dates[i].year, dates[i].month - 1, dates[i].day)).getTime();
      expect(curr).toBeGreaterThan(prev);
    }
  });
});
