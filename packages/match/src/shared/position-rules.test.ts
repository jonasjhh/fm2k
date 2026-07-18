import { getPositionModifier, getEffectiveAttributes } from './position-rules.ts';
import type { Player } from './types.ts';

const basePlayer: Player = {
  id: 'p1', name: 'Test', nationality: 'norwegian', age: 25, position: 'CM', potential: 80,
  attributes: {
    speed: 80, strength: 80, passing: 80, finishing: 80,
    technique: 80, defending: 80, stamina: 80, goalkeeping: 10,
  },
};

describe('getPositionModifier:', () => {
  it('returns 1.0 for natural position', () => {
    expect(getPositionModifier('CM', 'CM')).toBe(1.0);
    expect(getPositionModifier('GK', 'GK')).toBe(1.0);
    expect(getPositionModifier('ST', 'ST')).toBe(1.0);
  });

  it('returns 0.90 for secondary position', () => {
    expect(getPositionModifier('CB', 'LB')).toBe(0.90);
    expect(getPositionModifier('CB', 'RB')).toBe(0.90);
    expect(getPositionModifier('CM', 'LM')).toBe(0.90);
    expect(getPositionModifier('RW', 'ST')).toBe(0.90);
  });

  it('returns 0.75 for out-of-position', () => {
    expect(getPositionModifier('GK', 'ST')).toBe(0.75);
    expect(getPositionModifier('ST', 'GK')).toBe(0.75);
    expect(getPositionModifier('CB', 'LW')).toBe(0.75);
    expect(getPositionModifier('LB', 'CB')).toBe(0.75);
  });

  it('is not symmetric — secondary adjacency is one-directional', () => {
    // LW can play ST (secondary), but ST cannot play LW (out of position)
    expect(getPositionModifier('LW', 'ST')).toBe(0.90);
    expect(getPositionModifier('ST', 'LW')).toBe(0.90); // ST has LW as secondary
  });
});

describe('getEffectiveAttributes:', () => {
  it('returns original attributes when fielded in natural position', () => {
    const result = getEffectiveAttributes(basePlayer, 'CM');
    expect(result).toBe(basePlayer.attributes);
  });

  it('scales all attributes by 0.90 for secondary position', () => {
    const result = getEffectiveAttributes(basePlayer, 'LM'); // CM → LM is secondary
    expect(result.passing).toBe(72);
    expect(result.speed).toBe(72);
    expect(result.finishing).toBe(72);
  });

  it('scales all attributes by 0.75 for out-of-position', () => {
    const result = getEffectiveAttributes(basePlayer, 'GK');
    expect(result.passing).toBe(60);
    expect(result.speed).toBe(60);
  });
});
