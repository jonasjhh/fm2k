import { recentForm, recentFormAcross, formModifier, leagueZone, FORM_BIAS_CAP } from './form.ts';
import type { Fixture } from './league-types.ts';

function fixture(id: string, matchday: number, home: string, away: string, hs: number, as: number): Fixture {
  return {
    id, matchday, competitionId: 'test', roundLabel: `Matchday ${matchday}`,
    homeTeamId: home, awayTeamId: away,
    homeTeamName: home, awayTeamName: away,
    scheduledTime: { year: 2025, month: 8, day: matchday, hour: 15, minute: 0 } as Fixture['scheduledTime'],
    result: { homeScore: hs, awayScore: as }, status: 'completed',
  };
}

describe('recentForm:', () => {
  const fixtures: Fixture[] = [
    fixture('f1', 1, 'A', 'B', 2, 0), // A win
    fixture('f2', 2, 'C', 'A', 1, 1), // A draw
    fixture('f3', 3, 'A', 'D', 0, 3), // A loss
    { ...fixture('f4', 4, 'A', 'E', 5, 0), status: 'scheduled', result: null }, // not counted
  ];

  it('given completed fixtures then returns W/D/L oldest-to-newest from the team\'s perspective', () => {
    expect(recentForm(fixtures, 'A')).toEqual(['W', 'D', 'L']);
  });

  it('ignores scheduled fixtures and limits to the requested count', () => {
    expect(recentForm(fixtures, 'A', 2)).toEqual(['D', 'L']);
  });

  it('reads results from the away perspective correctly', () => {
    expect(recentForm(fixtures, 'B')).toEqual(['L']);
  });
});

describe('recentFormAcross:', () => {
  // Two competitions with the same team — a league game on day 1 and a cup game on day 3.
  // recentFormAcross must sort by scheduledTime, not matchday (matchday is per-competition).
  const leagueFixture = fixture('l1', 1, 'A', 'B', 2, 0); // A win, day 1
  const cupFixture: Fixture = {
    ...fixture('c1', 1, 'C', 'A', 0, 1), // A win (away), but matchday=1 too
    scheduledTime: { year: 2025, month: 8, day: 3, hour: 15, minute: 0 } as Fixture['scheduledTime'],
  };
  const leagueFixture2: Fixture = {
    ...fixture('l2', 2, 'A', 'D', 0, 2), // A loss, day 2
    scheduledTime: { year: 2025, month: 8, day: 2, hour: 15, minute: 0 } as Fixture['scheduledTime'],
  };

  it('orders cross-competition results by scheduledTime, not matchday', () => {
    // Chronological order: l1 (day1 win), l2 (day2 loss), c1 (day3 win) → W, L, W
    expect(recentFormAcross([cupFixture, leagueFixture2, leagueFixture], 'A')).toEqual(['W', 'L', 'W']);
  });

  it('limits to the requested count, taking the most recent', () => {
    expect(recentFormAcross([cupFixture, leagueFixture2, leagueFixture], 'A', 2)).toEqual(['L', 'W']);
  });

  it('returns empty for a team with no completed fixtures', () => {
    expect(recentFormAcross([], 'A')).toEqual([]);
  });
});

describe('formModifier:', () => {
  it('returns 0 for an empty sequence (season start)', () => {
    expect(formModifier([])).toBe(0);
  });

  it('returns a positive value for a winning run', () => {
    expect(formModifier(['W', 'W', 'W', 'W', 'W'])).toBeGreaterThan(0);
  });

  it('returns a negative value for a losing run', () => {
    expect(formModifier(['L', 'L', 'L', 'L', 'L'])).toBeLessThan(0);
  });

  it('returns 0 for an all-draw run', () => {
    expect(formModifier(['D', 'D', 'D'])).toBe(0);
  });

  it('caps at ±FORM_BIAS_CAP regardless of how dominant the run is', () => {
    const wins = formModifier(['W', 'W', 'W', 'W', 'W']);
    const losses = formModifier(['L', 'L', 'L', 'L', 'L']);
    expect(wins).toBeLessThanOrEqual(FORM_BIAS_CAP);
    expect(losses).toBeGreaterThanOrEqual(-FORM_BIAS_CAP);
  });

  it('scales down for fewer than 5 games', () => {
    const full = formModifier(['W', 'W', 'W', 'W', 'W']);
    const partial = formModifier(['W', 'W']);
    expect(partial).toBeLessThan(full);
  });

  it('weights recent results more than older ones', () => {
    // W at the end (most recent) should give more bias than W at the start
    const recentWin = formModifier(['L', 'L', 'L', 'L', 'W']);
    const oldWin = formModifier(['W', 'L', 'L', 'L', 'L']);
    expect(recentWin).toBeGreaterThan(oldWin);
  });
});

describe('leagueZone:', () => {
  it('marks the top two as promotion, third as the promotion qualifier', () => {
    expect(leagueZone(1, 20)).toBe('promotion');
    expect(leagueZone(2, 20)).toBe('promotion');
    expect(leagueZone(3, 20)).toBe('promotionQualifier');
    expect(leagueZone(4, 20)).toBeNull();
  });

  it('marks the bottom two as relegation, third-from-bottom as the relegation qualifier', () => {
    expect(leagueZone(19, 20)).toBe('relegation');
    expect(leagueZone(20, 20)).toBe('relegation');
    expect(leagueZone(18, 20)).toBe('relegationQualifier');
    expect(leagueZone(17, 20)).toBeNull();
  });

  it('returns null for mid-table', () => {
    expect(leagueZone(5, 20)).toBeNull();
    expect(leagueZone(16, 20)).toBeNull();
  });

  it('marks first place in the top division as champion, with no promotion zone', () => {
    expect(leagueZone(1, 20, { hasDivisionAbove: false })).toBe('champion');
    expect(leagueZone(2, 20, { hasDivisionAbove: false })).toBeNull();
    expect(leagueZone(3, 20, { hasDivisionAbove: false })).toBeNull();
    expect(leagueZone(20, 20, { hasDivisionAbove: false })).toBe('relegation');
  });

  it('omits the relegation zone for the bottom division (no division below)', () => {
    expect(leagueZone(20, 20, { hasDivisionBelow: false })).toBeNull();
    expect(leagueZone(19, 20, { hasDivisionBelow: false })).toBeNull();
    expect(leagueZone(1, 20, { hasDivisionBelow: false })).toBe('promotion');
  });
});
