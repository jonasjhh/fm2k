import { addDays, isAfter, type GameDateTime } from '@fm2k/timeline';

/** How long an article stays "in print" after its event date — one game week, so a new
 *  week's edition naturally replaces the last (midweek fixtures included: the same rule
 *  applies uniformly, there's no separate "midweek" retention window). */
export const NEWSPAPER_RETENTION_DAYS = 7;

/** Whether an article is past its retention window and should no longer be shown. */
export function isExpired(article: { timestamp: GameDateTime }, now: GameDateTime): boolean {
  return isAfter(now, addDays(article.timestamp, NEWSPAPER_RETENTION_DAYS));
}
