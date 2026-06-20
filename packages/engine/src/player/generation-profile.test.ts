import { divisionOverallDistribution, divisionCategoryBias } from './generation-profile.ts';

describe('divisionOverallDistribution:', () => {
  test('uses the nation base overall as the mean for the top division', () => {
    expect(divisionOverallDistribution('england', 1).mean).toBe(72);
    expect(divisionOverallDistribution('norway', 1).mean).toBe(63);
  });

  test('shifts the mean down by the division penalty per level below 1', () => {
    expect(divisionOverallDistribution('england', 2).mean).toBe(63);
    expect(divisionOverallDistribution('england', 3).mean).toBe(54);
  });

  test('never drops the mean below a floor of 20', () => {
    expect(divisionOverallDistribution('denmark', 10).mean).toBe(20);
  });

  test('has no min/max clamp, leaving the tails to the bell curve', () => {
    const dist = divisionOverallDistribution('england', 1);
    expect(dist.min).toBeUndefined();
    expect(dist.max).toBeUndefined();
  });
});

describe('divisionCategoryBias:', () => {
  test('applies no bias at the top division', () => {
    expect(divisionCategoryBias(1)).toEqual({ technical: 0, mental: 0 });
  });

  test('widens the technical/mental penalty with each division below the top', () => {
    expect(divisionCategoryBias(2)).toEqual({ technical: -3, mental: -4 });
    expect(divisionCategoryBias(3)).toEqual({ technical: -6, mental: -8 });
  });
});
