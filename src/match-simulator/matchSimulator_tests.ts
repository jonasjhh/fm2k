import { MatchSimulator, createMatchSimulator } from './matchSimulator';
import { Team, Player, Formation } from '../fm-types';

function createTestPlayer(id: string, name: string, position: any): Player {
  return {
    id,
    name,
    position,
    attributes: {
      // Physical
      speed: 70,
      strength: 70,
      agility: position === 'GK' ? 85 : 70,
      // Technical
      passing: 70,
      finishing: position === 'GK' ? 30 : 70,
      technique: 70,
      defending: ['CB', 'LB', 'RB', 'CDM'].includes(position) ? 85 : 50,
      stamina: 75,
      // Mental
      awareness: 70,
      composure: 70,
    },
  };
}

function createTestTeam(id: string, name: string, formation: Formation = '4-4-2'): Team {
  const starters: Player[] = [
    createTestPlayer('gk1', 'Goalkeeper', 'GK'),
    createTestPlayer('cb1', 'Centre Back 1', 'CB'),
    createTestPlayer('cb2', 'Centre Back 2', 'CB'),
    createTestPlayer('lb1', 'Left Back', 'LB'),
    createTestPlayer('rb1', 'Right Back', 'RB'),
    createTestPlayer('cm1', 'Central Mid 1', 'CM'),
    createTestPlayer('cm2', 'Central Mid 2', 'CM'),
    createTestPlayer('lm1', 'Left Mid', 'LM'),
    createTestPlayer('rm1', 'Right Mid', 'RM'),
    createTestPlayer('st1', 'Striker 1', 'ST'),
    createTestPlayer('st2', 'Striker 2', 'ST'),
  ];

  const substitutes: Player[] = [
    createTestPlayer('sub1', 'Sub 1', 'CB'),
    createTestPlayer('sub2', 'Sub 2', 'CM'),
    createTestPlayer('sub3', 'Sub 3', 'ST'),
  ];

  return {
    id,
    name,
    formation,
    starters,
    substitutes,
    tactics: {
      attackingMentality: 'balanced',
      passingStyle: 'mixed',
      tempo: 'medium',
      width: 'balanced',
    },
  };
}

describe('MatchSimulator', () => {
  let homeTeam: Team;
  let awayTeam: Team;

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
  });

  test('should create match simulator with valid teams', () => {
    // Act & Assert
    expect(() => {
      createMatchSimulator(homeTeam, awayTeam);
    }).not.toThrow();
  });

  test('should initialize match with correct starting state', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const initialState = simulator.getCurrentState();

    // Assert
    expect(initialState.minute).toBe(0);
    expect(initialState.homeScore).toBe(0);
    expect(initialState.awayScore).toBe(0);
    expect(initialState.phase).toBe('first_half');
    expect(initialState.homeTeam.id).toBe('home');
    expect(initialState.awayTeam.id).toBe('away');
  });

  test('should simulate entire match', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act & Assert - Should not throw
    expect(() => {
      simulator.simulate();
    }).not.toThrow();

    const state = simulator.getCurrentState();
    expect(state.minute).toBeGreaterThanOrEqual(90);
    expect(state.phase).toBe('full_time');
  });

  test('should generate match events during simulation', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const events = simulator.getEvents();

    // Assert
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(result.events).toEqual(events);
  });

  test('should progress through match phases', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const finalState = simulator.getCurrentState();

    // Assert
    expect(finalState.phase).toBe('full_time');
    expect(finalState.minute).toBeGreaterThanOrEqual(90);
    expect(result.finalState.phase).toBe('full_time');
  });

  test('should handle team formations correctly', () => {
    // Arrange
    const team433 = createTestTeam('test', 'Test Team', '4-3-3');
    const team352 = createTestTeam('test2', 'Test Team 2', '3-5-2');

    // Act & Assert
    expect(() => {
      createMatchSimulator(team433, team352);
    }).not.toThrow();

    const simulator = createMatchSimulator(team433, team352);
    const state = simulator.getCurrentState();

    expect(state.homeTeam.formation).toBe('4-3-3');
    expect(state.awayTeam.formation).toBe('3-5-2');
  });

  test('should track player lineups during match', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const state = simulator.getCurrentState();

    // Assert
    expect(state.currentPlayers.home).toHaveLength(11);
    expect(state.currentPlayers.away).toHaveLength(11);
    expect(result.finalState.currentPlayers.home).toHaveLength(11);
  });

  test('should handle match events correctly', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const events = simulator.getEvents();
    const state = simulator.getCurrentState();

    // Assert
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(state.minute).toBeGreaterThanOrEqual(90);
    expect(result.events).toEqual(events);
  });

  test('should maintain match statistics', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const state = simulator.getCurrentState();

    // Assert
    expect(typeof state.homeScore).toBe('number');
    expect(typeof state.awayScore).toBe('number');
    expect(state.homeScore).toBeGreaterThanOrEqual(0);
    expect(state.awayScore).toBeGreaterThanOrEqual(0);
    expect(result.statistics).toBeDefined();
    expect(result.statistics.possession).toBeDefined();
  });

  test('should end match at full time', () => {
    // Arrange
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Act
    const result = simulator.simulate();
    const finalState = simulator.getCurrentState();

    // Assert
    expect(finalState.phase).toBe('full_time');
    expect(finalState.minute).toBeGreaterThanOrEqual(90);
    expect(result.finalState.phase).toBe('full_time');
  });

  test('should handle tactical variations', () => {
    // Arrange
    const defensiveTeam = createTestTeam('def', 'Defensive Team');
    defensiveTeam.tactics = {
      attackingMentality: 'defensive',
      passingStyle: 'short',
      tempo: 'slow',
      width: 'narrow',
    };

    const attackingTeam = createTestTeam('att', 'Attacking Team');
    attackingTeam.tactics = {
      attackingMentality: 'attacking',
      passingStyle: 'long',
      tempo: 'fast',
      width: 'wide',
    };

    // Act & Assert
    expect(() => {
      createMatchSimulator(defensiveTeam, attackingTeam);
    }).not.toThrow();

    const simulator = createMatchSimulator(defensiveTeam, attackingTeam);
    const state = simulator.getCurrentState();

    expect(state.homeTeam.tactics?.attackingMentality).toBe('defensive');
    expect(state.awayTeam.tactics?.attackingMentality).toBe('attacking');
  });
});

describe('createMatchSimulator factory', () => {
  let homeTeam: Team;
  let awayTeam: Team;

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
  });

  test('should create MatchSimulator instance', () => {
    // Act
    const simulator = createMatchSimulator(homeTeam, awayTeam);

    // Assert
    expect(simulator).toBeInstanceOf(MatchSimulator);
  });

  test('should create simulator with different team configurations', () => {
    // Arrange
    const team1 = createTestTeam('team1', 'Team 1', '4-4-2');
    const team2 = createTestTeam('team2', 'Team 2', '3-4-3');

    // Act & Assert
    expect(() => {
      createMatchSimulator(team1, team2);
    }).not.toThrow();

    const simulator = createMatchSimulator(team1, team2);
    const state = simulator.getCurrentState();

    expect(state.homeTeam.formation).toBe('4-4-2');
    expect(state.awayTeam.formation).toBe('3-4-3');
  });

  test('should create multiple independent simulator instances', () => {
    // Act
    const simulator1 = createMatchSimulator(homeTeam, awayTeam);
    const simulator2 = createMatchSimulator(awayTeam, homeTeam); // Swapped

    // Assert
    expect(simulator1).toBeInstanceOf(MatchSimulator);
    expect(simulator2).toBeInstanceOf(MatchSimulator);
    expect(simulator1).not.toBe(simulator2);

    // Different initial states
    const state1 = simulator1.getCurrentState();
    const state2 = simulator2.getCurrentState();

    expect(state1.homeTeam.id).toBe('home');
    expect(state2.homeTeam.id).toBe('away');
  });
});
