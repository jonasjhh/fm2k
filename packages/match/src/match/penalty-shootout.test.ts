import { simulateShootout } from './penalty-shootout.ts';
import type { Team, Player, Formation } from '../shared/types.ts';

function createTestPlayer(id: string, position: string, quality = 70): Player {
  return {
    id, name: id, nationality: 'norwegian', age: 25, position: position as Player['position'], potential: quality,
    attributes: {
      speed: quality, strength: quality, agility: quality, passing: quality, finishing: quality,
      technique: quality, defending: quality, stamina: quality, awareness: quality, composure: quality,
    },
  };
}

function createTestTeam(id: string, quality = 70, formation: Formation = '4-4-2'): Team {
  return {
    id, name: id, formation,
    colors: { primary: '#fff', secondary: '#000' },
    starters: Array.from({ length: 11 }, (_, i) => createTestPlayer(`${id}-p${i}`, 'ST', quality)),
    substitutes: [],
  };
}

/** Deterministic PRNG (mulberry32) — varies per call so a shootout always resolves. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG cycling through a fixed list of values. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('simulateShootout:', () => {
  const home = createTestTeam('home');
  const away = createTestTeam('away');

  test('always returns a winner', () => {
    for (let s = 0; s < 50; s++) {
      const result = simulateShootout(home, away, mulberry32(s + 1));
      expect(result.winner === 'home' || result.winner === 'away').toBe(true);
      expect(result.home).not.toBe(result.away);
    }
  });

  test('winner has the higher shootout score', () => {
    const result = simulateShootout(home, away, mulberry32(123));
    if (result.winner === 'home') { expect(result.home).toBeGreaterThan(result.away); }
    else { expect(result.away).toBeGreaterThan(result.home); }
  });

  test('is deterministic given the same rng sequence', () => {
    const a = simulateShootout(home, away, mulberry32(42));
    const b = simulateShootout(home, away, mulberry32(42));
    expect(a).toEqual(b);
  });

  test('all home conversions and all away misses gives home the win', () => {
    // rng alternates: home kick (0.0 < prob → scores), away kick (0.99 ≥ prob → misses)
    const result = simulateShootout(home, away, seqRng([0.0, 0.99]));
    expect(result.winner).toBe('home');
    expect(result.away).toBe(0);
    expect(result.home).toBe(5);
  });

  test('goes to sudden death when regulation kicks are level', () => {
    // First 10 kicks (5 each) all score (rng 0.0), then a deciding pair: home scores, away misses.
    const rng = seqRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0.99]);
    const result = simulateShootout(home, away, rng);
    expect(result.winner).toBe('home');
    expect(result.home).toBe(6);
    expect(result.away).toBe(5);
  });

  test('sudden death won by the away team (home misses, away scores)', () => {
    // 5-5 after regulation, then the deciding pair: home misses (0.99), away scores (0.0).
    const rng = seqRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99, 0.0]);
    const result = simulateShootout(home, away, rng);
    expect(result.winner).toBe('away');
    expect(result.home).toBe(5);
    expect(result.away).toBe(6);
  });
});
