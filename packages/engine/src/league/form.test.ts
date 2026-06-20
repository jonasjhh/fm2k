import { recentForm, leagueZone } from './form.ts';
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
