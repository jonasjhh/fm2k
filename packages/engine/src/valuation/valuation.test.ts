import { getTeamOVR, sellPrice } from './valuation.ts';
import { calculateOverall } from '../transfer/transfer-manager.ts';
import type { Player, PlayerAttributes } from '../shared/types.ts';

function attrs(value: number): PlayerAttributes {
  return {
    speed: value, strength: value, agility: value, passing: value, finishing: value,
    technique: value, defending: value, stamina: value, awareness: value, composure: value,
  };
}

function makePlayer(id: string, value: number): Player {
  return { id, name: id, nationality: 'n', age: 25, position: 'CM', potential: 70, attributes: attrs(value) };
}

describe('getTeamOVR:', () => {
  it('given no starters then returns zero', () => {
    expect(getTeamOVR([])).toBe(0);
  });

  it('given identical starters then the average equals that player\'s overall', () => {
    const team = [makePlayer('a', 70), makePlayer('b', 70), makePlayer('c', 70)];
    expect(getTeamOVR(team)).toBe(Math.round(calculateOverall(attrs(70))));
  });

  it('given mixed starters then the result lies between the lowest and highest overall', () => {
    const lo = Math.round(calculateOverall(attrs(40)));
    const hi = Math.round(calculateOverall(attrs(90)));
    const ovr = getTeamOVR([makePlayer('a', 40), makePlayer('b', 90)]);
    expect(ovr).toBeGreaterThanOrEqual(lo);
    expect(ovr).toBeLessThanOrEqual(hi);
  });
});

describe('sellPrice:', () => {
  it('given a worthless player then the price is floored at 1,000', () => {
    expect(sellPrice(attrs(0))).toBe(1_000);
  });

  it('given a capable player then the price is overall * 5,000', () => {
    const expected = Math.round(calculateOverall(attrs(80))) * 5_000;
    expect(sellPrice(attrs(80))).toBe(expected);
  });
});
