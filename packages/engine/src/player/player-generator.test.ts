import { PlayerGenerator } from './player-generator';
import type { Position, PlayerAttributes } from '@fm2k/match';

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'speed', 'strength', 'agility', 'passing', 'finishing',
  'technique', 'defending', 'stamina', 'awareness', 'composure',
];

// Per-position attribute boosts (mirrors player-generator's table).
const BOOSTS: Record<string, Partial<Record<keyof PlayerAttributes, number>>> = {
  GK:  { agility: 3, composure: 2, awareness: 2 },
  CB:  { defending: 4, strength: 2, awareness: 2 },
  LB:  { defending: 2, speed: 2, stamina: 2 },
  RB:  { defending: 2, speed: 2, stamina: 2 },
  CDM: { defending: 3, passing: 2, awareness: 2 },
  CM:  { passing: 3, stamina: 3, technique: 2 },
  CAM: { passing: 3, technique: 3, composure: 2 },
  LM:  { speed: 3, passing: 2, stamina: 3 },
  RM:  { speed: 3, passing: 2, stamina: 3 },
  LW:  { speed: 4, technique: 2, agility: 2 },
  RW:  { speed: 4, technique: 2, agility: 2 },
  ST:  { finishing: 4, speed: 2, composure: 2 },
  CF:  { finishing: 3, technique: 3, composure: 2 },
};

/** Expected attributes when every base value is `base` and position boosts apply (clamped at 20). */
function expectedAttrs(position: string, base: number): PlayerAttributes {
  const attrs = Object.fromEntries(ATTR_KEYS.map(k => [k, base])) as unknown as PlayerAttributes;
  for (const [k, boost] of Object.entries(BOOSTS[position] ?? {})) {
    attrs[k as keyof PlayerAttributes] = Math.min(20, base + (boost ?? 0));
  }
  return attrs;
}

describe('PlayerGenerator:', () => {
  describe('.generatePlayer()', () => {
    let playerGenerator: PlayerGenerator;

    beforeEach(() => {
      playerGenerator = new PlayerGenerator();
    });

    test('given default configuration when generating a single player then should have correct properties', () => {
      const player = playerGenerator.generatePlayer('ST');

      expect(player).toHaveProperty('id');
      expect(player).toHaveProperty('name');
      expect(player).toHaveProperty('position', 'ST');
      expect(player).toHaveProperty('attributes');
      expect(typeof player.id).toBe('string');
      expect(typeof player.name).toBe('string');
      expect(player.id.length).toBeGreaterThan(0);
      expect(player.name.length).toBeGreaterThan(0);
    });

    test('given default configuration when generating a player then should have attributes within valid range', () => {
      const player = playerGenerator.generatePlayer('CM');

      const attributeKeys = ['speed', 'strength', 'agility', 'passing', 'finishing', 'technique', 'defending', 'stamina', 'awareness', 'composure'] as const;

      attributeKeys.forEach(key => {
        const value = player.attributes[key];
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(20);
      });
    });

    test('given custom attribute range when generating a player then should respect the configured range', () => {
      const player = playerGenerator.generatePlayer('CM', 15, 18);

      const attributeKeys = ['speed', 'strength', 'agility', 'passing', 'finishing', 'technique', 'defending', 'stamina', 'awareness', 'composure'] as const;

      attributeKeys.forEach(key => {
        const value = player.attributes[key];
        expect(value).toBeGreaterThanOrEqual(15);
        expect(value).toBeLessThanOrEqual(20); // Position boosts can push over maxAttribute
      });
    });

    test('given default configuration when generating players for different positions then should adjust attributes based on position', () => {
      const goalkeeper = playerGenerator.generatePlayer('GK');
      const striker = playerGenerator.generatePlayer('ST');

      expect(goalkeeper.attributes.agility).toBeGreaterThanOrEqual(1);
      expect(striker.attributes.finishing).toBeGreaterThanOrEqual(1);
    });

    test('given gender and country when constructing player generator then should generate names accordingly', () => {
      const maleNorwayGenerator = new PlayerGenerator('male', 'norway');
      const player = maleNorwayGenerator.generatePlayer('ST');

      expect(player.name).toBeTruthy();
      expect(typeof player.name).toBe('string');
      expect(player.name.length).toBeGreaterThan(0);
    });
  });

  describe('deterministic generation (injected rng):', () => {
    const positions = Object.keys(BOOSTS) as Position[];

    test.each(positions)('position %s applies exactly its attribute boosts (base 1)', position => {
      // rng=0 → every base attribute is the minimum (1), so boosts are exactly observable.
      const gen = new PlayerGenerator('female', 'all', () => 0);
      const player = gen.generatePlayer(position);
      expect(player.attributes).toEqual(expectedAttrs(position, 1));
    });

    test('clamps boosted attributes at 20 when the base is already maxed', () => {
      const gen = new PlayerGenerator('female', 'all', () => 0.999); // base 20
      const player = gen.generatePlayer('ST');
      expect(player.attributes.finishing).toBe(20); // min(20, 20 + 4)
      expect(player.attributes.speed).toBe(20);     // min(20, 20 + 2)
      expect(player.attributes.composure).toBe(20);
    });

    test('age and potential derive from the rng (rng=0)', () => {
      const gen = new PlayerGenerator('female', 'all', () => 0);
      const player = gen.generatePlayer('CM');
      const sum = ATTR_KEYS.reduce((acc, k) => acc + player.attributes[k], 0);
      expect(player.age).toBe(17);                         // 17 + floor(0 * 19)
      expect(player.potential).toBe(Math.round(sum / 10)); // avg + floor(0 * 20)
    });

    test('age and potential scale with a higher rng (base 20)', () => {
      const gen = new PlayerGenerator('female', 'all', () => 0.999);
      const player = gen.generatePlayer('CM');
      expect(player.age).toBe(35);       // 17 + floor(0.999 * 19) = 17 + 18
      expect(player.potential).toBe(39); // min(99, 20 + floor(0.999 * 20)) = 20 + 19
    });

    test('respects a custom attribute range', () => {
      const gen = new PlayerGenerator('female', 'all', () => 0.999);
      const player = gen.generatePlayer('GK', 5, 8); // base = floor(0.999 * (8-5+1)) + 5 = 8
      expect(player.attributes.strength).toBe(8);     // non-boosted attribute = top of range
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
