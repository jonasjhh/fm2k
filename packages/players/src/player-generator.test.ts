import { PlayerGenerator, sampleNormal, ATTRIBUTE_CATEGORIES, traitDeltas } from './player-generator.ts';
import {
  calculateOverall, type PlayerPosition, type PlayerAttributes, type Player,
} from '@fm2k/match';

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'stamina', 'passing', 'technique',
  'finishing', 'defending', 'goalkeeping',
];

describe('PlayerGenerator:', () => {
  describe('.generatePlayer()', () => {
    let playerGenerator: PlayerGenerator;

    beforeEach(() => {
      playerGenerator = new PlayerGenerator();
    });

    test('produces the core player properties', () => {
      const player = playerGenerator.generatePlayer('ST');
      expect(typeof player.id).toBe('string');
      expect(player.id.length).toBeGreaterThan(0);
      expect(player.name.length).toBeGreaterThan(0);
      expect(player.position).toBe('ST');
      expect(player.attributes).toBeDefined();
    });

    test('all attributes stay within the 1–99 scale', () => {
      const player = playerGenerator.generatePlayer('CM', { overall: 70 });
      for (const key of ATTR_KEYS) {
        const v = player.attributes[key];
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    });

    test.each([30, 50, 70, 85])('overall lands near the requested target %d', target => {
      // Average across several samples to wash out per-attribute variance.
      const gen = new PlayerGenerator('female', 'all');
      const overalls = Array.from({ length: 30 }, () => calculateOverall(gen.generatePlayer('CM', { overall: target }).attributes));
      const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
      expect(Math.abs(mean - target)).toBeLessThan(4);
    });

    test('shapes attributes for the position (a striker finishes better than a centre-back)', () => {
      const gen = new PlayerGenerator('female', 'all');
      const sample = (pos: PlayerPosition, key: keyof PlayerAttributes) => {
        const vals = Array.from({ length: 40 }, () => gen.generatePlayer(pos, { overall: 65 }).attributes[key]);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      expect(sample('ST', 'finishing')).toBeGreaterThan(sample('CB', 'finishing'));
      expect(sample('CB', 'defending')).toBeGreaterThan(sample('ST', 'defending'));
    });

    test('respects an explicit age and potential', () => {
      const player = playerGenerator.generatePlayer('CM', { overall: 50, age: 18, potential: 92 });
      expect(player.age).toBe(18);
      expect(player.potential).toBe(92);
    });

    test('derives age within 17–35 and potential at least the overall', () => {
      for (let i = 0; i < 50; i++) {
        const p = playerGenerator.generatePlayer('CM', { overall: 60 });
        expect(p.age).toBeGreaterThanOrEqual(17);
        expect(p.age).toBeLessThanOrEqual(35);
        expect(p.potential).toBeGreaterThanOrEqual(Math.round(calculateOverall(p.attributes)) - 1);
        expect(p.potential).toBeLessThanOrEqual(99);
      }
    });

    test('overall is sampled near the mean of an overallDistribution when no fixed overall is given', () => {
      const gen = new PlayerGenerator('female', 'all');
      const overalls = Array.from(
        { length: 60 },
        () => calculateOverall(gen.generatePlayer('CM', { overallDistribution: { mean: 55, stdDev: 6 } }).attributes),
      );
      const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
      expect(Math.abs(mean - 55)).toBeLessThan(4);
    });

    test('a fixed overall wins outright over an overallDistribution', () => {
      const gen = new PlayerGenerator('female', 'all');
      const overall = calculateOverall(
        gen.generatePlayer('CM', { overall: 80, overallDistribution: { mean: 30, stdDev: 5 } }).attributes,
      );
      expect(Math.abs(overall - 80)).toBeLessThan(6);
    });

    test('categoryBias shifts a biased category up relative to an unbiased control, at the same target overall', () => {
      const gen = new PlayerGenerator('female', 'all');
      const sample = (bias: Record<string, number> | undefined, key: keyof PlayerAttributes) => {
        const vals = Array.from(
          { length: 40 },
          () => gen.generatePlayer('CM', { overall: 60, categoryBias: bias }).attributes[key],
        );
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      const biased = sample({ physical: 15 }, 'speed');
      const control = sample(undefined, 'speed');
      expect(biased).toBeGreaterThan(control);
    });

    test('a high target striker\'s finishing differentiates rather than saturating at 99', () => {
      // Before the unclamped-rescale fix, position-boosted attributes for a striker would clip
      // at 99 well before the overall target did, so an 85 and a 95 target looked identical.
      const gen = new PlayerGenerator('female', 'all');
      const sample = (target: number) => {
        const vals = Array.from({ length: 40 }, () => gen.generatePlayer('ST', { overall: target }).attributes.finishing);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      expect(sample(95)).toBeGreaterThan(sample(85));
    });

    test('the default potential margin shrinks for older players', () => {
      const gen = new PlayerGenerator('female', 'all');
      const margin = (age: number) => {
        const vals = Array.from({ length: 40 }, () => {
          const p = gen.generatePlayer('CM', { overall: 60, age });
          return p.potential - Math.round(calculateOverall(p.attributes));
        });
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      expect(margin(34)).toBeLessThan(margin(18));
    });

    test('categoryBias still lands the overall near the target after rescaling', () => {
      const gen = new PlayerGenerator('female', 'all');
      const overalls = Array.from(
        { length: 30 },
        () => calculateOverall(gen.generatePlayer('CM', { overall: 60, categoryBias: { technical: -10, physical: -10 } }).attributes),
      );
      const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
      expect(Math.abs(mean - 60)).toBeLessThan(4);
    });

    test('an explicit archetype measurably differs from balanced on its signature attribute', () => {
      const gen = new PlayerGenerator('female', 'all');
      const sample = (archetype: string | undefined, key: keyof PlayerAttributes) => {
        const vals = Array.from({ length: 40 }, () => gen.generatePlayer('ST', { overall: 65, archetype }).attributes[key]);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      expect(sample('targetman', 'strength')).toBeGreaterThan(sample('balanced', 'strength'));
      expect(sample('poacher', 'speed')).toBeGreaterThan(sample('balanced', 'speed'));
    });

    test('an unrecognized archetype falls back to balanced', () => {
      const gen = new PlayerGenerator('female', 'all', () => 0.5);
      const named = gen.generatePlayer('ST', { overall: 65, archetype: 'not-a-real-archetype' });
      const balanced = new PlayerGenerator('female', 'all', () => 0.5).generatePlayer('ST', { overall: 65, archetype: 'balanced' });
      expect(named.attributes).toEqual(balanced.attributes);
    });
  });

  describe('deterministic generation (injected rng):', () => {
    test('a fixed rng yields identical players', () => {
      const a = new PlayerGenerator('female', 'all', () => 0.4).generatePlayer('ST', { overall: 70 });
      const b = new PlayerGenerator('female', 'all', () => 0.4).generatePlayer('ST', { overall: 70 });
      expect(a.attributes).toEqual(b.attributes);
      expect(a.age).toBe(b.age);
      expect(a.potential).toBe(b.potential);
    });

    test('age and potential derive from the rng (rng=0)', () => {
      const player = new PlayerGenerator('female', 'all', () => 0).generatePlayer('CM', { overall: 60 });
      expect(player.age).toBe(17);                                  // 17 + floor(0 * 19)
      expect(player.potential).toBe(Math.round(calculateOverall(player.attributes))); // overall + floor(0 * 20)
    });

    test('age scales to the top of the range with a high rng', () => {
      const player = new PlayerGenerator('female', 'all', () => 0.999).generatePlayer('CM', { overall: 60 });
      expect(player.age).toBe(35); // 17 + floor(0.999 * 19)
    });
  });

  describe('nationality:', () => {
    test.each([
      ['norway', 'Norwegian'],
      ['england', 'English'],
      ['germany', 'German'],
      ['france', 'French'],
      ['spain', 'Spanish'],
      ['italy', 'Italian'],
      ['sweden', 'Swedish'],
      ['denmark', 'Danish'],
    ] as const)('maps country %s to nationality %s', (country, nationality) => {
      const player = new PlayerGenerator('female', country).generatePlayer('ST');
      expect(player.nationality).toBe(nationality);
    });

    test('uses "Unknown" nationality for the "all" country', () => {
      const player = new PlayerGenerator('female', 'all').generatePlayer('ST');
      expect(player.nationality).toBe('Unknown');
    });
  });
});

describe('sampleNormal:', () => {
  test('a fixed rng produces a deterministic sample', () => {
    const a = sampleNormal({ mean: 60, stdDev: 10 }, () => 0.5);
    const b = sampleNormal({ mean: 60, stdDev: 10 }, () => 0.5);
    expect(a).toBe(b);
  });

  test('the mean of many samples converges near the distribution mean', () => {
    const samples = Array.from({ length: 2000 }, () => sampleNormal({ mean: 50, stdDev: 10 }, Math.random));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(Math.abs(mean - 50)).toBeLessThan(2);
  });

  test('respects an explicit min/max clamp', () => {
    const samples = Array.from({ length: 500 }, () => sampleNormal({ mean: 50, stdDev: 30, min: 40, max: 60 }, Math.random));
    expect(samples.every(s => s >= 40 && s <= 60)).toBe(true);
  });

  test('defaults to the true 1–99 scale when min/max are omitted', () => {
    const samples = Array.from({ length: 500 }, () => sampleNormal({ mean: 50, stdDev: 200 }, Math.random));
    expect(samples.every(s => s >= 1 && s <= 99)).toBe(true);
  });
});

describe('ATTRIBUTE_CATEGORIES:', () => {
  test('every attribute belongs to exactly one category', () => {
    const all = Object.values(ATTRIBUTE_CATEGORIES).flat();
    expect(all.sort()).toEqual([...ATTR_KEYS].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('trait model:', () => {
  function mulberry32(seed: number): () => number {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const traitDeltasOf = (traits: Parameters<typeof traitDeltas>[0]) =>
    traitDeltas(traits, 'CM', 0, 0);

  test('the physique axis trades speed against strength; the tank end drags technique', () => {
    const sprinter = traitDeltasOf({ physique: 1, craft: 0, focus: 0, gk: 0, specialization: 1 });
    expect(sprinter.speed).toBeGreaterThan(0);
    expect(sprinter.strength).toBeLessThan(0);
    expect(sprinter.technique).toBe(0);
    const tank = traitDeltasOf({ physique: -1, craft: 0, focus: 0, gk: 0, specialization: 1 });
    expect(tank.strength).toBeGreaterThan(0);
    expect(tank.speed).toBeLessThan(0);
    expect(tank.technique).toBeLessThan(0);
  });

  test('specialization 0 zeroes every axis tradeoff (the complete player)', () => {
    const complete = traitDeltasOf({ physique: 1, craft: -1, focus: 1, gk: 0, specialization: 0 });
    for (const v of Object.values(complete)) { expect(v).toBe(0); }
  });

  test('shared touch factor lifts technique and passing together (the dependency)', () => {
    const d = traitDeltas(
      { physique: 0, craft: 0, focus: 0, gk: 0, specialization: 0 }, 'CM', 1, 0,
    );
    expect(d.technique).toBeGreaterThan(0);
    expect(d.passing).toBeGreaterThan(0);
  });

  test('free sampling produces real within-player spread: gaps past 25 occur, means stay put', () => {
    const gen = new PlayerGenerator('female', 'all', mulberry32(7));
    let maxGap = 0;
    for (let i = 0; i < 200; i++) {
      const a = gen.generatePlayer('CM', { overall: 55 }).attributes;
      const outfield = [a.speed, a.strength, a.passing, a.technique, a.finishing, a.defending];
      maxGap = Math.max(maxGap, Math.max(...outfield) - Math.min(...outfield));
      expect(Math.round(calculateOverall(a))).toBeGreaterThanOrEqual(50);
      expect(Math.round(calculateOverall(a))).toBeLessThanOrEqual(60);
    }
    expect(maxGap).toBeGreaterThan(25);
  });

  test('technique and passing correlate positively across free-sampled players', () => {
    const gen = new PlayerGenerator('female', 'all', mulberry32(11));
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = gen.generatePlayer('CM', { overall: 55 }).attributes;
      xs.push(a.technique); ys.push(a.passing);
    }
    const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
    const mx = mean(xs), my = mean(ys);
    const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    const sd = (v: number[], m: number) => Math.sqrt(mean(v.map(n => (n - m) ** 2)));
    const r = cov / (sd(xs, mx) * sd(ys, my));
    expect(r).toBeGreaterThan(0.15);
  });
});
