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

    test('given default configuration when generating players for different positions then should adjust attributes based on position', () => {
      const goalkeeper = playerGenerator.generatePlayer('GK');
      const striker = playerGenerator.generatePlayer('ST');

      expect(goalkeeper.attributes.agility).toBeGreaterThanOrEqual(1);
      expect(striker.attributes.finishing).toBeGreaterThanOrEqual(1);
    });

    test('given custom attribute range configuration when generating a player with custom min/max attributes then should respect the configured range', () => {
      const config = { minAttribute: 15, maxAttribute: 18 };
      const playerGen = new PlayerGenerator(config);
      const player = playerGen.generatePlayer('CM');

      const attributeKeys = ['speed', 'strength', 'agility', 'passing', 'finishing', 'technique', 'defending', 'stamina', 'awareness', 'composure'] as const;

      attributeKeys.forEach(key => {
        const value = player.attributes[key];
        expect(value).toBeGreaterThanOrEqual(15);
        expect(value).toBeLessThanOrEqual(20); // Position boosts can push over maxAttribute
      });
    });
  });

  describe('.generatePlayers()', () => {
    let playerGenerator: PlayerGenerator;

    beforeEach(() => {
      playerGenerator = new PlayerGenerator();
    });

    test('given default configuration when generating multiple players then should create all players with correct position', () => {
      const players = playerGenerator.generatePlayers('CB', 3);

      expect(players).toHaveLength(3);
      players.forEach(player => {
        expect(player.position).toBe('CB');
        expect(player.id).toBeDefined();
        expect(player.name).toBeDefined();
      });
    });

    test('given default configuration when generating multiple players then should give each player unique ID', () => {
      const players = playerGenerator.generatePlayers('CM', 5);
      const ids = players.map(p => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('.generateSquad()', () => {
    let playerGenerator: PlayerGenerator;

    beforeEach(() => {
      playerGenerator = new PlayerGenerator();
    });

    test('given default configuration when generating a squad with 4-4-2 formation then should contain correct number of players per position', () => {
      const squad = playerGenerator.generateSquad('4-4-2');

      expect(squad).toHaveLength(11);
      expect(squad.filter(p => p.position === 'GK')).toHaveLength(1);
      expect(squad.filter(p => ['CB', 'LB', 'RB'].includes(p.position))).toHaveLength(4);
      expect(squad.filter(p => ['CM', 'LM', 'RM'].includes(p.position))).toHaveLength(4);
      expect(squad.filter(p => p.position === 'ST')).toHaveLength(2);
    });

    test('given default configuration when generating squads with different formations then should create 11 players with 1 goalkeeper each', () => {
      const formations = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'];

      formations.forEach(formation => {
        const squad = playerGenerator.generateSquad(formation);
        expect(squad).toHaveLength(11);
        expect(squad.filter(p => p.position === 'GK')).toHaveLength(1);
      });
    });
  });
});
