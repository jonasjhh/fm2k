import {
  retirementChance, makeYouth, makeBackfillPlayer, churnSquad, churnFreeAgents, expireFreeAgency, FREE_AGENCY_MIN_AGE, runAiMarket, academyBiasForLevel, facilityForLevel, trainingBonusesForLevel, type YouthFactory,
} from './world-churn.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';
import type { YouthBias } from '../club/facilities/facility-types.ts';

const NO_BIAS: YouthBias = {
  overallBonus: 0, potentialRangeBonus: [0, 0], nationalityPool: [],
  intakeAgeBias: 0, wonderkidChance: 0,
};

function attrs(v: number): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10 };
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
    expect(elitePrime).toBeLessThan(0.20);
    expect(eliteDecayed).toBeGreaterThan(elitePrime);
  });
});

describe('AI facility approximations:', () => {
  it('maps division level to a facility tier, clamped at both ends', () => {
    expect(facilityForLevel(1)).toBe(4); // top flight gets the elite approximation
    expect(facilityForLevel(2)).toBe(3);
    expect(facilityForLevel(4)).toBe(1); // and it never drops below the unfacilitated floor
    expect(facilityForLevel(9)).toBe(1);
    expect(facilityForLevel(0)).toBe(4);
  });

  it('maps facility tier to training axes that rise with tier and floor off the scale', () => {
    const levels = [1, 2, 3, 4].map(trainingBonusesForLevel);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].growthBonus).toBeGreaterThan(levels[i - 1].growthBonus);
      expect(levels[i].ceilingBonus).toBeGreaterThan(levels[i - 1].ceilingBonus);
    }
    expect(trainingBonusesForLevel(1)).toEqual({ growthBonus: 0, ceilingBonus: 0 });
    expect(trainingBonusesForLevel(99)).toEqual({ growthBonus: 0, ceilingBonus: 0 });
  });
});

describe('makeYouth:', () => {
  it('mints a 16–19 prospect in the requested position with bias-banded potential', () => {
    const y = makeYouth('ST', academyBiasForLevel(4), 'spanish', youthFactory, () => 0.5);
    expect(y.position).toBe('ST');
    expect(y.nationality).toBe('spanish');
    expect(y.age).toBeGreaterThanOrEqual(16);
    expect(y.age).toBeLessThanOrEqual(19);
    // L4-equivalent potential band is [58, 86]; rng=0.5 → midpoint.
    expect(y.potential).toBeGreaterThanOrEqual(58);
    expect(y.potential).toBeLessThanOrEqual(86);
  });

  it('better academies produce higher-potential youth on average', () => {
    const rng = () => 0.8;
    expect(makeYouth('CM', academyBiasForLevel(4), 'n', youthFactory, rng).potential)
      .toBeGreaterThan(makeYouth('CM', academyBiasForLevel(1), 'n', youthFactory, rng).potential);
  });

  it('with no bias built, falls back to the unfacilitated floor', () => {
    const y = makeYouth('ST', NO_BIAS, 'spanish', youthFactory, () => 0);
    expect(y.potential).toBeGreaterThanOrEqual(40);
    expect(y.potential).toBeLessThanOrEqual(62);
  });

  it('treats every position alike — a keeper prospect is generated exactly as an outfielder is', () => {
    // No academy wing is position-scoped: a bonus that only pays out when a random retirement
    // happens to match a position is a lottery ticket, not a purchase decision.
    const bias: YouthBias = { ...NO_BIAS, overallBonus: 8, potentialRangeBonus: [10, 10] };
    const gk = makeYouth('GK', bias, 'n', youthFactory, () => 0.5);
    const outfield = makeYouth('ST', bias, 'n', youthFactory, () => 0.5);
    expect(gk.potential).toBe(outfield.potential);
    expect(gk.attributes).toEqual(outfield.attributes);
  });

  it('an age bias finds prospects younger without collapsing the range onto one year', () => {
    const young = makeYouth('CM', { ...NO_BIAS, intakeAgeBias: 1 }, 'n', youthFactory, () => 0.99);
    expect(young.age).toBe(18); // top of 16–18 rather than 16–19
    // However many wings stack, at least one year of spread survives.
    const floored = makeYouth('CM', { ...NO_BIAS, intakeAgeBias: 99 }, 'n', youthFactory, () => 0.99);
    expect(floored.age).toBe(16);
  });

  it('the wonderkid tail lifts potential above the band, and is only rolled when bought', () => {
    const bias = { ...NO_BIAS, wonderkidChance: 1 };
    // rng 0.5 → mid-band potential 51; the tail adds 8 + round(0.5 * 7) = 12.
    expect(makeYouth('CM', bias, 'n', youthFactory, () => 0.5).potential).toBe(63);
    // With no chance bought, no roll is drawn at all — so the stream is unchanged for every
    // other club in the world.
    let calls = 0;
    const counting = () => { calls++; return 0.5; };
    makeYouth('CM', NO_BIAS, 'n', youthFactory, counting);
    const withoutTail = calls;
    calls = 0;
    makeYouth('CM', bias, 'n', youthFactory, counting);
    expect(calls).toBeGreaterThan(withoutTail);
  });

  it('a non-empty nationalityPool overrides the passed nationality', () => {
    const bias: YouthBias = { ...NO_BIAS, nationalityPool: ['brazilian'] };
    const y = makeYouth('ST', bias, 'norwegian', youthFactory, () => 0.5);
    expect(y.nationality).toBe('brazilian');
  });
});

describe('makeBackfillPlayer:', () => {
  const rngOf = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };
  const ovrOf = (p: Player) => p.attributes.speed; // echo factory stores overall in every attr

  it('the common band mints a D3/D2 filler in the 30–55 range, aged 21–32', () => {
    // band 0.99 → filler; overall 30 + 0.5·25 = 43; age 21 + floor(0.5·12) = 27; potential 43 + 2
    const p = makeBackfillPlayer('CM', 'n', youthFactory, rngOf(0.99, 0.5, 0.5, 0.5));
    expect(ovrOf(p)).toBe(43);
    expect(p.age).toBe(27);
    expect(p.potential).toBe(45);
  });

  it('the mid band mints an upper-D2/lower-D1 player in the 55–70 range', () => {
    // band 0.2 (elite 0.1 ≤ 0.2 < 0.4) → 55 + 0.5·15 = 62.5 → 63
    const p = makeBackfillPlayer('ST', 'n', youthFactory, rngOf(0.2, 0.5, 0.5, 0.5));
    expect(ovrOf(p)).toBe(63);
  });

  it('the elite band tapers above 70 with near-spent potential when the wonderkid roll misses', () => {
    // band 0.05 → elite; overall 70 + 0.9·0.9·12 = 79.72 → 80; wonderkid roll 0.9 misses
    const p = makeBackfillPlayer('ST', 'n', youthFactory, rngOf(0.05, 0.9, 0.9, 0.9, 0.5, 0.5));
    expect(ovrOf(p)).toBe(80);
    expect(p.age).toBe(27);
    expect(p.potential).toBe(82);
  });

  it('the super-rare wonderkid branch mints an 18–19-year-old elite with big headroom', () => {
    // band 0.05 → elite (overall 80); wonderkid roll 0 hits; potential 80 + 8 + round(0.5·7) = 92; age 19
    const p = makeBackfillPlayer('ST', 'n', youthFactory, rngOf(0.05, 0.9, 0.9, 0, 0.5, 0.5));
    expect(ovrOf(p)).toBe(80);
    expect(p.age).toBe(19);
    expect(p.potential).toBe(92);
  });

  it('over many mints the pyramid holds ≈60/30/10 with wonderkids present but rare', () => {
    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const mints = Array.from({ length: 2000 }, () => makeBackfillPlayer('CM', 'n', youthFactory, rng));
    const elite = mints.filter(p => ovrOf(p) >= 70).length / mints.length;
    const mid = mints.filter(p => ovrOf(p) >= 55 && ovrOf(p) < 70).length / mints.length;
    expect(elite).toBeGreaterThan(0.05);
    expect(elite).toBeLessThan(0.16);
    expect(mid).toBeGreaterThan(0.22);
    expect(mid).toBeLessThan(0.38);
    const wonderkids = mints.filter(p => p.age <= 19 && ovrOf(p) >= 70);
    expect(wonderkids.length).toBeGreaterThan(0);
    expect(wonderkids.length / mints.length).toBeLessThan(0.04);
  });
});

describe('churnSquad:', () => {
  const opts = (rng: () => number, extra: Partial<Parameters<typeof churnSquad>[1]> = {}) =>
    ({ rng, youthFactory, nationality: 'norwegian', axesOf: () => ({ growthBonus: 0.2, ceilingBonus: 11 }), academyBias: academyBiasForLevel(3), ...extra });

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
    const res = churnSquad(squad, opts(() => 0, { regimentOf: () => 'shooting' }));
    const grown = res.squad[0];
    expect(grown.attributes.finishing).toBeGreaterThan(40);
    expect(grown.attributes.defending).toBe(40);
  });
});

describe('expireFreeAgency:', () => {
  it('leaves prospects under the age threshold uncounted, so they can wait indefinitely', () => {
    const pool = [player({ id: 'kid', age: FREE_AGENCY_MIN_AGE - 1 })];
    const { expired, next } = expireFreeAgency(pool, {}, () => 0);
    expect(expired.size).toBe(0);
    expect(next).toEqual({});
  });

  it('draws a window on first count, runs it down, then expires the player', () => {
    const pool = [player({ id: 'vet', age: 30 })];
    // rng 0 draws the shortest window (1 season), so one pass exhausts it.
    expect(expireFreeAgency(pool, {}, () => 0).expired.has('vet')).toBe(true);
    // The longest window survives its first pass with one season left, then goes.
    const first = expireFreeAgency(pool, {}, () => 0.99);
    expect(first.expired.size).toBe(0);
    expect(first.next.vet).toBe(1);
    expect(expireFreeAgency(pool, first.next, () => 0.99).expired.has('vet')).toBe(true);
  });

  it('spreads windows across a cohort, so a seeded pool does not all expire at once', () => {
    // The whole point of the spread: 120-odd players seeded at game start must not vanish
    // together on the first rollover.
    const cohort = Array.from({ length: 60 }, (_, i) => player({ id: `fa${i}`, age: 26 }));
    let s = 1;
    const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const { expired, next } = expireFreeAgency(cohort, {}, rng);
    expect(expired.size).toBeGreaterThan(0);
    expect(Object.keys(next).length).toBeGreaterThan(0);
    expect(expired.size + Object.keys(next).length).toBe(cohort.length);
  });

  it('forgets players who have left the pool rather than carrying their counters forever', () => {
    const { next } = expireFreeAgency([player({ id: 'stays', age: 26 })], { gone: 2, stays: 2 }, () => 0);
    expect(next).toEqual({ stays: 1 });
  });
});

describe('churnFreeAgents:', () => {
  it('replaces an expired free agent 1:1, exactly as it would a retiree', () => {
    // Going unsigned is an exit from the game: without this the pool only ever grows, silting up
    // with players nobody wanted who keep developing forever.
    const pool = [player({ id: 'unwanted', age: 26 }, 40), player({ id: 'kept', age: 26 }, 55)];
    const res = churnFreeAgents(pool, {
      rng: () => 0.999, youthFactory, overflow: [], expired: new Set(['unwanted']),
    });
    expect(res).toHaveLength(2);
    expect(res.map(p => p.id)).toContain('kept');
    expect(res.map(p => p.id)).not.toContain('unwanted');
    expect(res.filter(p => p.id.startsWith('youth-'))).toHaveLength(1);
  });

  it('still draws the retirement roll for an expiring player, so those behind them are unshifted', () => {
    // The roll is drawn even when expiry has already decided the outcome. Skipping it would pull
    // every later player's development forward in the seeded stream, so introducing expiry would
    // silently change worlds it should not touch. (The replacement mint does add draws — that is
    // unavoidable and comes after the loop.)
    const mk = () => [player({ id: 'a', age: 26 }, 50), player({ id: 'b', age: 26 }, 50)];
    let seed = 9;
    const rngOf = () => { seed = 9; return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; };
    const bWith = churnFreeAgents(mk(), { rng: rngOf(), youthFactory, overflow: [], expired: new Set(['a']) })
      .find(p => p.id === 'b');
    const bWithout = churnFreeAgents(mk(), { rng: rngOf(), youthFactory, overflow: [] })
      .find(p => p.id === 'b');
    expect(bWith?.attributes).toEqual(bWithout?.attributes);
  });

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

  it('canSign hides ineligible free agents from the AI — but not from refills of its own releases', () => {
    const team = { id: 't', squad: [player({ id: 'weak', position: 'ST' }, 60), player({ id: 'ok', position: 'CM' }, 75)] };
    const pool = [player({ id: 'hidden', position: 'ST' }, 90)];
    const res = runAiMarket([team], pool, {
      rng: () => 0, activity: 1, improveThreshold: 2, targetSizes: { t: 2 }, canSign: () => false,
    });
    expect(res.teams[0].squad.some(p => p.id === 'hidden')).toBe(false); // the star stays invisible
    expect(res.freeAgents.some(p => p.id === 'hidden')).toBe(true);
  });

  it('a player released during this window stays signable even when canSign says no', () => {
    // Club A trims above the cap, releasing into the pool; club B (short of its target)
    // may re-sign the cast-off despite the drip hiding everyone else.
    const bigSquad = Array.from({ length: 26 }, (_, i) => player({ id: `a${i}`, position: 'CM' }, 50));
    const teams = [
      { id: 'a', squad: bigSquad },
      { id: 'b', squad: [player({ id: 'b0', position: 'CM' }, 70)] },
    ];
    const res = runAiMarket(teams, [player({ id: 'hidden', position: 'ST' }, 90)], {
      rng: () => 0, activity: 1, targetSizes: { a: 25, b: 2 }, canSign: () => false,
    });
    const bSquad = res.teams[1].squad;
    expect(bSquad).toHaveLength(2);
    expect(bSquad.some(p => p.id.startsWith('a'))).toBe(true); // signed the fresh cast-off
    expect(bSquad.some(p => p.id === 'hidden')).toBe(false);
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
