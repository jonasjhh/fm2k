import {
  potentialFactor, ageFactor, facilityFactor, headroom, attainableCeiling, improveChance, declineChance,
  trainOnMatch, developOverSeason, TRAINING_REGIMENTS, REGIMENT_IDS, DEFAULT_REGIMENT,
} from './progression.ts';
import type { Player, PlayerAttributes } from '@fm2k/match';

// Returns each value once, then repeats the last — scripts successive rng() calls.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function attrs(v = 40): PlayerAttributes {
  return { speed: v, strength: v, agility: v, passing: v, finishing: v, technique: v, defending: v, stamina: v, awareness: v, composure: v };
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
});

describe('headroom:', () => {
  it('shrinks toward 0 as the attribute approaches its (potential+facility) ceiling', () => {
    // ceiling(95,15) = 99 → spread 18
    expect(headroom(81, 95, 15)).toBeCloseTo(1.0, 6); // (99-81)/18
    expect(headroom(90, 95, 15)).toBeCloseTo(0.5, 6);
    expect(headroom(99, 95, 15)).toBe(0);
    // an unfacilitated ceiling (85) is reached far sooner
    expect(headroom(85, 95, 0)).toBe(0);
    expect(headroom(70, 70, 15)).toBeGreaterThan(0);
    expect(headroom(80, 70, 15)).toBe(0);             // already past the ceiling (75)
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
});

// ── trainOnMatch ─────────────────────────────────────────────────────────────

describe('trainOnMatch:', () => {
  it('improves one regiment attribute by +1 on a hit, never mutating the input', () => {
    // physical regiment, rng[0]=0 → picks the first key (speed); rng[1]=0 → roll under the chance
    const p = player({ age: 18, potential: 85 }, 40);
    const before = p.attributes;
    const out = trainOnMatch(p, 'physical', 0.3, 15, seq([0, 0]));
    expect(out.speed).toBe(41);
    expect(before.speed).toBe(40);          // input untouched
    expect(out).not.toBe(before);
  });

  it('returns the same attributes on a miss', () => {
    const p = player({ age: 18, potential: 85 }, 40);
    const out = trainOnMatch(p, 'physical', 0.3, 15, seq([0, 0.999]));
    expect(out).toBe(p.attributes);
  });

  it('only ever trains attributes in the chosen regiment', () => {
    const trained = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const p = player({ age: 18, potential: 90 }, 30);
      const out = trainOnMatch(p, 'finishing', 0.3, 15, seq([s / 200, 0]));
      for (const k of Object.keys(out) as (keyof PlayerAttributes)[]) {
        if (out[k] !== p.attributes[k]) { trained.add(k); }
      }
    }
    expect([...trained].every(k => k in TRAINING_REGIMENTS.finishing)).toBe(true);
    expect(trained.size).toBeGreaterThan(0);
  });

  it('does not push an attribute over 99', () => {
    const p = player({ age: 18, potential: 99 }, 99);
    const out = trainOnMatch(p, 'physical', 0.3, 15, seq([0, 0]));
    expect(out.speed).toBe(99);
  });
});

// ── developOverSeason ────────────────────────────────────────────────────────

describe('developOverSeason:', () => {
  it('always ages the player by one year', () => {
    const p = player({ age: 24 });
    expect(developOverSeason(p, 'balanced', 0.1, 6, seq([0.999])).age).toBe(25);
  });

  it('a young, high-potential player improves when rolls succeed', () => {
    // physical regiment + all-zero rng → every try picks speed and hits; young age, no decline
    const p = player({ age: 18, potential: 85 }, 40);
    const out = developOverSeason(p, 'physical', 0.3, 15, () => 0);
    expect(out.attributes.speed).toBeGreaterThan(40);
    expect(out.age).toBe(19);
  });

  it('an old player can decline a physical attribute (legs first)', () => {
    const p = player({ age: 35, potential: 50 }, 60);
    // 6 tries miss (high rolls), then decline roll low → decline; pick=0 → speed, drop roll 0 → -2
    const rng = seq([
      0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999,
      0,    // decline roll (< declineChance)
      0,    // pick a decline attribute (first weighted = speed)
      0,    // drop magnitude roll (< 0.4 → drop 2)
    ]);
    const out = developOverSeason(p, 'physical', 0, 0, rng);
    expect(out.attributes.speed).toBe(58);
    expect(out.age).toBe(36);
  });

  it('never drops an attribute below 1 or above 99', () => {
    const low = developOverSeason(player({ age: 38, potential: 40 }, 1), 'physical', 0, 0, () => 0);
    for (const v of Object.values(low.attributes)) { expect(v).toBeGreaterThanOrEqual(1); }
    const high = developOverSeason(player({ age: 18, potential: 99 }, 99), 'physical', 0.3, 15, () => 0);
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
    const { attributes, age } = developOverSeason(p, regiment, growthBonus, ceilingBonus, rng);
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
    const focused = career(start, 'finishing', 0.3, 15, 8, mulberry32(7)).attributes.finishing;
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
    // balanced trains all ten attributes
    expect(Object.keys(TRAINING_REGIMENTS.balanced).length).toBe(10);
  });
});
