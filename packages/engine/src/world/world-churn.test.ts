import {
  retirementChance, makeYouth, churnSquad, churnFreeAgents, runAiMarket, academyBiasForLevel, type YouthFactory,
} from './world-churn.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';
import type { YouthBias } from '../club/facilities/facility-types.ts';

const NO_BIAS: YouthBias = {
  overallBonus: 0, potentialRangeBonus: [0, 0], nationalityPool: [],
  gkOverallBonus: 0, gkPotentialRangeBonus: [0, 0],
};

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, agility: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, awareness: v, composure: v };
}

function player(over: Partial<Player> & { id: string }, attrValue = 60): Player {
  return { name: over.id, nationality: 'norwegian', age: 24, position: 'CM', potential: 75, attributes: attrs(attrValue), ...over };
}

// A youth factory that simply echoes its spec so generated youth are inspectable.
let youthSeq = 0;
const youthFactory: YouthFactory = (position, spec) => ({
  id: `youth-${youthSeq++}`, name: 'Prospect', nationality: spec.nationality,
  age: spec.age, position, potential: spec.potential, attributes: attrs(spec.overall),
});

beforeEach(() => { youthSeq = 0; });

describe('retirementChance:', () => {
  it('is zero before 31 and (near) certain at 40+', () => {
    expect(retirementChance(28, 70)).toBe(0);
    expect(retirementChance(30, 70)).toBe(0);
    expect(retirementChance(41, 90)).toBe(0.98);
  });

  it('rises with age', () => {
    expect(retirementChance(36, 65)).toBeGreaterThan(retirementChance(32, 65));
  });

  it('is resisted by current skill — elite players keep going', () => {
    expect(retirementChance(34, 88)).toBeLessThan(retirementChance(34, 62));
  });

  it('models the equilibrium: an elite veteran whose skill has decayed becomes likely to retire', () => {
    const elitePrime = retirementChance(34, 88);   // still going
    const eliteDecayed = retirementChance(37, 70);  // skill eroded + older
    expect(elitePrime).toBeLessThan(0.15);
    expect(eliteDecayed).toBeGreaterThan(elitePrime);
  });
});

describe('makeYouth:', () => {
  it('mints a 16–19 prospect in the requested position with bias-banded potential', () => {
    const y = makeYouth('ST', academyBiasForLevel(4), 'spanish', youthFactory, () => 0.5);
    expect(y.position).toBe('ST');
    expect(y.nationality).toBe('spanish');
    expect(y.age).toBeGreaterThanOrEqual(16);
    expect(y.age).toBeLessThanOrEqual(19);
    // L4-equivalent potential band is [72, 96]; rng=0.5 → midpoint.
    expect(y.potential).toBeGreaterThanOrEqual(72);
    expect(y.potential).toBeLessThanOrEqual(96);
  });

  it('better academies produce higher-potential youth on average', () => {
    const rng = () => 0.8;
    expect(makeYouth('CM', academyBiasForLevel(4), 'n', youthFactory, rng).potential)
      .toBeGreaterThan(makeYouth('CM', academyBiasForLevel(1), 'n', youthFactory, rng).potential);
  });

  it('with no bias built, falls back to the unfacilitated floor', () => {
    const y = makeYouth('ST', NO_BIAS, 'spanish', youthFactory, () => 0);
    expect(y.potential).toBeGreaterThanOrEqual(54);
    expect(y.potential).toBeLessThanOrEqual(72);
  });

  it('a goalkeeper intake uses the bias\'s gk-specific bonuses, not its outfield ones', () => {
    const bias: YouthBias = {
      overallBonus: 0, potentialRangeBonus: [0, 0], nationalityPool: [],
      gkOverallBonus: 20, gkPotentialRangeBonus: [20, 20],
    };
    const gk = makeYouth('GK', bias, 'n', youthFactory, () => 0.5);
    const outfield = makeYouth('ST', bias, 'n', youthFactory, () => 0.5);
    expect(gk.potential).toBeGreaterThan(outfield.potential);
  });

  it('a non-empty nationalityPool overrides the passed nationality', () => {
    const bias: YouthBias = { ...NO_BIAS, nationalityPool: ['brazilian'] };
    const y = makeYouth('ST', bias, 'norwegian', youthFactory, () => 0.5);
    expect(y.nationality).toBe('brazilian');
  });
});

describe('churnSquad:', () => {
  const opts = (rng: () => number, extra: Partial<Parameters<typeof churnSquad>[1]> = {}) =>
    ({ rng, youthFactory, nationality: 'norwegian', growthBonus: 0.2, ceilingBonus: 11, academyBias: academyBiasForLevel(3), ...extra });

  it('ages and develops everyone when nobody retires (no overflow)', () => {
    const squad = [player({ id: 'a', age: 18, potential: 90 }, 45), player({ id: 'b', age: 20, potential: 85 }, 45)];
    const res = churnSquad(squad, opts(() => 0));
    expect(res.retired).toHaveLength(0);
    expect(res.squad).toHaveLength(2);
    expect(res.overflow).toHaveLength(0);
    expect(res.squad.every(p => p.age >= 19)).toBe(true);
    expect(res.developed.length).toBeGreaterThan(0);
  });

  it('caps direct intake: only maxIntake youth join, the rest are overflow and the squad shrinks', () => {
    const squad = [
      player({ id: 'gk', age: 41, position: 'GK' }, 50),
      player({ id: 'st', age: 41, position: 'ST' }, 50),
      player({ id: 'cb', age: 41, position: 'CB' }, 50),
    ];
    const res = churnSquad(squad, opts(() => 0, { maxIntake: 1 })); // all retire at age 42 / rng 0
    expect(res.retired).toHaveLength(3);
    expect(res.youth).toHaveLength(1);             // only 1 joins directly
    expect(res.overflow).toHaveLength(2);          // the other 2 retiree positions overflow
    expect(res.squad).toHaveLength(1);             // survivors (0) + 1 intake
    expect(res.overflow.sort()).toEqual(['CB', 'ST']); // first retiree (GK) was the intake
  });

  it('uses the supplied regiment for development', () => {
    const squad = [player({ id: 'x', age: 18, potential: 95 }, 40)];
    const res = churnSquad(squad, opts(() => 0, { regimentOf: () => 'finishing' }));
    const grown = res.squad[0];
    expect(grown.attributes.finishing).toBeGreaterThan(40);
    expect(grown.attributes.defending).toBe(40);
  });
});

describe('churnFreeAgents:', () => {
  it('replaces its own retirees 1:1 and mints the supplied club overflow (conserving population)', () => {
    const pool = [player({ id: 'old1', age: 42 }, 50), player({ id: 'kid', age: 22 }, 55)];
    const res = churnFreeAgents(pool, {
      rng: () => 0, youthFactory,
      overflow: [{ position: 'ST', nationality: 'norwegian' }, { position: 'CB', nationality: 'english' }],
    });
    // old1 retires (→1 replacement youth), kid survives; +2 overflow youth = 1 survivor + 3 youth
    expect(res).toHaveLength(4);
    expect(res.filter(p => p.id.startsWith('youth-'))).toHaveLength(3);
    expect(res.find(p => p.id === 'kid')?.age).toBe(23);
  });

  it('with no retirements and no overflow, the pool only ages', () => {
    const pool = [player({ id: 'kid', age: 22 }, 55)];
    const res = churnFreeAgents(pool, { rng: () => 0, youthFactory, overflow: [] });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('kid');
  });
});

describe('runAiMarket:', () => {
  it('upgrades a club\'s weakest slot from the pool, releasing the cast-off (size preserved)', () => {
    const team = { id: 't', squad: [player({ id: 'weak', position: 'ST' }, 60), player({ id: 'ok', position: 'CM' }, 75)] };
    const pool = [player({ id: 'better', position: 'ST' }, 64)];
    const res = runAiMarket([team], pool, { rng: () => 0, activity: 1, improveThreshold: 2, targetSizes: { t: 2 } });
    const squad = res.teams[0].squad;
    expect(squad.some(p => p.id === 'better')).toBe(true);
    expect(squad.some(p => p.id === 'weak')).toBe(false);
    expect(res.freeAgents.some(p => p.id === 'weak')).toBe(true);
    expect(squad).toHaveLength(2);
  });

  it('refills a short squad toward its target from the pool', () => {
    const team = { id: 't', squad: [player({ id: 'a', position: 'CM' }, 70)] };
    const pool = [player({ id: 'x', position: 'ST' }, 55), player({ id: 'y', position: 'GK' }, 55)];
    const res = runAiMarket([team], pool, { rng: () => 0, activity: 1, targetSizes: { t: 3 } });
    expect(res.teams[0].squad).toHaveLength(3);
    expect(res.freeAgents).toHaveLength(0); // both drawn in
  });

  it('trims a squad above the 25-player cap, releasing the lowest-value players', () => {
    const squad = Array.from({ length: 27 }, (_, i) => player({ id: `p${i}`, position: 'CM' }, 50));
    const res = runAiMarket([{ id: 't', squad }], [], { rng: () => 0, activity: 1, targetSizes: { t: 27 } });
    expect(res.teams[0].squad).toHaveLength(25);
    expect(res.freeAgents).toHaveLength(2);
  });

  it('consolidates two weak players into one stronger signing (net -1, quality up)', () => {
    const team = { id: 't', squad: [
      player({ id: 'w1', position: 'CM' }, 40),
      player({ id: 'w2', position: 'CB' }, 40),
      player({ id: 'ok', position: 'ST' }, 70),
    ] };
    const pool = [player({ id: 'star', position: 'CM' }, 88)];
    const res = runAiMarket([team], pool, { rng: () => 0, activity: 1, targetSizes: { t: 2 } });
    const squad = res.teams[0].squad;
    expect(squad.some(p => p.id === 'star')).toBe(true);
    expect(squad.some(p => p.id === 'w1')).toBe(false);
    expect(squad.some(p => p.id === 'w2')).toBe(false);
    expect(squad).toHaveLength(2); // 3 - 2 + 1
  });

  it('records each player movement with its team, direction, and identity (for news headlines)', () => {
    const team = { id: 't', squad: [player({ id: 'weak', position: 'ST' }, 60), player({ id: 'ok', position: 'CM' }, 75)] };
    const pool = [player({ id: 'better', position: 'ST' }, 64)];
    const res = runAiMarket([team], pool, { rng: () => 0, activity: 1, improveThreshold: 2, targetSizes: { t: 2 } });
    expect(res.moves).toEqual([
      { teamId: 't', playerId: 'weak', playerName: 'weak', direction: 'released' },
      { teamId: 't', playerId: 'better', playerName: 'better', direction: 'signed' },
    ]);
  });

  it('skips a club when its activity roll fails', () => {
    const team = { id: 't', squad: [player({ id: 'weak', position: 'ST' }, 40)] };
    const pool = [player({ id: 'better', position: 'ST' }, 90)];
    const res = runAiMarket([team], pool, { rng: () => 0.99, activity: 0.5, targetSizes: { t: 5 } });
    expect(res.moves).toHaveLength(0);
  });
});
