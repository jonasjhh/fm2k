import { PlayerGenerator } from './playerGenerator';

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
});
