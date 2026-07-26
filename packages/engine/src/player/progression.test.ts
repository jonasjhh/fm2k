import {
  potentialFactor, ageFactor, facilityFactor, headroom, attainableCeiling, improveChance, declineChance,
  trainOnMatch, developOverSeason, TRAINING_REGIMENTS, REGIMENT_IDS, DEFAULT_REGIMENT,
  CEILING_THRESHOLD, SEASON_TRIES, regimentWeights, defaultRegiment,
} from './progression.ts';
import { ALL_PLAYER_POSITIONS } from '@fm2k/match';

// Each season-end try draws twice: one to pick the attribute, one to roll for improvement.
const SEASON_TRY_ROLLS = SEASON_TRIES * 2;
import type { Player, PlayerAttributes } from '@fm2k/match';

// Returns each value once, then repeats the last — scripts successive rng() calls.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function attrs(v = 40): PlayerAttributes {
  return { speed: v, strength: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, goalkeeping: 10 };
}

function player(over: Partial<Player> = {}, attrValue = 40): Player {
  return { id: 'p', name: 'P', nationality: 'n', age: 20, position: 'CM', potential: 70, attributes: attrs(attrValue), ...over };
}

// ── pure factors ───────────────────────────────────────────────────────────────

describe('potentialFactor:', () => {
  it('scales linearly and clamps low/high', () => {
    expect(potentialFactor(75)).toBeCloseTo(1.0, 6);   // (75-35)/40
    expect(potentialFactor(55)).toBeCloseTo(0.5, 6);
    expect(potentialFactor(20)).toBe(0.15);             // clamped (would be negative)
    expect(potentialFactor(99)).toBe(1.6);              // clamped at the top
    expect(potentialFactor(95)).toBeCloseTo(1.5, 6);
  });
});

describe('ageFactor:', () => {
  it('is a descending step function past the prime', () => {
    expect(ageFactor(18)).toBe(1.5);
    expect(ageFactor(21)).toBe(1.5);
    expect(ageFactor(22)).toBe(1.2);
    expect(ageFactor(25)).toBe(1.2);
    expect(ageFactor(26)).toBe(1.0);
    expect(ageFactor(29)).toBe(1.0);
    expect(ageFactor(30)).toBe(0.6);
    expect(ageFactor(32)).toBe(0.6);
    expect(ageFactor(33)).toBe(0.2);
  });
});

describe('facilityFactor:', () => {
  it('rises with the growth-axis bonus and clamps to 0.9..1.5', () => {
    expect(facilityFactor(0)).toBeCloseTo(0.9, 6);
    expect(facilityFactor(0.1)).toBeCloseTo(1.0, 6);
    expect(facilityFactor(0.2)).toBeCloseTo(1.1, 6);
    expect(facilityFactor(0.3)).toBeCloseTo(1.2, 6);
    expect(facilityFactor(-5)).toBeCloseTo(0.9, 6); // clamped at the floor (nothing built)
    expect(facilityFactor(5)).toBeCloseTo(1.5, 6);  // clamped at the ceiling
  });
});

describe('attainableCeiling:', () => {
  it('is potential shifted by the ceiling-axis bonus minus the unfacilitated baseline, clamped to 45..99', () => {
    expect(attainableCeiling(95, 15)).toBe(99);  // 95-10+15 clamped
    expect(attainableCeiling(95, 0)).toBe(85);   // 95-10 → nothing built caps below potential
    expect(attainableCeiling(70, 15)).toBe(75);  // 70-10+15
    expect(attainableCeiling(70, 11)).toBe(71);  // 70-10+11
    expect(attainableCeiling(40, 0)).toBe(45);   // clamped at the floor
  });

  it('puts the ceiling exactly at potential at CEILING_THRESHOLD, and past it above', () => {
    // The threshold is the whole story of the training group: below it an estate is helping
    // players reach what they always had in them, above it they surpass it.
    expect(attainableCeiling(70, CEILING_THRESHOLD)).toBe(70);
    expect(attainableCeiling(70, CEILING_THRESHOLD - 1)).toBe(69);
    expect(attainableCeiling(70, CEILING_THRESHOLD + 6)).toBe(76);
  });
});

describe('headroom:', () => {
  it('falls linearly over the spread as the attribute approaches its ceiling', () => {
    // ceiling(95,15) = 99 → spread 18
    expect(headroom(81, 95, 15)).toBeCloseTo(1.0, 6); // (99-81)/18
    expect(headroom(90, 95, 15)).toBeCloseTo(0.5, 6);
    expect(headroom(70, 70, 15)).toBeGreaterThan(0);
  });

  it('never reaches zero — the ceiling limits growth severely, it does not forbid it', () => {
    // The whole point of the tail. A squad of modest potentials used to show literally no
    // movement at season end because every attribute sat on a hard zero; now they plateau and
    // drift instead, which is what a career actually looks like.
    expect(headroom(99, 95, 15)).toBeGreaterThan(0);   // exactly at the ceiling
    expect(headroom(85, 95, 0)).toBeGreaterThan(0);
    expect(headroom(80, 70, 15)).toBeGreaterThan(0);   // already 5 past the ceiling (75)
  });

  it('decays past the ceiling, so going further beyond it costs exponentially more', () => {
    // Without the decay the residual would be a standing licence to keep climbing and every
    // long career would trend to 99.
    const at = headroom(75, 70, 15);      // exactly at the ceiling
    const past5 = headroom(80, 70, 15);
    const past20 = headroom(95, 70, 15);
    expect(past5).toBeLessThan(at);
    expect(past20).toBeLessThan(past5);
    expect(past20 / past5).toBeLessThan(past5 / at); // strictly convex, not linear
  });

  it('is continuous and never increases as the attribute rises', () => {
    // A discontinuity where the ramp meets the tail would show up as a cliff in development.
    let prev = Infinity;
    for (let attr = 40; attr <= 99; attr += 0.5) {
      const h = headroom(attr, 70, 15);
      expect(h).toBeLessThanOrEqual(prev + 1e-12);
      prev = h;
    }
  });
});

describe('improveChance:', () => {
  it('rises with potential and facility, falls with age and high attributes', () => {
    const base = improveChance(40, 70, 24, 0.1, 6, 0.2);
    expect(improveChance(40, 90, 24, 0.1, 6, 0.2)).toBeGreaterThan(base); // more potential
    expect(improveChance(40, 50, 24, 0.1, 6, 0.2)).toBeLessThan(base);    // less potential
    expect(improveChance(40, 70, 34, 0.1, 6, 0.2)).toBeLessThan(base);    // older
    expect(improveChance(40, 70, 24, 0.3, 15, 0.2)).toBeGreaterThan(base); // better facility
    expect(improveChance(90, 70, 24, 0.1, 6, 0.2)).toBeLessThan(base);    // less headroom
  });

  it('is clamped to at most 0.95', () => {
    expect(improveChance(1, 99, 18, 0.3, 15, 5)).toBe(0.95);
  });

  it('a low-potential player barely improves', () => {
    expect(improveChance(40, 30, 24, 0.1, 6, 0.2)).toBeLessThan(0.05);
  });
});

describe('declineChance:', () => {
  it('is zero before 31 and rises with age', () => {
    expect(declineChance(28, 60)).toBe(0);
    expect(declineChance(30, 60)).toBe(0);
    expect(declineChance(33, 60)).toBeGreaterThan(declineChance(31, 60));
  });

  it('high potential resists decline', () => {
    expect(declineChance(34, 90)).toBeLessThan(declineChance(34, 40));
  });

  it('declineResist scales the chance down, and defaults to no effect', () => {
    expect(declineChance(34, 60, 1)).toBe(declineChance(34, 60));
    expect(declineChance(34, 60, 0.5)).toBeCloseTo(declineChance(34, 60) / 2);
    // It cannot resurrect a player who was never going to decline in the first place.
    expect(declineChance(28, 60, 0.5)).toBe(0);
  });
});

// ── trainOnMatch ─────────────────────────────────────────────────────────────

describe('trainOnMatch:', () => {
  it('improves one regiment attribute by +1 on a hit, never mutating the input', () => {
    // physical regiment, rng[0]=0 → picks the first key (speed); rng[1]=0 → roll under the chance
    const p = player({ age: 18, potential: 85 }, 40);
    const before = p.attributes;
    const out = trainOnMatch(p, 'physical', { growthBonus: 0.3, ceilingBonus: 15 }, seq([0, 0]));
    expect(out.speed).toBe(41);
    expect(before.speed).toBe(40);          // input untouched
    expect(out).not.toBe(before);
  });

  it('returns the same attributes on a miss', () => {
    const p = player({ age: 18, potential: 85 }, 40);
    const out = trainOnMatch(p, 'physical', { growthBonus: 0.3, ceilingBonus: 15 }, seq([0, 0.999]));
    expect(out).toBe(p.attributes);
  });

  it('only ever trains attributes in the chosen regiment', () => {
    const trained = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const p = player({ age: 18, potential: 90 }, 30);
      const out = trainOnMatch(p, 'shooting', { growthBonus: 0.3, ceilingBonus: 15 }, seq([s / 200, 0]));
      for (const k of Object.keys(out) as (keyof PlayerAttributes)[]) {
        if (out[k] !== p.attributes[k]) { trained.add(k); }
      }
    }
    expect([...trained].every(k => k in TRAINING_REGIMENTS.shooting)).toBe(true);
    expect(trained.size).toBeGreaterThan(0);
  });

  it('does not push an attribute over 99', () => {
    const p = player({ age: 18, potential: 99 }, 99);
    const out = trainOnMatch(p, 'physical', { growthBonus: 0.3, ceilingBonus: 15 }, seq([0, 0]));
    expect(out.speed).toBe(99);
  });

  it('potentialFloor develops a limited player exactly as a good prospect, and ignores better ones', () => {
    // The point of the floor: two players with the same attributes and the same rolls, one with
    // potential 40 and one with 70, develop identically once the wing is built. Without it the
    // limited player misses a roll the prospect converts.
    const limited = player({ age: 18, potential: 40 }, 45);
    const prospect = player({ age: 18, potential: 70 }, 45);
    const floored = { growthBonus: 0.2, ceilingBonus: 16, potentialFloor: 70 };
    const bare = { growthBonus: 0.2, ceilingBonus: 16 };
    const roll = improveChance(45, 70, 18, 0.2, 16, 0.07) * 0.99; // under the prospect's chance
    expect(trainOnMatch(limited, 'physical', bare, seq([0, roll])).speed).toBe(45);
    expect(trainOnMatch(prospect, 'physical', bare, seq([0, roll])).speed).toBe(46);
    expect(trainOnMatch(limited, 'physical', floored, seq([0, roll])).speed).toBe(46);
    // A player already past the floor is developed on their own potential, not dragged down to it.
    const elite = player({ age: 18, potential: 95 }, 45);
    expect(trainOnMatch(elite, 'physical', { ...bare, potentialFloor: 70 }, seq([0, 0.5])))
      .toEqual(trainOnMatch(elite, 'physical', bare, seq([0, 0.5])));
  });

  it('attrGrowthBonus lifts only the attribute it names', () => {
    // A roll that misses on the broad bonus alone but hits once the gym's speed bonus is added:
    // the same roll trains speed at one club and nothing at the other.
    // ceilingBonus 10 puts the ceiling at potential, so there is headroom for either to bite.
    const p = player({ age: 24, potential: 70 }, 50);
    const bare = { growthBonus: 0, ceilingBonus: 10 };
    const speedOnly = { ...bare, attrGrowthBonus: { speed: 0.5 } };
    const base = improveChance(50, 70, 24, 0, 10, 0.07);
    const lifted = improveChance(50, 70, 24, 0.5, 10, 0.07);
    const between = (base + lifted) / 2;
    expect(trainOnMatch(p, 'recovery', bare, seq([0, between])).stamina).toBe(50);
    // rng[0]=0 picks speed from the physical regiment; the second draw is the improvement roll.
    expect(trainOnMatch(p, 'physical', speedOnly, seq([0, between])).speed).toBe(51);
    // Strength is in the same regiment but not in the bonus, so the same roll still misses.
    expect(trainOnMatch(p, 'physical', speedOnly, seq([0.5, between])).strength).toBe(50);
  });
});

// ── developOverSeason ────────────────────────────────────────────────────────

describe('developOverSeason:', () => {
  it('always ages the player by one year', () => {
    const p = player({ age: 24 });
    expect(developOverSeason(p, 'balanced', { growthBonus: 0.1, ceilingBonus: 6 }, seq([0.999])).age).toBe(25);
  });

  it('a young, high-potential player improves when rolls succeed', () => {
    // physical regiment + all-zero rng → every try picks speed and hits; young age, no decline
    const p = player({ age: 18, potential: 85 }, 40);
    const out = developOverSeason(p, 'physical', { growthBonus: 0.3, ceilingBonus: 15 }, () => 0);
    expect(out.attributes.speed).toBeGreaterThan(40);
    expect(out.age).toBe(19);
  });

  it('an old player can decline a physical attribute (legs first)', () => {
    const p = player({ age: 35, potential: 50 }, 60);
    // Every improvement try misses, then the decline roll lands: pick=0 → speed, drop roll 0 → -2.
    // The misses have to be scripted out in full — a short sequence repeats its last value, and
    // since the ceiling now carries a residual chance rather than a hard zero, a trailing 0 would
    // convert every remaining try instead of harmlessly failing against an impossible roll.
    const rng = seq([
      ...Array(SEASON_TRY_ROLLS).fill(0.999),
      0,    // decline roll (< declineChance)
      0,    // pick a decline attribute (first weighted = speed)
      0,    // drop magnitude roll (< 0.4 → drop 2)
    ]);
    const out = developOverSeason(p, 'physical', { growthBonus: 0, ceilingBonus: 0 }, rng);
    expect(out.attributes.speed).toBe(58);
    expect(out.age).toBe(36);
  });

  it('potentialFloor does not make a limited veteran resist decline', () => {
    // The floor is a development facility. Coaching a journeyman as though he were a better
    // player should not also give him a better player's resistance to ageing — decline stays on
    // true potential, and only declineResist touches it.
    const p = player({ age: 35, potential: 40 }, 60);
    const misses = Array(SEASON_TRY_ROLLS).fill(0.999);
    const roll = declineChance(35, 40) * 0.99; // lands for true potential 40, would miss at 70
    expect(roll).toBeGreaterThan(declineChance(35, 70));
    const rolls = [...misses, roll, 0, 0];
    for (const axes of [
      { growthBonus: 0, ceilingBonus: 0 },
      { growthBonus: 0, ceilingBonus: 0, potentialFloor: 70 },
    ]) {
      expect(developOverSeason(p, 'physical', axes, seq(rolls)).attributes.speed).toBeLessThan(60);
    }
  });

  it('declineResist can spare a veteran the decline that would otherwise land', () => {
    // Identical player, identical rolls; the decline draw sits between the unfacilitated chance
    // and the resisted one, so only the club without individual coaching loses a step.
    const p = player({ age: 35, potential: 50 }, 60);
    const resist = 0.5;
    const roll = declineChance(35, 50) * ((1 + resist) / 2); // above resisted, below unresisted
    const misses = Array(SEASON_TRY_ROLLS).fill(0.999);
    const rolls = [...misses, roll, 0, 0]; // decline draw, then attribute pick and magnitude
    expect(developOverSeason(p, 'physical', { growthBonus: 0, ceilingBonus: 0 }, seq(rolls))
      .attributes.speed).toBeLessThan(60);
    expect(developOverSeason(p, 'physical', { growthBonus: 0, ceilingBonus: 0, declineResist: resist }, seq(rolls))
      .attributes.speed).toBe(60);
  });

  it('never drops an attribute below 1 or above 99', () => {
    const low = developOverSeason(player({ age: 38, potential: 40 }, 1), 'physical', { growthBonus: 0, ceilingBonus: 0 }, () => 0);
    for (const v of Object.values(low.attributes)) { expect(v).toBeGreaterThanOrEqual(1); }
    const high = developOverSeason(player({ age: 18, potential: 99 }, 99), 'physical', { growthBonus: 0.3, ceilingBonus: 15 }, () => 0);
    for (const v of Object.values(high.attributes)) { expect(v).toBeLessThanOrEqual(99); }
  });
});

// ── career arc (seeded, deterministic) ──────────────────────────────────────────
// Over a full career the model must read sensibly: high potential rises then plateaus
// (not everyone maxes out), low potential barely moves, and old age erodes — proving
// "not every player becomes world class".

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const avg = (a: PlayerAttributes) => Object.values(a).reduce((s, v) => s + v, 0) / 10;

/** Run `seasons` of season-end development for one player at a fixed growth/ceiling bonus. */
function career(
  start: Player, regiment: Parameters<typeof developOverSeason>[1],
  growthBonus: number, ceilingBonus: number, seasons: number, rng: () => number,
): Player {
  let p = start;
  for (let i = 0; i < seasons; i++) {
    const { attributes, age } = developOverSeason(p, regiment, { growthBonus, ceilingBonus }, rng);
    p = { ...p, attributes, age };
  }
  return p;
}

describe('career arc:', () => {
  it('a young high-potential player improves but plateaus below world class', () => {
    const rng = mulberry32(12345);
    const start = player({ age: 17, potential: 80 }, 45);
    const end = career(start, 'balanced', 0.2, 11, 14, rng);
    expect(avg(end.attributes)).toBeGreaterThan(avg(start.attributes) + 3); // clearly grew
    expect(avg(end.attributes)).toBeLessThan(90);                            // not maxed out
    expect(Math.max(...Object.values(end.attributes))).toBeLessThanOrEqual(99);
    expect(end.age).toBe(31);
  });

  it('a low-potential player barely develops over a career', () => {
    const rng = mulberry32(999);
    const start = player({ age: 18, potential: 40 }, 45);
    const end = career(start, 'balanced', 0.2, 11, 12, rng);
    expect(avg(end.attributes) - avg(start.attributes)).toBeLessThan(4); // basically flat
  });

  it('an aimed regiment outgrows a balanced one on its focus attribute', () => {
    const start = player({ age: 18, potential: 85 }, 40);
    const focused = career(start, 'shooting', 0.3, 15, 8, mulberry32(7)).attributes.finishing;
    const spread = career(start, 'balanced', 0.3, 15, 8, mulberry32(7)).attributes.finishing;
    expect(focused).toBeGreaterThan(spread);
  });

  it('an old player erodes over several seasons', () => {
    const rng = mulberry32(42);
    const start = player({ age: 33, potential: 55 }, 70);
    const end = career(start, 'physical', 0.1, 6, 5, rng);
    expect(avg(end.attributes)).toBeLessThan(avg(start.attributes)); // net decline
  });
});

describe('regiment table:', () => {
  it('every regiment id has a non-empty weight table and DEFAULT is balanced', () => {
    expect(DEFAULT_REGIMENT).toBe('balanced');
    for (const id of REGIMENT_IDS) {
      expect(Object.keys(TRAINING_REGIMENTS[id]).length).toBeGreaterThan(0);
    }
    // balanced trains all eight attributes
    expect(Object.keys(TRAINING_REGIMENTS.balanced).length).toBe(8);
  });
});

describe('defaultRegiment:', () => {
  it('lets age override position at both ends of a career', () => {
    // A 16-year-old keeper builds an athletic base like everyone else, and a 33-year-old striker
    // is past the point where specialising pays.
    expect(defaultRegiment('GK', 18)).toBe('physical');
    expect(defaultRegiment('ST', 33)).toBe('balanced');
  });

  it('gives every position a regiment in the prime years, and one that actually trains it', () => {
    for (const position of ALL_PLAYER_POSITIONS) {
      const regiment = defaultRegiment(position, 25);
      const weights = regimentWeights(regiment, position);
      expect(Object.keys(weights).length).toBeGreaterThan(0);
    }
    expect(defaultRegiment('GK', 25)).toBe('goalkeeping');
    expect(defaultRegiment('CB', 25)).toBe('defending');
    expect(defaultRegiment('ST', 25)).toBe('shooting');
  });

  it('never hands an outfielder the keeper regiment, which would train them nothing', () => {
    for (const position of ALL_PLAYER_POSITIONS) {
      if (position === 'GK') { continue; }
      for (const age of [16, 25, 33]) {
        expect(defaultRegiment(position, age)).not.toBe('goalkeeping');
      }
    }
  });
});

describe('regimentWeights:', () => {
  it('gives a keeper the regiment exactly as written', () => {
    for (const id of REGIMENT_IDS) {
      expect(regimentWeights(id, 'GK')).toEqual(TRAINING_REGIMENTS[id]);
    }
  });

  it('strips goalkeeping from every outfield regiment, leaving the rest untouched', () => {
    for (const id of REGIMENT_IDS) {
      if (id === 'goalkeeping') { continue; }
      const w = regimentWeights(id, 'ST');
      expect(w.goalkeeping).toBeUndefined();
      // Nothing else changes: same keys, same weights, minus the one.
      const rest = Object.entries(TRAINING_REGIMENTS[id]).filter(([a]) => a !== 'goalkeeping');
      expect(w).toEqual(Object.fromEntries(rest));
    }
  });

  it('falls back to outfield general work rather than an empty table for a GK regiment on an outfielder', () => {
    // Only reachable from a save made before the UI stopped offering it. An empty weight table
    // would make `pickWeighted` return undefined and corrupt the attribute it wrote to.
    const w = regimentWeights('goalkeeping', 'CB');
    expect(Object.keys(w).length).toBe(7);
    expect(w.goalkeeping).toBeUndefined();
  });

  it('stops an outfielder banking a season of development into goalkeeping', () => {
    // The bug this exists to prevent: goalkeeping is generated low and never read by the match
    // engine, so its headroom is always wide and a try spent there converts far more often than
    // one spent on a plateaued real attribute. Balanced was banking half its output there.
    // 0.99 on the pick roll lands on the *last* key of the weight table — goalkeeping for a
    // keeper's balanced regiment, and whatever remains last once it is stripped for an outfielder.
    // 0.01 on the improve roll then always converts, so this isolates the pick, not the odds.
    const picksLast = () => seq(Array(SEASON_TRY_ROLLS).fill(0).flatMap(() => [0.99, 0.01]));

    const outfielder = player({ position: 'CM', potential: 70 }, 60);
    const out = developOverSeason(outfielder, 'balanced', { growthBonus: 0, ceilingBonus: 0 }, picksLast());
    expect(out.attributes.goalkeeping).toBe(outfielder.attributes.goalkeeping);

    // The same regiment on a keeper still trains it.
    const keeper = player({ position: 'GK', potential: 70 }, 60);
    const kOut = developOverSeason(keeper, 'balanced', { growthBonus: 0, ceilingBonus: 0 }, picksLast());
    expect(kOut.attributes.goalkeeping).toBeGreaterThan(keeper.attributes.goalkeeping);
  });
});
