/**
 * Transfer windows: buying, bidding, and listing players are only allowed while a window is open.
 * Two per season — a pre-season window (before the opening matchdays) and a shorter mid-season window
 * around the halfway point. Pure: derived purely from the completed-matchday count and season length.
 */

export type TransferWindowKind = 'pre_season' | 'mid_season';

export interface TransferWindow {
  open: boolean;
  kind: TransferWindowKind | null;
  /** The matchday at which the current window closes (exclusive), or null when shut. */
  closesOnMatchday: number | null;
}

/** Pre-season window is open while fewer than this many matchdays have been played. */
export const PRE_SEASON_WINDOW_LENGTH = 3;
/** Mid-season window length in matchdays. */
export const MID_SEASON_WINDOW_LENGTH = 2;

const SHUT: TransferWindow = { open: false, kind: null, closesOnMatchday: null };

/** The window state for a given completed-matchday count within a season of `totalMatchdays`. */
export function transferWindow(currentMatchday: number, totalMatchdays: number): TransferWindow {
  if (currentMatchday < PRE_SEASON_WINDOW_LENGTH) {
    return { open: true, kind: 'pre_season', closesOnMatchday: PRE_SEASON_WINDOW_LENGTH };
  }
  const midStart = Math.floor(totalMatchdays / 2);
  if (currentMatchday >= midStart && currentMatchday < midStart + MID_SEASON_WINDOW_LENGTH) {
    return { open: true, kind: 'mid_season', closesOnMatchday: midStart + MID_SEASON_WINDOW_LENGTH };
  }
  return SHUT;
}
