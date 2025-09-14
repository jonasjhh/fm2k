import { MatchSimulator } from './matchSimulator.js';
import { Team, Player, Formation } from '../fm-types/types.js';

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

describe('MatchSimulator:', () => {
  let homeTeam: Team;
  let awayTeam: Team;

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
  });

  describe('.getCurrentState()', () => {
    test('given newly created match simulator when getting initial state then should return correct starting values', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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

    test('given match simulator with different team configurations when getting state then should maintain team configurations', () => {
      // Arrange
      const team1 = createTestTeam('team1', 'Team 1', '4-4-2');
      const team2 = createTestTeam('team2', 'Team 2', '3-4-3');
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team1, awayTeam: team2 });

      // Act
      const state = simulator.getCurrentState();

      // Assert
      expect(state.homeTeam.formation).toBe('4-4-2');
      expect(state.awayTeam.formation).toBe('3-4-3');
    });

    test('given match simulator with different tactical setups when getting state then should maintain tactical variations', () => {
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

      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam: defensiveTeam, awayTeam: attackingTeam });

      // Act
      const state = simulator.getCurrentState();

      // Assert
      expect(state.homeTeam.tactics?.attackingMentality).toBe('defensive');
      expect(state.awayTeam.tactics?.attackingMentality).toBe('attacking');
    });

    test('given simulated match when getting final state then should track player lineups', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

      // Act
      const result = simulator.simulate();
      const state = simulator.getCurrentState();

      // Assert
      expect(state.currentPlayers.home).toHaveLength(11);
      expect(state.currentPlayers.away).toHaveLength(11);
      expect(result.finalState.currentPlayers.home).toHaveLength(11);
    });
  });

  describe('.simulate()', () => {
    test('given valid teams when simulating entire match then should complete at full time', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

      // Act & Assert - Should not throw
      expect(() => {
        simulator.simulate();
      }).not.toThrow();

      const state = simulator.getCurrentState();
      expect(state.minute).toBeGreaterThanOrEqual(90);
      expect(state.phase).toBe('full_time');
    });

    test('given valid teams when simulating match then should produce match events', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

      // Act
      const result = simulator.simulate();
      const events = simulator.getEvents();

      // Assert
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      expect(result.events).toEqual(events);
    });

    test('given valid teams when simulating match then should advance through match phases', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

      // Act
      const result = simulator.simulate();
      const finalState = simulator.getCurrentState();

      // Assert
      expect(finalState.phase).toBe('full_time');
      expect(finalState.minute).toBeGreaterThanOrEqual(90);
      expect(result.finalState.phase).toBe('full_time');
    });

    test('given valid teams when simulating match then should process events correctly', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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

    test('given valid teams when simulating match then should track match statistics', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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

    test('given valid teams when simulating match then should finish at full time', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

      // Act
      const result = simulator.simulate();
      const finalState = simulator.getCurrentState();

      // Assert
      expect(finalState.phase).toBe('full_time');
      expect(finalState.minute).toBeGreaterThanOrEqual(90);
      expect(result.finalState.phase).toBe('full_time');
    });
  });

  describe('.getEvents()', () => {
    test('given simulated match when getting events then should handle events correctly', () => {
      // Arrange
      const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
  });
});

describe('MatchSimulator constructor:', () => {
  let homeTeam: Team;
  let awayTeam: Team;

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
  });

  test('given valid teams when creating match simulator then should create without error', () => {
    // Act & Assert
    expect(() => {
      new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
    }).not.toThrow();
  });

  test('given valid teams when creating simulator then should return valid instance', () => {
    // Act
    const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

    // Assert
    expect(simulator).toBeInstanceOf(MatchSimulator);
  });

  test('given valid teams when creating multiple simulators then should create independent instances', () => {
    // Act
    const simulator1 = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
    const simulator2 = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam: awayTeam, awayTeam: homeTeam }); // Swapped

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

  test('given teams with different formations when creating simulator then should accept different formations', () => {
    // Arrange
    const team433 = createTestTeam('test', 'Test Team', '4-3-3');
    const team352 = createTestTeam('test2', 'Test Team 2', '3-5-2');

    // Act & Assert
    expect(() => {
      new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team433, awayTeam: team352 });
    }).not.toThrow();

    const simulator = new MatchSimulator({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team433, awayTeam: team352 });
    const state = simulator.getCurrentState();

    expect(state.homeTeam.formation).toBe('4-3-3');
    expect(state.awayTeam.formation).toBe('3-5-2');
  });
});
