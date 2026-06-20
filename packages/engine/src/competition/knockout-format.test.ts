import { KnockoutFormat } from './knockout-format.ts';
import { CompetitionManager } from './competition-manager.ts';
import { cupRoundDate } from './cup-scheduling.ts';
import type { FormatContext, MatchOutcome } from './competition-format.ts';
import type { CompetitionState, KnockoutFormatConfig } from './competition-types.ts';
import type { Team, Formation, Player, PlayerPosition } from '@fm2k/match';
import { createGameDateTime } from '@fm2k/timeline';
import { assertDefined } from '@fm2k/state';

const SEASON_START = createGameDateTime(2025, 8, 16, 15, 0);

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function player(id: string, position: PlayerPosition): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 25, position, potential: 70,
    attributes: { speed: 70, strength: 70, agility: 70, passing: 70, finishing: 70, technique: 70, defending: 70, stamina: 75, awareness: 70, composure: 70 },
  };
}

function fullTeam(id: string): Team {
  const positions: PlayerPosition[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id, name: id, formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' },
    squad: positions.map((p, i) => player(`${id}-p${i}`, p)),
  };
}

function cupField(): { teams: Team[]; levelByTeamId: Map<string, number> } {
  const teams: Team[] = [];
  const levelByTeamId = new Map<string, number>();
  for (const [level, prefix] of [[1, 'l1'], [2, 'l2'], [3, 'l3']] as const) {
    for (let i = 0; i < 16; i++) {
      const t = fullTeam(`${prefix}-${i}`);
      teams.push(t);
      levelByTeamId.set(t.id, level);
    }
  }
  return { teams, levelByTeamId };
}

const CFG: KnockoutFormatConfig = {
  kind: 'knockout', byeLevel: 1, preliminaryLevels: [2, 3],
  roundNames: ['Round 1', 'Round 2', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
  byeTeamPlaysAway: true, higherSlotHostsFromRound: 3,
};

function makeCtx(rng: () => number): FormatContext {
  const { teams, levelByTeamId } = cupField();
  return {
    competitionId: 'nor-cup', name: 'Norwegian Cup', season: '2025/26',
    teams, teamsById: new Map(teams.map(t => [t.id, t])), levelByTeamId,
    startDate: SEASON_START, seasonStart: SEASON_START, rng,
  };
}

/** Feed deterministic results (home advances) directly into the format until done. */
function playAll(format: KnockoutFormat, state: CompetitionState, ctx: FormatContext): void {
  let guard = 0;
  while (state.fixtures.some(f => f.status === 'scheduled') && guard++ < 100) {
    const f = assertDefined(state.fixtures.find(fx => fx.status === 'scheduled'), 'no scheduled fixture');
    const outcome: MatchOutcome = {
      fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
      homeScore: 2, awayScore: 1, decidedBy: 'normal', winnerTeamId: f.homeTeamId,
    };
    format.apply(state, outcome, ctx);
  }
}

describe('KnockoutFormat.init:', () => {
  const format = new KnockoutFormat(CFG);
  const ctx = makeCtx(mulberry32(42));
  const { state, toSchedule } = format.init(ctx);

  test('only round 1 fixtures exist up front', () => {
    expect(state.fixtures).toHaveLength(16);
    expect(state.fixtures.every(f => f.matchday === 1)).toBe(true);
    expect(toSchedule).toHaveLength(16);
    expect(toSchedule.every(m => m.knockout)).toBe(true);
  });

  test('round 1 fixtures are scheduled on the round-1 Wednesday', () => {
    const expected = cupRoundDate(SEASON_START, 15);
    expect(state.fixtures[0].scheduledTime).toEqual(expected);
  });

  test('knockout state carries a bracket and empty standings', () => {
    expect(state.kind).toBe('knockout');
    expect(state.standings).toEqual([]);
    expect(state.bracket?.slots).toHaveLength(47);
  });
});

describe('KnockoutFormat progression:', () => {
  test('playing every tie crowns exactly one champion after 6 rounds', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(42));
    const { state } = format.init(ctx);
    playAll(format, state, ctx);

    expect(state.fixtures).toHaveLength(47);
    expect(state.fixtures.every(f => f.status === 'completed')).toBe(true);
    expect(format.completedRounds(state)).toBe(6);
    expect(state.bracket?.championTeamId).not.toBeNull();
  });

  test('round 2 ties pair a round-1 winner (home) against a top-flight team (away)', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(7));
    const { state } = format.init(ctx);
    // Play only round 1.
    for (const f of state.fixtures.filter(f => f.matchday === 1)) {
      format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 1, awayScore: 0, winnerTeamId: f.homeTeamId }, ctx);
    }
    const r2 = state.fixtures.filter(f => f.matchday === 2);
    expect(r2).toHaveLength(16);
    for (const f of r2) {
      expect(ctx.levelByTeamId.get(f.awayTeamId)).toBe(1);        // top flight away
      expect(ctx.levelByTeamId.get(f.homeTeamId)).not.toBe(1);    // round-1 winner home
      expect(f.scheduledTime).toEqual(cupRoundDate(SEASON_START, 18));
    }
  });

  test('completedRounds advances one round at a time', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(99));
    const { state } = format.init(ctx);
    expect(format.completedRounds(state)).toBe(0);
    for (const f of state.fixtures.filter(f => f.matchday === 1)) {
      format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 2, awayScore: 0, winnerTeamId: f.homeTeamId }, ctx);
    }
    expect(format.completedRounds(state)).toBe(1);
  });
});

describe('KnockoutFormat through CompetitionManager (real simulation):', () => {
  test('a full cup runs to a single champion via the tick engine', async () => {
    const { teams, levelByTeamId } = cupField();
    const manager = new CompetitionManager({
      format: new KnockoutFormat(CFG),
      teams, levelByTeamId,
      startDate: SEASON_START, seasonStart: SEASON_START,
      competitionId: 'nor-cup', name: 'Norwegian Cup',
      eventsPerMinute: 1, rng: mulberry32(2025),
    });

    await manager.simulateFullSeason();

    const state = manager.getState();
    expect(state.bracket?.championTeamId).not.toBeNull();
    expect(state.fixtures).toHaveLength(47);
    expect(state.fixtures.every(f => f.status === 'completed')).toBe(true);
    // Every tie produced a winner (knockout matches are never left drawn).
    expect(state.fixtures.every(f => f.result?.winnerTeamId)).toBe(true);
    expect(manager.hasNext()).toBe(false);
  });
});

describe('KnockoutFormat.apply edge cases:', () => {
  test('ignores an unknown or already-completed fixture', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(5));
    const { state } = format.init(ctx);
    const before = state.fixtures.filter(f => f.status === 'completed').length;

    expect(format.apply(state, { fixtureId: 'nope', homeTeamId: 'x', awayTeamId: 'y', homeScore: 1, awayScore: 0 }, ctx)).toEqual([]);

    const f = assertDefined(state.fixtures.find(fx => fx.status === 'scheduled'), 'no scheduled fixture');
    format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 2, awayScore: 1, winnerTeamId: f.homeTeamId }, ctx);
    // re-applying the now-completed fixture is a no-op
    format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 9, awayScore: 9, winnerTeamId: f.awayTeamId }, ctx);
    const updated = assertDefined(state.fixtures.find(fx => fx.id === f.id), 'fixture not found');
    expect(assertDefined(updated.result, 'fixture has no result').homeScore).toBe(2);
    expect(before).toBe(0);
  });

  test('infers the winner from the score when no winnerTeamId is supplied', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(5));
    const { state } = format.init(ctx);
    const r1 = state.fixtures.filter(f => f.matchday === 1);
    const homeWinners = new Set(r1.map(f => f.homeTeamId));

    for (const f of r1) {
      // home outscores away, winnerTeamId omitted -> falls back to homeScore >= awayScore
      format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 2, awayScore: 1 }, ctx);
    }

    const r2 = state.fixtures.filter(f => f.matchday === 2);
    expect(r2.length).toBeGreaterThan(0);
    expect(r2.every(f => homeWinners.has(f.homeTeamId))).toBe(true);
  });

  test('rescheduleFromState returns only the still-scheduled fixtures', () => {
    const format = new KnockoutFormat(CFG);
    const ctx = makeCtx(mulberry32(1));
    const { state } = format.init(ctx);
    for (const f of state.fixtures.filter(fx => fx.matchday === 1)) {
      format.apply(state, { fixtureId: f.id, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeScore: 2, awayScore: 0, winnerTeamId: f.homeTeamId }, ctx);
    }
    const scheduled = state.fixtures.filter(f => f.status === 'scheduled');
    const out = format.rescheduleFromState(state, ctx);
    expect(out).toHaveLength(scheduled.length);
    expect(out.length).toBeLessThan(state.fixtures.length); // round 1 is completed, excluded
  });
});
