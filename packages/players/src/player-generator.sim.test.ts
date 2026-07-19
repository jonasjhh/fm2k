/**
 * Simulation-based integration tests for PlayerGenerator — excluded from Stryker
 * because they run 240+ match simulations and are too slow for mutation testing.
 * Vitest runs them normally as part of `pnpm test`.
 */
import { PlayerGenerator } from './player-generator.ts';
import {
  simulateMatch, type PlayerPosition, type Player, type Team,
} from '@fm2k/match';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMATION: [PlayerPosition, number][] = [
  ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2],
];

function buildSquad(otherSeed: number, striker: { gen: PlayerGenerator; archetype: string }): Player[] {
  const otherGen = new PlayerGenerator('female', 'all', mulberry32(otherSeed));
  const squad: Player[] = [];
  FORMATION.forEach(([position, count]) => {
    for (let i = 0; i < count; i++) {
      const gen = position === 'ST' ? striker.gen : otherGen;
      const archetype = position === 'ST' ? striker.archetype : 'balanced';
      squad.push(gen.generatePlayer(position, { overall: 70, archetype }));
    }
  });
  return squad;
}

function team(id: string, squad: Player[]): Team {
  return { id, name: id, formation: '4-4-2', squad, colors: { primary: '#fff', secondary: '#000' } };
}

function headedGoalShare(strikerArchetype: string): number {
  const strikerGen = new PlayerGenerator('female', 'all', mulberry32(1));
  const squad = buildSquad(101, { gen: strikerGen, archetype: strikerArchetype });
  const home = team('h', squad);
  const awaySquad = buildSquad(102, { gen: new PlayerGenerator('female', 'all', mulberry32(2)), archetype: 'balanced' });
  const away = team('a', awaySquad);

  let headed = 0;
  let totalGoals = 0;
  for (let seed = 1; seed <= 240; seed++) {
    const result = simulateMatch({
      home: { team: home, starters: home.squad, intent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 } } },
      away: { team: away, starters: away.squad, intent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50, pressIntensity: 50 } } },
      rng: mulberry32(seed),
    });
    for (const event of result.events) {
      if (event.type === 'goal' && event.team === 'home') {
        totalGoals++;
        if (event.description.includes('heads')) { headed++; }
      }
    }
  }
  return totalGoals > 0 ? headed / totalGoals : 0;
}

describe('PlayerGenerator — archetype effect on real match outcomes:', () => {
  test('a targetman striker produces a higher share of headed goals than a poacher', () => {
    expect(headedGoalShare('targetman')).toBeGreaterThan(headedGoalShare('poacher'));
  });
});
