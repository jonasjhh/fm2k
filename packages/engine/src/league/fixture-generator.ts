import type { Team } from '../shared/types.ts';
import type { GameDateTime } from '@fm2k/timeline';
import { addDays } from '@fm2k/timeline';
import type { Fixture } from './league-types.ts';

const MATCHDAY_INTERVAL_DAYS = 7;
const KICKOFF_HOUR = 15;

function singleRoundRobin(teams: Team[]): [Team, Team][][] {
  const n = teams.length;
  const fixed = teams[n - 1];
  const ring = [...teams.slice(0, n - 1)];
  const rounds: [Team, Team][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: [Team, Team][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = i === 0 ? fixed : ring[n - 1 - i];
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    // Rotate ring: move last element to front (fixed stays in place)
    const last = ring[n - 2];
    for (let i = n - 2; i > 0; i--) { ring[i] = ring[i - 1]; }
    ring[0] = last;
  }

  return rounds;
}

function kickoffTime(startDate: GameDateTime, matchdayIndex: number): GameDateTime {
  const date = addDays(startDate, matchdayIndex * MATCHDAY_INTERVAL_DAYS);
  return { ...date, hour: KICKOFF_HOUR, minute: 0 };
}

export function generateFixtures(teams: Team[], startDate: GameDateTime): Fixture[] {
  if (teams.length % 2 !== 0) {throw new Error('generateFixtures requires an even number of teams');}

  const firstLeg = singleRoundRobin(teams);
  const fixtures: Fixture[] = [];
  let matchday = 1;

  // First leg — all rounds in order
  for (const round of firstLeg) {
    const time = kickoffTime(startDate, matchday - 1);
    for (const [home, away] of round) {
      fixtures.push({
        id: `${home.id}-vs-${away.id}-md${matchday}`,
        matchday,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeTeamName: home.name,
        awayTeamName: away.name,
        scheduledTime: time,
        result: null,
        status: 'scheduled',
      });
    }
    matchday++;
  }

  // Second leg — same round order with home/away swapped; this guarantees
  // the minimum gap between first and second meetings is n-1 matchdays.
  for (const round of firstLeg) {
    const time = kickoffTime(startDate, matchday - 1);
    for (const [home, away] of round) {
      fixtures.push({
        id: `${away.id}-vs-${home.id}-md${matchday}`,
        matchday,
        homeTeamId: away.id,
        awayTeamId: home.id,
        homeTeamName: away.name,
        awayTeamName: home.name,
        scheduledTime: time,
        result: null,
        status: 'scheduled',
      });
    }
    matchday++;
  }

  return fixtures;
}
