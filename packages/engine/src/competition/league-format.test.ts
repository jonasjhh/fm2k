import { LeagueFormat } from './league-format.ts';
import type { FormatContext } from './competition-format.ts';
import type { CompetitionState } from './competition-types.ts';
import type { Team, Formation, Player, PlayerPosition } from '@fm2k/match';
import { createGameDateTime } from '@fm2k/timeline';
import { assertDefined } from '@fm2k/state';

const SEASON_START = createGameDateTime(2025, 8, 16, 15, 0);

function player(id: string, position: PlayerPosition): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 25, position, potential: 70,
    attributes: { speed: 70, strength: 70, passing: 70, finishing: 70, technique: 70, defending: 70, stamina: 75, keeping: 10 },
  };
}

function team(id: string): Team {
  const positions: PlayerPosition[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id, name: id.toUpperCase(), formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' },
    squad: positions.map((p, i) => player(`${id}-p${i}`, p)),
  };
}

function makeCtx(): FormatContext {
  const teams = ['t1', 't2', 't3', 't4'].map(team);
  return {
    competitionId: 'league-1', name: 'Test League', season: '2025/26',
    teams, teamsById: new Map(teams.map(t => [t.id, t])), levelByTeamId: new Map(teams.map(t => [t.id, 1])),
    startDate: SEASON_START, seasonStart: SEASON_START, rng: () => 0.5,
  };
}

function setup() {
  const fmt = new LeagueFormat();
  const { state, toSchedule } = fmt.init(makeCtx());
  return { fmt, state, toSchedule };
}

/** Apply a completed result for the scheduled fixture with this exact home/away pairing. */
function play(fmt: LeagueFormat, state: CompetitionState, homeId: string, awayId: string, homeScore: number, awayScore: number) {
  const fx = state.fixtures.find(f => f.homeTeamId === homeId && f.awayTeamId === awayId && f.status === 'scheduled');
  if (!fx) { throw new Error(`no scheduled fixture ${homeId} v ${awayId}`); }
  fmt.apply(state, { fixtureId: fx.id, homeTeamId: homeId, awayTeamId: awayId, homeScore, awayScore });
  return fx;
}

const standing = (state: CompetitionState, teamId: string) =>
  assertDefined(state.standings.find(s => s.teamId === teamId), `no standing for team ${teamId}`);
const rank = (state: CompetitionState, teamId: string) => state.standings.findIndex(s => s.teamId === teamId);

describe('LeagueFormat:', () => {
  describe('init', () => {
    it('seeds one zeroed standing per team and schedules league (non-knockout) matches', () => {
      const { state, toSchedule } = setup();
      expect(state.standings).toHaveLength(4);
      expect(state.standings.every(s =>
        s.played === 0 && s.won === 0 && s.drawn === 0 && s.lost === 0 &&
        s.goalsFor === 0 && s.goalsAgainst === 0 && s.goalDifference === 0 && s.points === 0,
      )).toBe(true);
      expect(toSchedule.length).toBeGreaterThan(0);
      expect(toSchedule.every(m => m.knockout === false)).toBe(true);
    });
  });

  describe('apply — standings updates', () => {
    it('records a home win (3 points), the loss, goals and goal difference', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't2', 2, 0);

      const home = standing(state, 't1');
      const away = standing(state, 't2');
      expect(home).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 3 });
      expect(away).toMatchObject({ played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0 });
    });

    it('records an away win', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't2', 1, 3);
      expect(standing(state, 't2')).toMatchObject({ won: 1, lost: 0, points: 3, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });
      expect(standing(state, 't1')).toMatchObject({ won: 0, lost: 1, points: 0, goalDifference: -2 });
    });

    it('records a draw (1 point each)', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't2', 1, 1);
      expect(standing(state, 't1')).toMatchObject({ drawn: 1, points: 1, goalDifference: 0 });
      expect(standing(state, 't2')).toMatchObject({ drawn: 1, points: 1, goalDifference: 0 });
    });

    it('ignores an unknown fixture and does not double-count a completed one', () => {
      const { fmt, state } = setup();
      const fx = play(fmt, state, 't1', 't2', 2, 0);

      expect(fmt.apply(state, { fixtureId: 'nope', homeTeamId: 't1', awayTeamId: 't2', homeScore: 5, awayScore: 5 })).toEqual([]);
      // re-applying the now-completed fixture must be a no-op
      fmt.apply(state, { fixtureId: fx.id, homeTeamId: 't1', awayTeamId: 't2', homeScore: 9, awayScore: 9 });
      expect(standing(state, 't1')).toMatchObject({ played: 1, points: 3, goalsFor: 2 });
    });
  });

  describe('apply — standings ordering', () => {
    it('orders by points first', () => {
      const { fmt, state } = setup();
      // t2: 3 pts (one win, one loss), GD -4 ; t1: 2 pts (two draws), GD 0
      play(fmt, state, 't2', 't3', 1, 0);
      play(fmt, state, 't4', 't2', 5, 0);
      play(fmt, state, 't1', 't3', 1, 1);
      play(fmt, state, 't1', 't4', 0, 0);
      expect(rank(state, 't2')).toBeLessThan(rank(state, 't1')); // more points wins despite worse GD
    });

    it('breaks equal points by goal difference', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't3', 5, 4); // 3 pts, GD +1, GF 5
      play(fmt, state, 't2', 't4', 2, 0); // 3 pts, GD +2, GF 2
      expect(rank(state, 't2')).toBeLessThan(rank(state, 't1')); // better GD wins (despite fewer goals for)
    });

    it('breaks equal points and goal difference by goals scored', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't3', 2, 0); // 3 pts, GD +2, GF 2
      play(fmt, state, 't2', 't4', 3, 1); // 3 pts, GD +2, GF 3
      expect(rank(state, 't2')).toBeLessThan(rank(state, 't1')); // more goals for wins
    });
  });

  describe('rescheduleFromState', () => {
    it('returns only the still-scheduled fixtures as non-knockout matches', () => {
      const { fmt, state } = setup();
      play(fmt, state, 't1', 't2', 1, 0);
      const remaining = state.fixtures.filter(f => f.status === 'scheduled').length;

      const rescheduled = fmt.rescheduleFromState(state, makeCtx());
      expect(rescheduled).toHaveLength(remaining);
      expect(rescheduled.every(m => m.knockout === false)).toBe(true);
    });
  });
});
