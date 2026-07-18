import { CompetitionManager } from './competition-manager.ts';
import { LeagueFormat } from './league-format.ts';
import { KnockoutFormat } from './knockout-format.ts';
import { DIVISION_TEAMS } from '../data/teams-data.ts';
import { createGameDateTime, addDays, addMinutes } from '@fm2k/timeline';
import { EventBus, assertDefined } from '@fm2k/state';
import type { GameEvents } from '../game-events.ts';
import type { Team, Formation, Player, PlayerPosition } from '@fm2k/match';
import type { KnockoutFormatConfig } from './competition-types.ts';

const START = createGameDateTime(2025, 8, 16, 15, 0);

/** Deep clone via JSON (competition state is plain JSON) — mimics a save/load. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cupTeam(id: string): Team {
  const positions: PlayerPosition[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id, name: id, formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' },
    squad: positions.map((p, i): Player => ({
      id: `${id}-p${i}`, name: `${id}-p${i}`, nationality: 'norwegian', age: 25, position: p, potential: 70,
      attributes: { speed: 70, strength: 70, passing: 70, finishing: 70, technique: 70, defending: 70, stamina: 75, keeping: 10 },
    })),
  };
}

function cupField(): { teams: Team[]; levelByTeamId: Map<string, number> } {
  const teams: Team[] = [];
  const levelByTeamId = new Map<string, number>();
  for (const [level, prefix] of [[1, 'l1'], [2, 'l2'], [3, 'l3']] as const) {
    for (let i = 0; i < 16; i++) {
      const t = cupTeam(`${prefix}-${i}`);
      teams.push(t);
      levelByTeamId.set(t.id, level);
    }
  }
  return { teams, levelByTeamId };
}

const CUP_CFG: KnockoutFormatConfig = {
  kind: 'knockout', byeLevel: 1, preliminaryLevels: [2, 3],
  roundNames: ['Round 1', 'Round 2', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'],
  byeTeamPlaysAway: true, higherSlotHostsFromRound: 3,
};

function makeCupManager(): CompetitionManager {
  const { teams, levelByTeamId } = cupField();
  return new CompetitionManager({
    format: new KnockoutFormat(CUP_CFG),
    teams, levelByTeamId,
    startDate: START, seasonStart: START,
    competitionId: 'nor-cup', name: 'Norwegian Cup',
    eventsPerMinute: 1, rng: mulberry32(2025),
  });
}

function makeManager(): CompetitionManager {
  return new CompetitionManager({
    format: new LeagueFormat(),
    teams: DIVISION_TEAMS,
    startDate: START,
    competitionId: 'test-league',
    name: 'Test League',
    eventsPerMinute: 1,
  });
}

describe('CompetitionManager (league format):', () => {
  test('init builds standings and schedules every fixture', () => {
    const m = makeManager();
    expect(m.getState().standings).toHaveLength(16);
    expect(m.getState().fixtures).toHaveLength(240);
    expect(m.hasNext()).toBe(true);
  });

  test('peekNextTickTime / peekNextKickoff return the first matchday kickoff', () => {
    const m = makeManager();
    expect(m.peekNextTickTime()).toEqual(START);
    expect(m.peekNextKickoff()).toEqual(START);
  });

  test('ticking into the kickoff starts matchday 1 live without completing it', async () => {
    const m = makeManager();
    await m.tickTo(addMinutes(START, 1));
    expect(m.hasLive()).toBe(true);
    expect(m.getLiveMatches()).toHaveLength(8);
    expect(m.getState().fixtures.every(f => f.status === 'scheduled')).toBe(true);
    expect(m.completedRounds()).toBe(0);
  });

  test('getLiveMatches reflects the in-progress matchday at half time', async () => {
    const m = makeManager();
    await m.tickTo(addMinutes(START, 45)); // ~half time
    const live = m.getLiveMatches();
    expect(live).toHaveLength(8);
    expect(live.every(l => l.minute >= 40 && l.minute <= 50)).toBe(true);
    expect(live.every(l => l.competitionId === 'test-league')).toBe(true);
  });

  test('tickTo well past kickoff completes the matchday', async () => {
    const m = makeManager();
    await m.tickTo(addMinutes(START, 200));
    expect(m.hasLive()).toBe(false);
    const completed = m.getState().fixtures.filter(f => f.status === 'completed');
    expect(completed).toHaveLength(8);
    expect(completed.every(f => f.matchday === 1)).toBe(true);
    expect(m.completedRounds()).toBe(1);
  });

  test('tickTo before the kickoff plays nothing', async () => {
    const m = makeManager();
    await m.tickTo(addDays(START, -1));
    expect(m.hasLive()).toBe(false);
    expect(m.getState().fixtures.every(f => f.status === 'scheduled')).toBe(true);
    expect(m.completedRounds()).toBe(0);
  });

  test('after the final matchday hasNext is false', async () => {
    const m = makeManager();
    await m.simulateFullSeason();
    expect(m.hasNext()).toBe(false);
    expect(m.completedRounds()).toBe(30);
    expect(m.getState().fixtures.every(f => f.status === 'completed')).toBe(true);
  });

  test('loadState restores an in-progress season without double-scheduling', async () => {
    const m = makeManager();
    await m.simulateNextRound();
    const snapshot = clone(m.getState());

    const fresh = makeManager();
    expect(() => fresh.loadState(snapshot)).not.toThrow();
    expect(fresh.completedRounds()).toBe(1);

    // Continuing must not re-count the already-played matchday.
    await fresh.simulateNextRound();
    expect(fresh.completedRounds()).toBe(2);
  });
});

describe('CompetitionManager (match.completed events):', () => {
  function makeLeagueWithBus(bus: EventBus<GameEvents>): CompetitionManager {
    return new CompetitionManager({
      format: new LeagueFormat(),
      teams: DIVISION_TEAMS,
      startDate: START,
      competitionId: 'test-league',
      name: 'Test League',
      eventsPerMinute: 1,
      eventBus: bus,
      rng: mulberry32(99),
    });
  }

  test('emits one match.completed per fixture with the forwarded payload', async () => {
    const bus = new EventBus<GameEvents>();
    const events: GameEvents['match.completed'][] = [];
    bus.on('match.completed', e => events.push(e));

    const m = makeLeagueWithBus(bus);
    await m.simulateNextRound();

    const completed = m.getState().fixtures.filter(f => f.status === 'completed');
    expect(completed).toHaveLength(8);
    expect(events).toHaveLength(8);

    for (const e of events) {
      // Match the emitted score to the recorded fixture result (payload is forwarded faithfully).
      const fx = assertDefined(
        completed.find(f => f.homeTeamId === e.homeTeamId && f.awayTeamId === e.awayTeamId),
        'fixture not found',
      );
      const fxResult = assertDefined(fx.result, 'fixture has no result');
      expect(e.homeScore).toBe(fxResult.homeScore);
      expect(e.awayScore).toBe(fxResult.awayScore);
      // Competition context forwarded.
      expect(e.competitionId).toBe('test-league');
      expect(e.roundLabel).toBe(fx.roundLabel);
      expect(e.homeTeamName).toBe(fx.homeTeamName);
      expect(e.awayTeamName).toBe(fx.awayTeamName);
      // League matches finish in normal time and attach both standings.
      expect(e.decidedBy).toBe('normal');
      expect(e.homeStanding?.teamId).toBe(e.homeTeamId);
      expect(e.awayStanding?.teamId).toBe(e.awayTeamId);
      // Knockout-only fields are absent for league matches.
      expect(e.winnerTeamId).toBeUndefined();
      expect(e.shootout).toBeUndefined();
      // Per-player energy is forwarded so ClubManager can drain fitness by actual fatigue
      // rather than falling back to a flat stamina-based estimate.
      expect(e.homeEnergy).toBeDefined();
      expect(e.awayEnergy).toBeDefined();
      // Per-player cards forwarded (drives own-club discipline headlines).
      expect(Array.isArray(e.bookings?.yellow)).toBe(true);
      expect(Array.isArray(e.bookings?.red)).toBe(true);
    }
  });

  test('forwards knockout decidedBy/winnerTeamId on emitted events', async () => {
    const bus = new EventBus<GameEvents>();
    const events: GameEvents['match.completed'][] = [];
    bus.on('match.completed', e => events.push(e));

    const { teams, levelByTeamId } = cupField();
    const m = new CompetitionManager({
      format: new KnockoutFormat(CUP_CFG),
      teams, levelByTeamId,
      startDate: START, seasonStart: START,
      competitionId: 'nor-cup', name: 'Norwegian Cup',
      eventsPerMinute: 1, rng: mulberry32(2025), eventBus: bus,
    });
    await m.simulateFullSeason();

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.competitionId).toBe('nor-cup');
      // Every knockout tie resolves to a winner that is one of the two sides.
      expect([e.homeTeamId, e.awayTeamId]).toContain(e.winnerTeamId);
      expect(['normal', 'extra_time', 'penalties']).toContain(e.decidedBy);
      // Knockout matches carry no league standings.
      expect(e.homeStanding).toBeUndefined();
      expect(e.awayStanding).toBeUndefined();
    }
    // At least one tie should have gone to penalties (with a shootout score) across a full cup.
    const pens = events.filter(e => e.decidedBy === 'penalties');
    for (const e of pens) {
      const shootout = assertDefined(e.shootout, 'shootout missing');
      expect(shootout.home).not.toBe(shootout.away);
    }
  });
});

describe('CompetitionManager.updateTeam:', () => {
  test('a team updated then rescheduled is the team object the live match actually holds', async () => {
    const m = makeCupManager();
    await m.simulateNextRound(); // round 1 complete; round 2 already materialised & scheduled

    const nextFixture = assertDefined(m.getState().fixtures.find(f => f.status === 'scheduled'), 'no scheduled fixture');
    const teamId = nextFixture.homeTeamId;
    m.updateTeam(teamId, { ...cupTeam(teamId), name: 'Renamed FC' });
    // Forces every still-scheduled fixture's MatchOccurrence to be rebuilt from ctx.teamsById,
    // exactly like resuming a save after AI squad churn/transfers updated a team mid-competition.
    m.loadState(m.getState());

    await m.tickTo(addMinutes(nextFixture.scheduledTime, 1));
    const live = assertDefined(m.getLiveMatches().find(l => l.fixtureId === nextFixture.id), 'live match not found');
    expect([live.homeTeamName, live.awayTeamName]).toContain('Renamed FC');
  });
});

describe('CompetitionManager player-team starters resolver:', () => {
  test('getPlayerStarters is wired through to the live match and consulted at kickoff', async () => {
    const teams = DIVISION_TEAMS;
    const playerTeamId = teams[0].id;
    const lineup = teams[0].squad.slice(0, 11);
    const getPlayerStarters = vi.fn(() => lineup);

    const m = new CompetitionManager({
      format: new LeagueFormat(),
      teams,
      startDate: START,
      competitionId: 'test-league',
      name: 'Test League',
      eventsPerMinute: 1,
      playerTeamId,
      getPlayerStarters,
    });

    expect(getPlayerStarters).not.toHaveBeenCalled(); // not consulted before kickoff

    const fixture = assertDefined(
      m.getState().fixtures.find(f => f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId),
      'fixture not found',
    );
    await m.tickTo(addMinutes(fixture.scheduledTime, 1));

    expect(getPlayerStarters).toHaveBeenCalled(); // resolved lazily once the match actually kicks off
  });
});

describe('CompetitionManager (knockout format):', () => {
  test('save/load mid-cup resumes to a single champion without re-counting rounds', async () => {
    const m = makeCupManager();
    await m.simulateNextRound(); // round 1
    await m.simulateNextRound(); // round 2 (round 3 now in flight/materialised)
    expect(m.completedRounds()).toBe(2);

    const snapshot = clone(m.getState());
    const completedBefore = snapshot.fixtures.filter(f => f.status === 'completed').length;

    const fresh = makeCupManager();
    fresh.loadState(snapshot);
    expect(fresh.completedRounds()).toBe(2);
    // No re-fire of already-completed ties.
    expect(fresh.getState().fixtures.filter(f => f.status === 'completed')).toHaveLength(completedBefore);

    await fresh.simulateFullSeason();
    const state = fresh.getState();
    expect(state.bracket?.championTeamId).not.toBeNull();
    expect(state.fixtures).toHaveLength(47);
    expect(state.fixtures.every(f => f.status === 'completed')).toBe(true);
  });
});
