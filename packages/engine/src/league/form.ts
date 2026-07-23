import { assertDefined } from '@fm2k/state';
import { compareGameDateTime } from '@fm2k/timeline';
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

/** Max bias (in MatchForm probability points) form can contribute. TASK_07 re-locks. */
export const FORM_BIAS_CAP = 0.04;

/** W/D/L → signed point for recency-weighted form calculation. */
const FORM_POINT: Record<FormResult, number> = { W: 1, D: 0, L: -1 };

/**
 * Like `recentForm` but accepts fixtures from multiple competitions, sorted by
 * `scheduledTime` so cross-competition ordering is correct (matchday is per-competition).
 */
export function recentFormAcross(fixtures: readonly Fixture[], teamId: string, count = 5): FormResult[] {
  return fixtures
    .filter(f => f.status === 'completed' && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => compareGameDateTime(b.scheduledTime, a.scheduledTime))
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
 * Maps a recent W/D/L sequence (oldest→newest) to a MatchForm bias value in
 * conversion-probability points. Most-recent games weigh more; capped at ±FORM_BIAS_CAP.
 * Returns 0 for an empty sequence (season start / no games played yet).
 */
export function formModifier(results: FormResult[]): number {
  if (results.length === 0) { return 0; }
  let weighted = 0, wsum = 0;
  results.forEach((r, i) => {
    const w = i + 1; // older games lower weight, newest highest
    weighted += FORM_POINT[r] * w;
    wsum += w;
  });
  const norm = weighted / wsum; // -1..+1
  // Scale so 5 wins in a row → ~FORM_BIAS_CAP; fewer games → proportionally less effect.
  const raw = norm * FORM_BIAS_CAP * (results.length / 5);
  return Math.max(-FORM_BIAS_CAP, Math.min(FORM_BIAS_CAP, raw));
}

/**
 * Which league zone a 1-based table position falls in, given the division size.
 * Top 2 promote and bottom 2 relegate automatically — but a division only has a
 * promotion zone when there is a division above it, and a relegation zone when there
 * is one below. 3rd place (lower division) contests a promotion qualifier; 3rd-from-bottom
 * (upper division) contests a relegation qualifier. In the top division (no division
 * above) first place is the champion instead.
 */
export function leagueZone(
  pos: number,
  total: number,
  opts: { hasDivisionAbove?: boolean; hasDivisionBelow?: boolean } = {},
): 'champion' | 'promotion' | 'relegation' | 'promotionQualifier' | 'relegationQualifier' | null {
  const { hasDivisionAbove = true, hasDivisionBelow = true } = opts;
  if (!hasDivisionAbove && pos === 1) { return 'champion'; }
  if (hasDivisionAbove && pos <= 2) { return 'promotion'; }
  if (hasDivisionAbove && pos === 3) { return 'promotionQualifier'; }
  if (hasDivisionBelow && pos >= total - 1) { return 'relegation'; }
  if (hasDivisionBelow && pos === total - 2) { return 'relegationQualifier'; }
  return null;
}
