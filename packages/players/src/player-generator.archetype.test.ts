/**
 * Archetype attribute bias — a stat-level check that the PlayerGenerator's named archetypes
 * actually shape the eight attributes the way their identity implies. This is purely a
 * generator test (no match simulation): whether those attribute differences then play out on
 * the pitch — e.g. a strong striker heading more — is the engine's job, covered by the match
 * package's aerial/finishing tests. Keeping the two scopes separate is deliberate: comparing
 * randomly generated players through a match confounds "did the generator bias the stats" with
 * "does the engine reward those stats", and a rolled targetman can be weaker than a rolled
 * poacher by pure variance.
 */
import { PlayerGenerator } from './player-generator.ts';

function mb(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mean of one attribute over many generated strikers of an archetype. Each call reseeds the
 *  same stream, so two archetypes are compared over identical RNG draws — the only difference
 *  is the archetype bias itself. */
function meanAttr(archetype: string, attr: 'strength' | 'finishing' | 'speed', n = 300): number {
  const gen = new PlayerGenerator('female', 'all', mb(1));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += gen.generatePlayer('ST', { overall: 70, archetype }).attributes[attr];
  }
  return sum / n;
}

describe('PlayerGenerator — archetype attribute bias:', () => {
  test('a targetman averages clearly higher strength than a poacher', () => {
    expect(meanAttr('targetman', 'strength')).toBeGreaterThan(meanAttr('poacher', 'strength'));
  });

  test('a poacher averages higher finishing and speed than a targetman', () => {
    expect(meanAttr('poacher', 'finishing')).toBeGreaterThan(meanAttr('targetman', 'finishing'));
    expect(meanAttr('poacher', 'speed')).toBeGreaterThan(meanAttr('targetman', 'speed'));
  });
});
