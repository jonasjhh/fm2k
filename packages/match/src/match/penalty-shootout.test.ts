import { simulateShootout } from './penalty-shootout.ts';
import type { Player } from '../shared/types.ts';
import { mulberry32 } from './distribution.ts';
import { createUniformPlayer } from './test-fixtures.ts';

function createTestPlayer(id: string, position: Player['position'], quality = 70): Player {
  return createUniformPlayer(id, id, position, quality);
}

function createTestXI(id: string, quality = 70): Player[] {
  return Array.from({ length: 11 }, (_, i) => createTestPlayer(`${id}-p${i}`, 'ST', quality));
}

/** Deterministic RNG cycling through a fixed list of values. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('simulateShootout:', () => {
  const home = createTestXI('home');
  const away = createTestXI('away');

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
