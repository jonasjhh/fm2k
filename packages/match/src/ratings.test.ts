import { calculateOverall, getTeamOVR, OVERALL_WEIGHTS } from './ratings.ts';
import type { Player, PlayerAttributes } from './shared/types.ts';

// Distinct values per attribute so every weight is exercised independently.
const ATTRS: PlayerAttributes = {
  finishing: 10, technique: 20, passing: 30, speed: 40, strength: 50,
  defending: 60, stamina: 70, agility: 80, awareness: 90, composure: 100,
};
// 10*.15 + 20*.15 + (30+40+50+60+70+80+90+100)*.1 = 1.5 + 3 + 52 = 56.5
const EXPECTED = 56.5;

function player(id: string, attributes: PlayerAttributes): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes };
}

describe('ratings:', () => {
  it('weights sum to 1.1 (finishing/technique heavier)', () => {
    const sum = Object.values(OVERALL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.1, 6);
    expect(OVERALL_WEIGHTS.finishing).toBeCloseTo(0.15, 6);
    expect(OVERALL_WEIGHTS.passing).toBeCloseTo(0.10, 6);
  });

  it('calculateOverall applies the per-attribute weights exactly', () => {
    expect(calculateOverall(ATTRS)).toBeCloseTo(EXPECTED, 6);
  });

  it('getTeamOVR is the rounded mean of player overalls', () => {
    expect(getTeamOVR([])).toBe(0);
    expect(getTeamOVR([player('a', ATTRS)])).toBe(Math.round(EXPECTED)); // 57
    const lower: PlayerAttributes = { ...ATTRS, finishing: 0, technique: 0 };
    // second player overall = 56.5 - 10*.15 - 20*.15 = 56.5 - 4.5 = 52 → mean (56.5+52)/2 = 54.25 → 54
    expect(getTeamOVR([player('a', ATTRS), player('b', lower)])).toBe(54);
  });
});
