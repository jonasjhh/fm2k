import {
  positionLoad, staminaResistance, staminaTravelFactor, tempoFactor, pressFactor,
  perMinuteDrain, physicalFatigueMult, skillFatigueMult, applyFatigue,
} from './fatigue.ts';
import { NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import type { Player, PlayerAttributes } from '../shared/types.ts';

function attrs(v: number, over: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return {
    speed: v, strength: v, passing: v, finishing: v,
    technique: v, defending: v, stamina: v, goalkeeping: 10, ...over,
  };
}
function player(position: Player['position'], a: PlayerAttributes): Player {
  return { id: 'p', name: 'p', nationality: 'n', age: 25, position, potential: 70, attributes: a };
}

describe('fatigue — position load (formation-aware):', () => {
  it('midfielders run more than defenders, who run more than the keeper', () => {
    expect(positionLoad('4-4-2', 'CM')).toBeGreaterThan(positionLoad('4-4-2', 'CB'));
    expect(positionLoad('4-4-2', 'CB')).toBeGreaterThan(positionLoad('4-4-2', 'GK'));
  });
  it('a lone striker chases more than a striker in a front two', () => {
    expect(positionLoad('5-4-1', 'ST')).toBeGreaterThan(positionLoad('4-4-2', 'ST'));
  });
  it('a back five spreads defensive duty over more bodies, so each defender runs less than in a flat four', () => {
    expect(positionLoad('5-3-2', 'LB')).toBeLessThan(positionLoad('4-4-2', 'LB'));
  });
  it('a back three has fewer bodies, so each defender runs more than in a flat four', () => {
    expect(positionLoad('3-5-2', 'LB')).toBeGreaterThan(positionLoad('4-4-2', 'LB'));
  });
  it('within the defensive line: all defenders are in the same range (DEF line base)', () => {
    const cb = positionLoad('4-4-2', 'CB');
    const lb = positionLoad('4-4-2', 'LB');
    expect(cb).toBeGreaterThan(0.5);
    expect(lb).toBeGreaterThan(0.5);
    expect(cb).toBeLessThan(positionLoad('4-4-2', 'CM'));
  });
  it('within the attacking line: ST < LW/RW', () => {
    expect(positionLoad('4-4-2', 'ST')).toBeLessThan(positionLoad('4-3-3', 'LW'));
  });
  it('the keeper still runs the least of all roles', () => {
    expect(positionLoad('4-4-2', 'GK')).toBeLessThan(positionLoad('4-4-2', 'CB'));
  });
});

describe('fatigue — drain factors (neutral at 50):', () => {
  it('tempo/press factors are exactly 1.0 at the neutral value', () => {
    expect(tempoFactor(50)).toBeCloseTo(1.0);
    expect(pressFactor(50)).toBeCloseTo(1.0);
  });
  it('running harder costs more', () => {
    expect(tempoFactor(100)).toBeGreaterThan(tempoFactor(0));
    expect(pressFactor(100)).toBeGreaterThan(pressFactor(0));
  });
  it('higher stamina resists drain', () => {
    expect(staminaResistance(20)).toBeGreaterThan(staminaResistance(99));
  });
});

describe('fatigue — per-minute drain:', () => {
  it('a low-stamina player drains faster than a high-stamina one in the same role', () => {
    const low = player('CM', attrs(50, { stamina: 20 , goalkeeping: 10 }));
    const high = player('CM', attrs(50, { stamina: 95 , goalkeeping: 10 }));
    expect(perMinuteDrain(low, '4-4-2', NEUTRAL_PARAMS)).toBeGreaterThan(
      perMinuteDrain(high, '4-4-2', NEUTRAL_PARAMS));
  });
  it('a high-tempo, high-press plan drains more than a passive one', () => {
    const p = player('CM', attrs(50));
    const intense = { ...NEUTRAL_PARAMS, tempo: 90, pressIntensity: 90 };
    const passive = { ...NEUTRAL_PARAMS, tempo: 20, pressIntensity: 20 };
    expect(perMinuteDrain(p, '4-4-2', intense)).toBeGreaterThan(
      perMinuteDrain(p, '4-4-2', passive));
  });
});

describe('fatigue — movement drain (TASK_19):', () => {
  it('staminaTravelFactor is neutral at 50 and swings ≈ ±50%, never zero', () => {
    expect(staminaTravelFactor(50)).toBeCloseTo(1.0);
    expect(staminaTravelFactor(0)).toBeCloseTo(1.5);
    expect(staminaTravelFactor(100)).toBeCloseTo(0.5);
    expect(staminaTravelFactor(99)).toBeGreaterThan(0);
  });
  it('travelling further this minute drains more energy', () => {
    const p = player('CM', attrs(50));
    expect(perMinuteDrain(p, '4-4-2', NEUTRAL_PARAMS, 0.2)).toBeGreaterThan(
      perMinuteDrain(p, '4-4-2', NEUTRAL_PARAMS, 0));
  });
  it('a higher-stamina player pays a smaller penalty for the same distance', () => {
    const low = player('CM', attrs(50, { stamina: 20 }));
    const high = player('CM', attrs(50, { stamina: 95 }));
    const lowCost = perMinuteDrain(low, '4-4-2', NEUTRAL_PARAMS, 0.2) - perMinuteDrain(low, '4-4-2', NEUTRAL_PARAMS, 0);
    const highCost = perMinuteDrain(high, '4-4-2', NEUTRAL_PARAMS, 0.2) - perMinuteDrain(high, '4-4-2', NEUTRAL_PARAMS, 0);
    expect(lowCost).toBeGreaterThan(highCost);
  });
});

describe('fatigue — effect on attributes (legs before touch):', () => {
  it('multipliers are 1.0 when fresh and fall as energy drops', () => {
    expect(physicalFatigueMult(100)).toBeCloseTo(1.0);
    expect(skillFatigueMult(100)).toBeCloseTo(1.0);
    expect(physicalFatigueMult(0)).toBeLessThan(1.0);
  });
  it('physical attributes fade further than technical ones at the same energy', () => {
    expect(physicalFatigueMult(0)).toBeLessThan(skillFatigueMult(0));
  });
  it('applyFatigue drops speed more than passing as a player tires', () => {
    const fresh = attrs(80);
    const tired = applyFatigue(fresh, 0);
    const speedDrop = fresh.speed - tired.speed;
    const passDrop = fresh.passing - tired.passing;
    expect(speedDrop).toBeGreaterThan(passDrop);
    expect(applyFatigue(fresh, 100).speed).toBeCloseTo(fresh.speed);
  });
});
