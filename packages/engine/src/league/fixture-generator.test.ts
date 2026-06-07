import { generateFixtures } from './fixture-generator.ts';
import { DIVISION_TEAMS } from '../data/teams-data.ts';
import { createGameDateTime } from '@fm2k/timeline';

const START = createGameDateTime(2025, 8, 16, 15, 0);
const TEAMS = DIVISION_TEAMS;

describe('generateFixtures:', () => {
  describe('count and structure:', () => {
    test('generates 240 fixtures for 16 teams (double round-robin)', () => {
      expect(generateFixtures(TEAMS, START)).toHaveLength(240);
    });

    test('distributes fixtures across exactly 30 matchdays', () => {
      const matchdays = new Set(generateFixtures(TEAMS, START).map(f => f.matchday));
      expect(matchdays.size).toBe(30);
    });

    test('each matchday contains exactly 8 fixtures', () => {
      const fixtures = generateFixtures(TEAMS, START);
      for (let m = 1; m <= 30; m++) {
        expect(fixtures.filter(f => f.matchday === m)).toHaveLength(8);
      }
    });

    test('all fixture ids are unique', () => {
      const fixtures = generateFixtures(TEAMS, START);
      const ids = fixtures.map(f => f.id);
      expect(new Set(ids).size).toBe(240);
    });

    test('throws for an odd number of teams', () => {
      expect(() => generateFixtures(TEAMS.slice(0, 15), START)).toThrow();
    });
  });

  describe('round-robin correctness:', () => {
    test('each team plays exactly 30 matches', () => {
      const fixtures = generateFixtures(TEAMS, START);
      for (const team of TEAMS) {
        const count = fixtures.filter(f => f.homeTeamId === team.id || f.awayTeamId === team.id).length;
        expect(count).toBe(30);
      }
    });

    test('each team plays each other team exactly once at home', () => {
      const fixtures = generateFixtures(TEAMS, START);
      for (const home of TEAMS) {
        for (const away of TEAMS) {
          if (home.id === away.id) {continue;}
          const count = fixtures.filter(f => f.homeTeamId === home.id && f.awayTeamId === away.id).length;
          expect(count).toBe(1);
        }
      }
    });

    test('no team plays itself', () => {
      const fixtures = generateFixtures(TEAMS, START);
      expect(fixtures.every(f => f.homeTeamId !== f.awayTeamId)).toBe(true);
    });
  });

  describe('scheduling:', () => {
    test('matchday 1 kicks off at the provided start date and hour', () => {
      const fixtures = generateFixtures(TEAMS, START);
      const md1 = fixtures.filter(f => f.matchday === 1);
      md1.forEach(f => {
        expect(f.scheduledTime.hour).toBe(15);
        expect(f.scheduledTime.day).toBe(START.day);
        expect(f.scheduledTime.month).toBe(START.month);
      });
    });

    test('all fixtures on the same matchday share the same scheduled time', () => {
      const fixtures = generateFixtures(TEAMS, START);
      for (let m = 1; m <= 30; m++) {
        const md = fixtures.filter(f => f.matchday === m);
        const times = new Set(md.map(f => `${f.scheduledTime.day}-${f.scheduledTime.month}-${f.scheduledTime.year}`));
        expect(times.size).toBe(1);
      }
    });

    test('consecutive matchdays are 7 days apart', () => {
      const fixtures = generateFixtures(TEAMS, START);
      const md1Time = fixtures.find(f => f.matchday === 1)!.scheduledTime;
      const md2Time = fixtures.find(f => f.matchday === 2)!.scheduledTime;
      // 7 days later: same month unless crossing month boundary; just check absolute day diff via minutes
      const md1Minutes = md1Time.year * 525600 + md1Time.month * 43800 + md1Time.day * 1440;
      const md2Minutes = md2Time.year * 525600 + md2Time.month * 43800 + md2Time.day * 1440;
      expect(md2Minutes - md1Minutes).toBe(7 * 1440);
    });
  });

  describe('fixture fields:', () => {
    test('all fixtures start with status scheduled and null result', () => {
      const fixtures = generateFixtures(TEAMS, START);
      expect(fixtures.every(f => f.status === 'scheduled' && f.result === null)).toBe(true);
    });

    test('homeTeamName matches the team name for homeTeamId', () => {
      const fixtures = generateFixtures(TEAMS, START);
      const teamMap = new Map(TEAMS.map(t => [t.id, t.name]));
      fixtures.forEach(f => {
        expect(f.homeTeamName).toBe(teamMap.get(f.homeTeamId));
        expect(f.awayTeamName).toBe(teamMap.get(f.awayTeamId));
      });
    });
  });
});
