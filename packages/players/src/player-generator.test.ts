import { PlayerGenerator, sampleNormal, ATTRIBUTE_CATEGORIES } from './player-generator.ts';
import { calculateOverall, type PlayerPosition, type PlayerAttributes } from '@fm2k/match';

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'agility', 'passing', 'finishing',
  'technique', 'defending', 'stamina', 'awareness', 'composure',
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
      const biased = sample({ mental: 15 }, 'composure');
      const control = sample(undefined, 'composure');
      expect(biased).toBeGreaterThan(control);
    });

    test('categoryBias still lands the overall near the target after rescaling', () => {
      const gen = new PlayerGenerator('female', 'all');
      const overalls = Array.from(
        { length: 30 },
        () => calculateOverall(gen.generatePlayer('CM', { overall: 60, categoryBias: { technical: -10, mental: -10 } }).attributes),
      );
      const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
      expect(Math.abs(mean - 60)).toBeLessThan(4);
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
