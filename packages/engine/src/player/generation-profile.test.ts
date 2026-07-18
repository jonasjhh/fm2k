import {
  divisionOverallDistribution, divisionCategoryBias, ageOverallBump, starBonus,
  STAR_CHANCE, STAR_BONUS,
} from './generation-profile.ts';

describe('divisionOverallDistribution:', () => {
  test('top-flight mean sits near the common base with small nation offsets', () => {
    expect(divisionOverallDistribution('england', 1).mean).toBe(58);
    expect(divisionOverallDistribution('norway', 1).mean).toBe(53);
    expect(divisionOverallDistribution('denmark', 1).mean).toBe(52);
  });

  test('division penalties land the user bands: div 2 ≈ 20–50, div 3 ≈ 10–40', () => {
    expect(divisionOverallDistribution('england', 2).mean).toBe(38);
    expect(divisionOverallDistribution('england', 3).mean).toBe(28);
    expect(divisionOverallDistribution('norway', 2).mean).toBe(33);
    expect(divisionOverallDistribution('norway', 3).mean).toBe(23);
  });

  test('never drops the mean below the floor of 15', () => {
    expect(divisionOverallDistribution('denmark', 10).mean).toBe(15);
  });

  test('has no min/max clamp, leaving the tails to the bell curve', () => {
    const dist = divisionOverallDistribution('england', 1);
    expect(dist.min).toBeUndefined();
    expect(dist.max).toBeUndefined();
  });

  test('stdDev widens only gently per tier (bands stay ~±15 with overlap)', () => {
    expect(divisionOverallDistribution('england', 1).stdDev).toBe(7);
    expect(divisionOverallDistribution('england', 2).stdDev).toBe(7.5);
    expect(divisionOverallDistribution('england', 3).stdDev).toBe(8);
  });
});

describe('ageOverallBump:', () => {
  test('youngsters arrive raw, the prime peaks at +8, veterans ease off', () => {
    expect(ageOverallBump(17)).toBe(0);
    expect(ageOverallBump(21)).toBeGreaterThan(0);
    expect(ageOverallBump(21)).toBeLessThan(8);
    expect(ageOverallBump(26)).toBe(8);
    expect(ageOverallBump(31)).toBe(8);
    expect(ageOverallBump(35)).toBe(4);
  });
});

describe('starBonus:', () => {
  test('fires only in the top flight and only on a rare roll', () => {
    expect(starBonus(1, () => STAR_CHANCE / 2)).toBe(STAR_BONUS);
    expect(starBonus(1, () => 0.5)).toBe(0);
    expect(starBonus(2, () => 0)).toBe(0);
  });
});

describe('divisionCategoryBias:', () => {
  test('applies no bias at the top division', () => {
    expect(divisionCategoryBias(1)).toEqual({ technical: 0 });
  });

  test('widens the technical penalty with each division below the top', () => {
    expect(divisionCategoryBias(2)).toEqual({ technical: -3 });
    expect(divisionCategoryBias(3)).toEqual({ technical: -6 });
  });
});
