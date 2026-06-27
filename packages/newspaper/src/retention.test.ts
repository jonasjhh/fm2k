import { createGameDateTime, addDays } from '@fm2k/timeline';
import { isExpired, NEWSPAPER_RETENTION_DAYS } from './retention.ts';

describe('isExpired:', () => {
  const published = createGameDateTime(2026, 3, 1);

  it('is not expired the moment it\'s published', () => {
    expect(isExpired({ timestamp: published }, published)).toBe(false);
  });

  it('is not expired exactly at the retention boundary', () => {
    const now = addDays(published, NEWSPAPER_RETENTION_DAYS);
    expect(isExpired({ timestamp: published }, now)).toBe(false);
  });

  it('is expired just past the retention boundary', () => {
    const now = addDays(published, NEWSPAPER_RETENTION_DAYS + 1);
    expect(isExpired({ timestamp: published }, now)).toBe(true);
  });

  it('a midweek fixture\'s article expires by the time the next midweek fixture lands a week later', () => {
    const midweek1 = createGameDateTime(2026, 3, 4); // Wednesday
    const midweek2 = addDays(midweek1, 7); // the following Wednesday
    expect(isExpired({ timestamp: midweek1 }, midweek2)).toBe(false); // still showing right up to it
    expect(isExpired({ timestamp: midweek1 }, addDays(midweek2, 1))).toBe(true); // gone the day after
  });
});
