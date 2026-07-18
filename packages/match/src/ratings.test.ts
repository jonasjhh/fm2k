import { calculateOverall, getTeamOVR, OVERALL_WEIGHTS } from './ratings.ts';
import type { Player, PlayerAttributes } from './shared/types.ts';

// Distinct values per attribute so every weight is exercised independently.
const ATTRS: PlayerAttributes = {
  finishing: 10, technique: 20, passing: 30, speed: 40, strength: 50,
  defending: 60, stamina: 70, keeping: 80,
};
// 10*.16 + 20*.16 + 30*.13 + 40*.14 + 50*.13 + 60*.14 + 70*.14 + 80*0 = 39
const EXPECTED = 39;

function player(id: string, attributes: PlayerAttributes): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes };
}

describe('ratings:', () => {
  it('weights sum to 1 (finishing/technique heavier, keeping weightless)', () => {
    const sum = Object.values(OVERALL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(OVERALL_WEIGHTS.finishing).toBeCloseTo(0.16, 6);
    expect(OVERALL_WEIGHTS.passing).toBeCloseTo(0.13, 6);
    expect(OVERALL_WEIGHTS.keeping).toBe(0);
  });

  it('calculateOverall applies the per-attribute weights exactly', () => {
    expect(calculateOverall(ATTRS)).toBeCloseTo(EXPECTED, 6);
  });

  it('getTeamOVR is the rounded mean of player overalls', () => {
    expect(getTeamOVR([])).toBe(0);
    expect(getTeamOVR([player('a', ATTRS)])).toBe(Math.round(EXPECTED)); // 39
    const lower: PlayerAttributes = { ...ATTRS, finishing: 0, technique: 0 };
    // second player overall = 39 - 10*.16 - 20*.16 = 39 - 4.8 = 34.2 → mean (39+34.2)/2 = 36.6 → 37
    expect(getTeamOVR([player('a', ATTRS), player('b', lower)])).toBe(37);
  });
});
