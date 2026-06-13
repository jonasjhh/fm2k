import { createGameDateTime } from '@fm2k/engine';
import type { GameDateTime, Position } from '@fm2k/engine';

/** New-game starting budget. */
export const BUDGET_START = 1_000_000;
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

export const ALL_POSITIONS: Position[] = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
];
