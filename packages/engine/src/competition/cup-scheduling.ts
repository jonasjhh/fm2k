import { addDays } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';

const MATCHDAY_INTERVAL_DAYS = 7;
const CUP_KICKOFF_HOUR = 15;
/** A league matchday falls on a Saturday; +4 days lands on the following Wednesday. */
const WEDNESDAY_OFFSET = 4;

/**
 * The league matchdays the cup rounds are aligned to: spread as evenly as possible
 * from the middle of the season through its final matchday. For a 30-matchday season
 * with 6 rounds this is [15, 18, 21, 24, 27, 30].
 */
export function cupRoundMatchdays(totalLeagueMatchdays = 30, rounds = 6): number[] {
  const startMd = Math.ceil(totalLeagueMatchdays / 2);
  const endMd = totalLeagueMatchdays;
  const step = (endMd - startMd) / (rounds - 1);
  return Array.from({ length: rounds }, (_, i) => Math.round(startMd + i * step));
}

/**
 * The midweek (Wednesday) kickoff for a cup round aligned to a given league matchday.
 * Sits 3 days after that matchday's Saturday and 4 days before the next.
 */
export function cupRoundDate(seasonStart: GameDateTime, leagueMatchday: number): GameDateTime {
  const saturday = addDays(seasonStart, (leagueMatchday - 1) * MATCHDAY_INTERVAL_DAYS);
  return { ...addDays(saturday, WEDNESDAY_OFFSET), hour: CUP_KICKOFF_HOUR, minute: 0 };
}

/** The Wednesday kickoff per cup round (index 0 = round 1). */
export function cupRoundDates(seasonStart: GameDateTime, totalLeagueMatchdays = 30, rounds = 6): GameDateTime[] {
  return cupRoundMatchdays(totalLeagueMatchdays, rounds).map(md => cupRoundDate(seasonStart, md));
}
