import { assertDefined } from '@fm2k/state';
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
      const result = assertDefined(f.result, `completed fixture ${f.id} has no result`);
      const scored = home ? result.homeScore : result.awayScore;
      const conceded = home ? result.awayScore : result.homeScore;
      return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
    });
}

/**
 * Which league zone a 1-based table position falls in, given the division size.
 * Top 2 promote and bottom 2 relegate — but a division only has a promotion zone
 * when there is a division above it, and a relegation zone when there is one below.
 * In the top division (no division above) first place is the champion instead.
 */
export function leagueZone(
  pos: number,
  total: number,
  opts: { hasDivisionAbove?: boolean; hasDivisionBelow?: boolean } = {},
): 'champion' | 'promotion' | 'relegation' | null {
  const { hasDivisionAbove = true, hasDivisionBelow = true } = opts;
  if (!hasDivisionAbove && pos === 1) { return 'champion'; }
  if (hasDivisionAbove && pos <= 2) { return 'promotion'; }
  if (hasDivisionBelow && pos >= total - 1) { return 'relegation'; }
  return null;
}
