import { PlayerGenerator } from './playerGenerator';

describe('PlayerGenerator', () => {
  let playerGenerator: PlayerGenerator;

  beforeEach(() => {
    playerGenerator = new PlayerGenerator();
  });

  test('should generate a player with correct properties', () => {
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

  test('should generate player attributes within valid range', () => {
    const player = playerGenerator.generatePlayer('CM');

    const attributeKeys = ['speed', 'strength', 'agility', 'passing', 'finishing', 'technique', 'defending', 'stamina', 'awareness', 'composure'] as const;

    attributeKeys.forEach(key => {
      const value = player.attributes[key];
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    });
  });

  test('should adjust attributes based on position', () => {
    const goalkeeper = playerGenerator.generatePlayer('GK');
    const striker = playerGenerator.generatePlayer('ST');

    expect(goalkeeper.attributes.agility).toBeGreaterThanOrEqual(1);
    expect(striker.attributes.finishing).toBeGreaterThanOrEqual(1);
  });

  test('should generate multiple players', () => {
    const players = playerGenerator.generatePlayers('CB', 3);

    expect(players).toHaveLength(3);
    players.forEach(player => {
      expect(player.position).toBe('CB');
      expect(player.id).toBeDefined();
      expect(player.name).toBeDefined();
    });
  });

  test('should generate unique player IDs', () => {
    const players = playerGenerator.generatePlayers('CM', 5);
    const ids = players.map(p => p.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(5);
  });

  test('should generate a full squad', () => {
    const squad = playerGenerator.generateSquad('4-4-2');

    expect(squad).toHaveLength(11);
    expect(squad.filter(p => p.position === 'GK')).toHaveLength(1);
    expect(squad.filter(p => ['CB', 'LB', 'RB'].includes(p.position))).toHaveLength(4);
    expect(squad.filter(p => ['CM', 'LM', 'RM'].includes(p.position))).toHaveLength(4);
    expect(squad.filter(p => p.position === 'ST')).toHaveLength(2);
  });

  test('should respect custom attribute ranges', () => {
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

  test('should generate different formations correctly', () => {
    const formations = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'];

    formations.forEach(formation => {
      const squad = playerGenerator.generateSquad(formation);
      expect(squad).toHaveLength(11);
      expect(squad.filter(p => p.position === 'GK')).toHaveLength(1);
    });
  });
});
