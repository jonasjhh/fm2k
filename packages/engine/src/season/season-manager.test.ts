import { SeasonManager } from './season-manager.ts';
import type { SeasonManagerConfig } from './season-manager.ts';
import type { DivisionConfig } from './season-types.ts';
import type { Team, Player, Formation } from '../shared/types.ts';
import { createGameDateTime } from '@fm2k/timeline';

const START = createGameDateTime(2025, 8, 16, 15, 0);
const NEXT_SEASON_START = createGameDateTime(2026, 8, 15, 15, 0);

// ── test helpers ─────────────────────────────────────────────────────────────

function makePlayer(id: string): Player {
  return {
    id,
    name: id,
    nationality: 'norwegian',
    age: 25,
    position: 'CM',
    potential: 70,
    attributes: {
      speed: 10, strength: 10, agility: 10,
      passing: 10, finishing: 10, technique: 10,
      defending: 10, stamina: 10, awareness: 10, composure: 10,
    },
  };
}

function makeTeam(id: string): Team {
  const positions = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return {
    id,
    name: id,
    formation: '4-4-2' as Formation,
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    starters: positions.map((pos, i) => makePlayer(`${id}-p${i}`)),
    substitutes: [],
  };
}

// Two divisions, 4 teams each (6 matchdays per division, 12 total fixtures)
const DIV1_TEAMS = ['t1a', 't1b', 't1c', 't1d'].map(makeTeam);
const DIV2_TEAMS = ['t2a', 't2b', 't2c', 't2d'].map(makeTeam);

const ALL_TEAMS = [...DIV1_TEAMS, ...DIV2_TEAMS];
const TEAM_MAP = Object.fromEntries(ALL_TEAMS.map(t => [t.id, t]));

const DIVISIONS: DivisionConfig[] = [
  { id: 'div1', name: 'Division 1', teamIds: DIV1_TEAMS.map(t => t.id), promotionSpots: 0, relegationSpots: 1 },
  { id: 'div2', name: 'Division 2', teamIds: DIV2_TEAMS.map(t => t.id), promotionSpots: 1, relegationSpots: 0 },
];

function makeManager(overrides: Partial<SeasonManagerConfig> = {}): SeasonManager {
  return new SeasonManager({
    currentSeason: 1,
    divisions: DIVISIONS,
    teamMap: TEAM_MAP,
    startDate: START,
    eventsPerMinute: 1,
    ...overrides,
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SeasonManager:', () => {
  describe('initial state:', () => {
    test('currentSeason matches config', () => {
      expect(makeManager().getState().currentSeason).toBe(1);
    });

    test('phase is in_season', () => {
      expect(makeManager().getState().phase).toBe('in_season');
    });

    test('divisions has both configured divisions', () => {
      expect(makeManager().getState().divisions).toHaveLength(2);
    });

    test('clubDivisionMap contains all teams mapped to their division', () => {
      const { clubDivisionMap } = makeManager().getState();
      for (const t of DIV1_TEAMS) {expect(clubDivisionMap[t.id]).toBe('div1');}
      for (const t of DIV2_TEAMS) {expect(clubDivisionMap[t.id]).toBe('div2');}
    });

    test('seasonHistory is empty', () => {
      expect(makeManager().getState().seasonHistory).toHaveLength(0);
    });

    test('hasMoreMatchdays is true initially', () => {
      expect(makeManager().hasMoreMatchdays()).toBe(true);
    });
  });

  describe('getLeagueManager:', () => {
    test('returns a LeagueManager for each division', () => {
      const manager = makeManager();
      expect(manager.getLeagueManager('div1')).toBeDefined();
      expect(manager.getLeagueManager('div2')).toBeDefined();
    });

    test('returns undefined for unknown division id', () => {
      expect(makeManager().getLeagueManager('div99')).toBeUndefined();
    });

    test('div1 league manager has 4 teams in standings', () => {
      const lm = makeManager().getLeagueManager('div1')!;
      expect(lm.getState().standings).toHaveLength(4);
    });

    test('div1 league manager has teams matching the config', () => {
      const lm = makeManager().getLeagueManager('div1')!;
      const teamIds = lm.getState().standings.map(s => s.teamId).sort();
      expect(teamIds).toEqual(DIV1_TEAMS.map(t => t.id).sort());
    });
  });

  describe('simulateNextMatchday:', () => {
    test('after one matchday, each division has some completed fixtures', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const div1Completed = manager.getLeagueManager('div1')!.getState().fixtures.filter(f => f.status === 'completed');
      const div2Completed = manager.getLeagueManager('div2')!.getState().fixtures.filter(f => f.status === 'completed');
      expect(div1Completed.length).toBeGreaterThan(0);
      expect(div2Completed.length).toBeGreaterThan(0);
    });

    test('after one matchday, hasMoreMatchdays is still true', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      expect(manager.hasMoreMatchdays()).toBe(true);
    });
  });

  describe('simulateFullSeason:', () => {
    test('all fixtures in both divisions are completed', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      for (const div of ['div1', 'div2']) {
        const fixtures = manager.getLeagueManager(div)!.getState().fixtures;
        expect(fixtures.every(f => f.status === 'completed')).toBe(true);
      }
    }, 30000);

    test('each team in div1 has played 6 matches (double round-robin with 4 teams)', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      manager.getLeagueManager('div1')!.getState().standings.forEach(s => {
        expect(s.played).toBe(6);
      });
    }, 30000);

    test('hasMoreMatchdays is false after full season', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      expect(manager.hasMoreMatchdays()).toBe(false);
    }, 30000);
  });

  describe('endSeason:', () => {
    async function runSeasonAndEnd(playerClubId?: string) {
      const manager = makeManager();
      await manager.simulateFullSeason();
      const result = manager.endSeason(playerClubId);
      return { manager, result };
    }

    test('returns exactly 1 promotion and 1 relegation (1 spot each)', async () => {
      const { result } = await runSeasonAndEnd();
      expect(result.promotions).toHaveLength(1);
      expect(result.relegations).toHaveLength(1);
    }, 30000);

    test('relegated team is a div1 team', async () => {
      const { result } = await runSeasonAndEnd();
      expect(DIV1_TEAMS.map(t => t.id)).toContain(result.relegations[0]);
    }, 30000);

    test('promoted team is a div2 team', async () => {
      const { result } = await runSeasonAndEnd();
      expect(DIV2_TEAMS.map(t => t.id)).toContain(result.promotions[0]);
    }, 30000);

    test('clubDivisionMap updated: relegated team now in div2', async () => {
      const { manager, result } = await runSeasonAndEnd();
      expect(manager.getState().clubDivisionMap[result.relegations[0]]).toBe('div2');
    }, 30000);

    test('clubDivisionMap updated: promoted team now in div1', async () => {
      const { manager, result } = await runSeasonAndEnd();
      expect(manager.getState().clubDivisionMap[result.promotions[0]]).toBe('div1');
    }, 30000);

    test('phase changes to post_season', async () => {
      const { manager } = await runSeasonAndEnd();
      expect(manager.getState().phase).toBe('post_season');
    }, 30000);

    test('currentSeason increments by 1', async () => {
      const { manager } = await runSeasonAndEnd();
      expect(manager.getState().currentSeason).toBe(2);
    }, 30000);

    test('seasonHistory has one entry with correct season number', async () => {
      const { manager } = await runSeasonAndEnd();
      expect(manager.getState().seasonHistory).toHaveLength(1);
      expect(manager.getState().seasonHistory[0].season).toBe(1);
    }, 30000);

    test('seasonHistory entry contains results for both divisions', async () => {
      const { manager } = await runSeasonAndEnd();
      const entry = manager.getState().seasonHistory[0];
      expect(entry.divisionResults['div1']).toBeDefined();
      expect(entry.divisionResults['div2']).toBeDefined();
    }, 30000);

    test('playerClubDivision recorded correctly when playerClubId provided', async () => {
      const { manager } = await runSeasonAndEnd('t1a');
      const entry = manager.getState().seasonHistory[0];
      expect(entry.playerClubDivision).toBe('div1');
    }, 30000);

    test('playerClubDivision is empty string when playerClubId not provided', async () => {
      const { manager } = await runSeasonAndEnd();
      expect(manager.getState().seasonHistory[0].playerClubDivision).toBe('');
    }, 30000);
  });

  describe('startNextSeason:', () => {
    async function runFullCycle() {
      const manager = makeManager();
      await manager.simulateFullSeason();
      const { promotions, relegations } = manager.endSeason();
      manager.startNextSeason(NEXT_SEASON_START);
      return { manager, promotions, relegations };
    }

    test('phase returns to in_season', async () => {
      const { manager } = await runFullCycle();
      expect(manager.getState().phase).toBe('in_season');
    }, 30000);

    test('hasMoreMatchdays is true again after new season start', async () => {
      const { manager } = await runFullCycle();
      expect(manager.hasMoreMatchdays()).toBe(true);
    }, 30000);

    test('promoted team appears in div1 LeagueManager', async () => {
      const { manager, promotions } = await runFullCycle();
      const div1Ids = manager.getLeagueManager('div1')!.getState().standings.map(s => s.teamId);
      expect(div1Ids).toContain(promotions[0]);
    }, 30000);

    test('relegated team appears in div2 LeagueManager', async () => {
      const { manager, relegations } = await runFullCycle();
      const div2Ids = manager.getLeagueManager('div2')!.getState().standings.map(s => s.teamId);
      expect(div2Ids).toContain(relegations[0]);
    }, 30000);

    test('div1 still has 4 teams after swap', async () => {
      const { manager } = await runFullCycle();
      expect(manager.getLeagueManager('div1')!.getState().standings).toHaveLength(4);
    }, 30000);

    test('div2 still has 4 teams after swap', async () => {
      const { manager } = await runFullCycle();
      expect(manager.getLeagueManager('div2')!.getState().standings).toHaveLength(4);
    }, 30000);

    test('new season fixtures all start as scheduled', async () => {
      const { manager } = await runFullCycle();
      for (const div of ['div1', 'div2']) {
        const fixtures = manager.getLeagueManager(div)!.getState().fixtures;
        expect(fixtures.every(f => f.status === 'scheduled')).toBe(true);
      }
    }, 30000);

    test('all standings reset to zero for new season', async () => {
      const { manager } = await runFullCycle();
      for (const div of ['div1', 'div2']) {
        manager.getLeagueManager(div)!.getState().standings.forEach(s => {
          expect(s.played).toBe(0);
          expect(s.points).toBe(0);
        });
      }
    }, 30000);
  });

  describe('subscribe:', () => {
    test('notifies listener when endSeason updates state', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      let callCount = 0;
      manager.subscribe(() => { callCount++; });
      manager.endSeason();
      expect(callCount).toBeGreaterThan(0);
    }, 30000);

    test('returns unsubscribe function that stops notifications', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      let callCount = 0;
      const unsub = manager.subscribe(() => { callCount++; });
      unsub();
      manager.endSeason();
      expect(callCount).toBe(0);
    }, 30000);
  });
});
