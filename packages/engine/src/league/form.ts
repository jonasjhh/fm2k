import type { Fixture } from './league-types.ts';

export type FormResult = 'W' | 'D' | 'L';

/** A team's most-recent results (oldest→newest), derived from completed fixtures. */
export function recentForm(fixtures: readonly Fixture[], teamId: string, count = 5): FormResult[] {
  return fixtures
    .filter(f => f.status === 'completed' && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => b.matchday - a.matchday)
    .slice(0, count)
    .reverse()
    .map(f => {
      const home = f.homeTeamId === teamId;
      const scored = home ? f.result!.homeScore : f.result!.awayScore;
      const conceded = home ? f.result!.awayScore : f.result!.homeScore;
      return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
    });
}

/** Which league zone a 1-based table position falls in, given the division size. */
export function leagueZone(pos: number, total: number): 'promotion' | 'relegation' | null {
  if (pos <= 3) { return 'promotion'; }
  if (pos >= total - 1) { return 'relegation'; }
  return null;
}
