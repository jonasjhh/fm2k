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
    round.push([ring[0], fixed]);
    for (let k = 1; k < n / 2; k++) {
      round.push([ring[k], ring[n - 1 - k]]);
    }
    rounds.push(round);
    // Rotate ring: move last element to front
    const last = ring[n - 2];
    for (let i = n - 2; i > 0; i--) {ring[i] = ring[i - 1];}
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
