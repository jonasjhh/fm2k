import { CompetitionManager } from './competition-manager.ts';
import { LeagueFormat } from './league-format.ts';
import { KnockoutFormat } from './knockout-format.ts';
import { DIVISION_TEAMS } from '../data/teams-data.ts';
import { createGameDateTime, addDays } from '@fm2k/timeline';
import type { Team, Formation, Player, Position } from '../shared/types.ts';
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
  const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id, name: id, formation: '4-4-2' as Formation, colors: { primary: '#fff', secondary: '#000' },
    starters: positions.map((p, i): Player => ({
      id: `${id}-p${i}`, name: `${id}-p${i}`, nationality: 'norwegian', age: 25, position: p, potential: 70,
      attributes: { speed: 70, strength: 70, agility: 70, passing: 70, finishing: 70, technique: 70, defending: 70, stamina: 75, awareness: 70, composure: 70 },
    })),
    substitutes: [],
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

  test('peekNextTickTime returns the first matchday kickoff', () => {
    const m = makeManager();
    expect(m.peekNextTickTime()).toEqual(START);
  });

  test('advanceTo the first kickoff plays exactly matchday 1 (8 fixtures)', async () => {
    const m = makeManager();
    await m.advanceTo(START);
    const completed = m.getState().fixtures.filter(f => f.status === 'completed');
    expect(completed).toHaveLength(8);
    expect(completed.every(f => f.matchday === 1)).toBe(true);
    expect(m.completedRounds()).toBe(1);
  });

  test('advanceTo a target before the next kickoff plays nothing', async () => {
    const m = makeManager();
    await m.advanceTo(addDays(START, -1));
    expect(m.getState().fixtures.every(f => f.status === 'scheduled')).toBe(true);
    expect(m.completedRounds()).toBe(0);
  });

  test('advanceTo only plays the earliest block, not later matchdays', async () => {
    const m = makeManager();
    await m.advanceTo(START);            // matchday 1 only
    await m.advanceTo(addDays(START, 7)); // matchday 2 only
    expect(m.completedRounds()).toBe(2);
    expect(m.getState().fixtures.filter(f => f.status === 'completed')).toHaveLength(16);
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
