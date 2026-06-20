import { LeagueManager } from './league-manager.ts';
import type { Fixture } from './league-types.ts';
import { DIVISION_TEAMS } from '../data/teams-data.ts';
import { createGameDateTime } from '@fm2k/timeline';

const START = createGameDateTime(2025, 8, 16, 15, 0);

function makeManager(eventsPerMinute = 1): LeagueManager {
  return new LeagueManager({ teams: DIVISION_TEAMS, startDate: START, eventsPerMinute });
}

/** A completed fixture's result, validated set. */
function resultOf(f: Fixture): NonNullable<Fixture['result']> {
  if (!f.result) { throw new Error(`fixture ${f.id} has no result`); }
  return f.result;
}

describe('LeagueManager:', () => {
  describe('initial state:', () => {
    test('standings contains all 16 teams at 0 points', () => {
      const { standings } = makeManager().getState();
      expect(standings).toHaveLength(16);
      standings.forEach(s => {
        expect(s.points).toBe(0);
        expect(s.played).toBe(0);
      });
    });

    test('fixtures are all 240 matches with status scheduled', () => {
      const { fixtures } = makeManager().getState();
      expect(fixtures).toHaveLength(240);
      expect(fixtures.every(f => f.status === 'scheduled' && f.result === null)).toBe(true);
    });

    test('state name is Division One', () => {
      expect(makeManager().getState().name).toBe('Division One');
    });

    test('state season is 2025/26', () => {
      expect(makeManager().getState().season).toBe('2025/26');
    });

    test('has more matchdays initially', () => {
      expect(makeManager().hasMoreMatchdays()).toBe(true);
    });

    test('completed matchdays is 0 initially', () => {
      expect(makeManager().getCompletedMatchdays()).toBe(0);
    });
  });

  describe('simulateNextMatchday:', () => {
    test('after one matchday, 8 fixtures are completed', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const completed = manager.getState().fixtures.filter(f => f.status === 'completed');
      expect(completed).toHaveLength(8);
    });

    test('after one matchday, all completed fixtures have a result', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const completed = manager.getState().fixtures.filter(f => f.status === 'completed');
      completed.forEach(f => {
        const result = resultOf(f);
        expect(typeof result.homeScore).toBe('number');
        expect(typeof result.awayScore).toBe('number');
      });
    });

    test('after one matchday, total played across standings is 16', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const total = manager.getState().standings.reduce((sum, s) => sum + s.played, 0);
      expect(total).toBe(16); // 8 matches × 2 teams
    });

    test('after one matchday, completed matchdays count is 1', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      expect(manager.getCompletedMatchdays()).toBe(1);
    });

    test('after two matchdays, 16 fixtures are completed', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      await manager.simulateNextMatchday();
      expect(manager.getState().fixtures.filter(f => f.status === 'completed')).toHaveLength(16);
    });

    test('points arithmetic: wins give 3pts, draws give 1pt each', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const { standings, fixtures } = manager.getState();
      const completed = fixtures.filter(f => f.status === 'completed');
      const results = completed.map(resultOf);
      const wins = results.filter(r => r.homeScore !== r.awayScore).length;
      const draws = results.filter(r => r.homeScore === r.awayScore).length;
      const totalPoints = standings.reduce((sum, s) => sum + s.points, 0);
      expect(totalPoints).toBe(wins * 3 + draws * 2);
    });

    test('goals for and against are recorded correctly', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const { standings, fixtures } = manager.getState();
      const completed = fixtures.filter(f => f.status === 'completed');
      const totalGoals = completed.map(resultOf).reduce((sum, r) => sum + r.homeScore + r.awayScore, 0);
      const totalGoalsFor = standings.reduce((sum, s) => sum + s.goalsFor, 0);
      expect(totalGoalsFor).toBe(totalGoals);
    });

    test('goal difference equals goalsFor minus goalsAgainst', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      manager.getState().standings.forEach(s => {
        expect(s.goalDifference).toBe(s.goalsFor - s.goalsAgainst);
      });
    });

    test('standings are sorted by points descending', async () => {
      const manager = makeManager();
      await manager.simulateNextMatchday();
      const { standings } = manager.getState();
      for (let i = 0; i < standings.length - 1; i++) {
        expect(standings[i].points).toBeGreaterThanOrEqual(standings[i + 1].points);
      }
    });
  });

  describe('simulateFullSeason:', () => {
    test('all 240 fixtures are completed', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      expect(manager.getState().fixtures.every(f => f.status === 'completed')).toBe(true);
    }, 30000);

    test('each team has played 30 matches', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      manager.getState().standings.forEach(s => expect(s.played).toBe(30));
    }, 30000);

    test('no more matchdays after full season', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      expect(manager.hasMoreMatchdays()).toBe(false);
    }, 30000);

    test('completed matchdays count is 30 after full season', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      expect(manager.getCompletedMatchdays()).toBe(30);
    }, 30000);

    test('total points across all teams matches wins and draws', async () => {
      const manager = makeManager();
      await manager.simulateFullSeason();
      const { standings, fixtures } = manager.getState();
      const results = fixtures.map(resultOf);
      const wins = results.filter(r => r.homeScore !== r.awayScore).length;
      const draws = results.filter(r => r.homeScore === r.awayScore).length;
      const totalPoints = standings.reduce((sum, s) => sum + s.points, 0);
      expect(totalPoints).toBe(wins * 3 + draws * 2);
    }, 30000);
  });

  describe('subscribe:', () => {
    test('notifies when a matchday is simulated', async () => {
      const manager = makeManager();
      let callCount = 0;
      manager.subscribe(() => { callCount++; });
      await manager.simulateNextMatchday();
      expect(callCount).toBeGreaterThan(0);
    });

    test('returns an unsubscribe function that stops notifications', async () => {
      const manager = makeManager();
      let callCount = 0;
      const unsubscribe = manager.subscribe(() => { callCount++; });
      unsubscribe();
      await manager.simulateNextMatchday();
      expect(callCount).toBe(0);
    });
  });
});
