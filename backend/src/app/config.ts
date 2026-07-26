import { createGameDateTime } from '@fm2k/engine';
import type { GameDateTime } from '@fm2k/engine';

export { ALL_PLAYER_POSITIONS } from '@fm2k/engine';

/** New-game starting budget by division level (1 = top flight) — a top-flight side starts with
 *  enough to move in the transfer market or commit to a standard facility wing, a third-tier one
 *  with roughly the basic medical package and change. */
export const BUDGET_START_BY_LEVEL: Record<number, number> = {
  1: 3_000_000,
  2: 2_000_000,
  3: 1_000_000,
};

/** Fallback for a division level with no explicit budget — the lowest listed tier. */
export const BUDGET_START_DEFAULT = BUDGET_START_BY_LEVEL[3];

/** Starting budget for a club in a division of level `divisionLevel`. */
export function budgetStartFor(divisionLevel: number): number {
  return BUDGET_START_BY_LEVEL[divisionLevel] ?? BUDGET_START_DEFAULT;
}
/** Default starting stadium capacity (fallback). */
export const STADIUM_START = 8_000;
/** Kick-off date of a new season. */
export const SEASON_START: GameDateTime = createGameDateTime(2025, 8, 16, 15, 0);
/** Match events generated per simulated minute. */
export const EVENTS_PER_MINUTE = 3;
/** Transfer-market size. */
export const MARKET_SIZE = 15;
/** Refresh the transfer market every N matchdays. */
export const MARKET_REFRESH_INTERVAL = 3;

/** League matchdays per season (16 teams, double round-robin). */
export const LEAGUE_MATCHDAYS = 30;

/** National-cup round labels (6 rounds for a 48-team field). */
export const CUP_ROUND_NAMES = [
  'Round 1', 'Round 2', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final',
];

/** Competition id for a nation's cup, derived from its country id. */
export const cupCompetitionId = (countryId: string): string => `${countryId}-cup`;

/** Competition id for the promotion/relegation qualifier between two adjacent divisions. */
export const qualifierCompetitionId = (upperDivisionId: string, lowerDivisionId: string): string =>
  `${upperDivisionId}-vs-${lowerDivisionId}-qualifier`;
