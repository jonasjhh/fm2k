import { PlayerGenerator } from './player-generator';
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
      ['norway', 'norwegian'],
      ['england', 'english'],
      ['germany', 'german'],
      ['france', 'french'],
      ['spain', 'spanish'],
      ['italy', 'italian'],
      ['sweden', 'swedish'],
      ['denmark', 'danish'],
    ] as const)('maps country %s to nationality %s', (country, nationality) => {
      const player = new PlayerGenerator('female', country).generatePlayer('ST');
      expect(player.nationality).toBe(nationality);
    });

    test('uses "unknown" nationality for the "all" country', () => {
      const player = new PlayerGenerator('female', 'all').generatePlayer('ST');
      expect(player.nationality).toBe('unknown');
    });
  });
});
