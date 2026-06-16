import { injuryChance, generateInjuries, INJURY_TYPES } from './injury.ts';
import type { Player, PlayerAttributes } from '../shared/types.ts';

function attrs(stamina: number): PlayerAttributes {
  return {
    speed: 60, strength: 60, agility: 60, passing: 60, finishing: 60,
    technique: 60, defending: 60, stamina, awareness: 60, composure: 60,
  };
}
function player(id: string, stamina = 60): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes: attrs(stamina) };
}

describe('injury model:', () => {
  it('injury chance rises as stamina falls', () => {
    expect(injuryChance(player('a', 20), 100)).toBeGreaterThan(injuryChance(player('b', 95), 100));
  });

  it('injury chance rises as end-of-match energy falls (workload)', () => {
    expect(injuryChance(player('a', 60), 20)).toBeGreaterThan(injuryChance(player('a', 60), 100));
  });

  it('chance stays within a sane band', () => {
    expect(injuryChance(player('a', 1), 0)).toBeLessThanOrEqual(0.2);
    expect(injuryChance(player('a', 99), 100)).toBeGreaterThanOrEqual(0.005);
  });

  it('rng below the chance produces an injury with a valid type and 1–3 base duration', () => {
    const injuries = generateInjuries([player('p', 10)], { p: 0 }, () => 0); // 0 < chance, then type idx 0, dur 1
    expect(injuries).toHaveLength(1);
    expect(INJURY_TYPES).toContain(injuries[0].type as typeof INJURY_TYPES[number]);
    expect(injuries[0].baseDuration).toBeGreaterThanOrEqual(1);
    expect(injuries[0].baseDuration).toBeLessThanOrEqual(3);
  });

  it('rng above the chance produces no injury', () => {
    expect(generateInjuries([player('p', 99)], { p: 100 }, () => 0.999)).toHaveLength(0);
  });
});
