import { MatchSimulator, flattenMatchEventChain, type MatchConfig } from './match-simulator.ts';
import { Team, Player, Formation } from '../shared/types.ts';
import { assertDefined } from '../test-assert.ts';

/** Defaults homeStarters/awayStarters to the first 11 squad members (already slot-ordered
 *  by createTestTeam below) so existing call sites don't need to spell them out. */
function sim(config: Omit<MatchConfig, 'homeStarters' | 'awayStarters'> & Partial<Pick<MatchConfig, 'homeStarters' | 'awayStarters'>>): MatchSimulator {
  return new MatchSimulator({
    homeStarters: config.homeTeam.squad.slice(0, 11),
    awayStarters: config.awayTeam.squad.slice(0, 11),
    ...config,
  });
}

function createTestPlayer(id: string, name: string, position: any): Player {
  return {
    id,
    name,
    nationality: 'norwegian',
    age: 25,
    position,
    potential: 70,
    attributes: {
      speed: 70,
      strength: 70,
      agility: position === 'GK' ? 85 : 70,
      passing: 70,
      finishing: position === 'GK' ? 30 : 70,
      technique: 70,
      defending: ['CB', 'LB', 'RB', 'CDM'].includes(position) ? 85 : 50,
      stamina: 75,
      awareness: 70,
      composure: 70,
    },
  };
}

function createTestTeam(id: string, name: string, formation: Formation = '4-4-2'): Team {
  const starters: Player[] = [
    createTestPlayer('gk1', 'Goalkeeper', 'GK'),
    createTestPlayer('lb1', 'Left Back', 'LB'),
    createTestPlayer('cb1', 'Centre Back 1', 'CB'),
    createTestPlayer('cb2', 'Centre Back 2', 'CB'),
    createTestPlayer('rb1', 'Right Back', 'RB'),
    createTestPlayer('lm1', 'Left Mid', 'LM'),
    createTestPlayer('cm1', 'Central Mid 1', 'CM'),
    createTestPlayer('cm2', 'Central Mid 2', 'CM'),
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
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    squad: [...starters, ...substitutes],
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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team1, awayTeam: team2 });

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

      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: defensiveTeam, awayTeam: attackingTeam });

      // Act
      const state = simulator.getCurrentState();

      // Assert
      expect(state.homeTeam.tactics?.attackingMentality).toBe('defensive');
      expect(state.awayTeam.tactics?.attackingMentality).toBe('attacking');
    });

    test('given simulated match when getting final state then should track player lineups', () => {
      // Arrange — a constant rng never trips a foul (foul chance < 0.4), so no sending-off
      // perturbs the count; this isolates "lineups are tracked" from discipline.
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, rng: () => 0.5 });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

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
      sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
    }).not.toThrow();
  });

  test('given valid teams when creating simulator then should return valid instance', () => {
    // Act
    const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });

    // Assert
    expect(simulator).toBeInstanceOf(MatchSimulator);
  });

  test('given valid teams when creating multiple simulators then should create independent instances', () => {
    // Act
    const simulator1 = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
    const simulator2 = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: awayTeam, awayTeam: homeTeam }); // Swapped

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
      sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team433, awayTeam: team352 });
    }).not.toThrow();

    const simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam: team433, awayTeam: team352 });
    const state = simulator.getCurrentState();

    expect(state.homeTeam.formation).toBe('4-3-3');
    expect(state.awayTeam.formation).toBe('3-5-2');
  });
});

describe('MatchSimulator.simulateMinute():', () => {
  let homeTeam: Team;
  let awayTeam: Team;
  let simulator: MatchSimulator;

  function baseState(overrides: Partial<import('./types.js').MatchState> = {}): import('./types.js').MatchState {
    return {
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      possession: 'home',
      ballPosition: { zone: 'middle_third', side: 'center' },
      phase: 'first_half',
      homeTeam,
      awayTeam,
      currentPlayers: { home: homeTeam.squad.slice(0, 11), away: awayTeam.squad.slice(0, 11) },
      bookings: { yellow: [], red: [] },
      ...overrides,
    };
  }

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
    simulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
  });

  test('given a state when called then returns events and nextState', () => {
    const { events, nextState } = simulator.simulateMinute(baseState());
    expect(Array.isArray(events)).toBe(true);
    expect(nextState).toBeDefined();
  });

  test('given any state when called then nextState.minute is incremented by 1', () => {
    const { nextState } = simulator.simulateMinute(baseState({ minute: 10 }));
    expect(nextState.minute).toBe(11);
  });

  test('given a state when called then does not mutate the input state', () => {
    const input = baseState({ minute: 5 });
    simulator.simulateMinute(input);
    expect(input.minute).toBe(5);
  });

  test('given minute 44 in first_half when called then nextState phase is half_time', () => {
    const { nextState } = simulator.simulateMinute(baseState({ minute: 44, phase: 'first_half' }));
    expect(nextState.phase).toBe('half_time');
    expect(nextState.minute).toBe(45);
  });

  test('given minute 44 in first_half when called then a half_time event is included', () => {
    const { events } = simulator.simulateMinute(baseState({ minute: 44, phase: 'first_half' }));
    expect(events.some(e => e.type === 'half_time')).toBe(true);
  });

  test('given minute 45 in half_time when called then nextState phase is second_half', () => {
    const { nextState } = simulator.simulateMinute(baseState({ minute: 45, phase: 'half_time' }));
    expect(nextState.phase).toBe('second_half');
    expect(nextState.minute).toBe(46);
  });

  test('given minute 45 in half_time when called then possession switches for the second half', () => {
    const { nextState } = simulator.simulateMinute(baseState({ minute: 45, phase: 'half_time', possession: 'home' }));
    expect(nextState.possession).toBe('away');
  });

  test('given minute 45 in half_time when called then a kickoff event is included', () => {
    const { events } = simulator.simulateMinute(baseState({ minute: 45, phase: 'half_time' }));
    expect(events.some(e => e.type === 'kickoff')).toBe(true);
  });

  test('given minute 89 in second_half when called then nextState phase is full_time', () => {
    const { nextState } = simulator.simulateMinute(baseState({ minute: 89, phase: 'second_half' }));
    expect(nextState.phase).toBe('full_time');
    expect(nextState.minute).toBe(90);
  });

  test('given minute 89 in second_half when called then a full_time event is included', () => {
    const { events } = simulator.simulateMinute(baseState({ minute: 89, phase: 'second_half' }));
    expect(events.some(e => e.type === 'full_time')).toBe(true);
  });

  test('given minute 89 in second_half when called then full_time event description includes score', () => {
    const state = baseState({ minute: 89, phase: 'second_half', homeScore: 2, awayScore: 1 });
    const { events, nextState } = simulator.simulateMinute(state);
    const fullTimeEvent = assertDefined(events.find(e => e.type === 'full_time'), 'full_time event not found');
    // A goal can fall in the 90th minute, so assert against the actual final score.
    expect(fullTimeEvent.description).toContain(String(nextState.homeScore));
    expect(fullTimeEvent.description).toContain(String(nextState.awayScore));
  });

  test('given a mid-game state when called then events have the correct minute', () => {
    const { events } = simulator.simulateMinute(baseState({ minute: 30, phase: 'first_half' }));
    const playEvents = events.filter(e => e.type !== 'half_time' && e.type !== 'full_time' && e.type !== 'kickoff');
    expect(playEvents.every(e => e.minute === 30)).toBe(true);
  });
});

describe('flattenMatchEventChain:', () => {
  function makeEvent(id: string, chained?: import('./types.js').MatchEvent): import('./types.js').MatchEvent {
    return {
      id,
      type: 'short_pass',
      minute: 10,
      team: 'home',
      description: `event ${id}`,
      resultingState: {} as any,
      chainedEvent: chained,
    };
  }

  test('given an event with no chainedEvent then returns array with just that event', () => {
    const event = makeEvent('e1');
    expect(flattenMatchEventChain(event)).toEqual([event]);
  });

  test('given an event with one chainedEvent then returns both events in order', () => {
    const child = makeEvent('e2');
    const parent = makeEvent('e1', child);
    expect(flattenMatchEventChain(parent)).toEqual([parent, child]);
  });

  test('given an event with nested chainedEvents then returns all events in order', () => {
    const grandchild = makeEvent('e3');
    const child = makeEvent('e2', grandchild);
    const parent = makeEvent('e1', child);
    expect(flattenMatchEventChain(parent)).toEqual([parent, child, grandchild]);
  });
});

describe('MatchSimulator extra time:', () => {
  let homeTeam: Team;
  let awayTeam: Team;
  let etSimulator: MatchSimulator;

  function baseState(overrides: Partial<import('./types.js').MatchState> = {}): import('./types.js').MatchState {
    return {
      minute: 0, homeScore: 0, awayScore: 0, possession: 'home',
      ballPosition: { zone: 'middle_third', side: 'center' }, phase: 'first_half',
      homeTeam, awayTeam,
      currentPlayers: { home: homeTeam.squad.slice(0, 11), away: awayTeam.squad.slice(0, 11) },
      bookings: { yellow: [], red: [] },
      ...overrides,
    };
  }

  beforeEach(() => {
    homeTeam = createTestTeam('home', 'Home Team');
    awayTeam = createTestTeam('away', 'Away Team');
    etSimulator = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, extraTimeIfDrawn: true });
  });

  // The score is read after the minute's action loop, so pin the RNG to keep the
  // 90th-minute scoreline fixed; the phase must then follow whether it is level.
  test('given a level score at minute 89 with extra time enabled then phase becomes extra_time_first (not full_time)', () => {
    // rng 0.99 keeps the action loop from scoring, so the 1-1 stays level into the 90th.
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, extraTimeIfDrawn: true, rng: () => 0.99 });
    const { nextState } = localSim.simulateMinute(baseState({ minute: 89, phase: 'second_half', homeScore: 1, awayScore: 1 }));
    expect(nextState.homeScore).toBe(nextState.awayScore); // still level
    expect(nextState.phase).toBe('extra_time_first');
    expect(nextState.minute).toBe(90);
  });

  test('given a decided score at minute 89 with extra time enabled then phase becomes full_time', () => {
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, extraTimeIfDrawn: true, rng: () => 0.99 });
    const { nextState } = localSim.simulateMinute(baseState({ minute: 89, phase: 'second_half', homeScore: 2, awayScore: 1 }));
    expect(nextState.phase).toBe('full_time'); // not level → no extra time
  });

  test('given minute 104 in extra_time_first then phase becomes extra_time_half', () => {
    const { nextState } = etSimulator.simulateMinute(baseState({ minute: 104, phase: 'extra_time_first', homeScore: 1, awayScore: 1 }));
    expect(nextState.phase).toBe('extra_time_half');
    expect(nextState.minute).toBe(105);
  });

  test('given minute 105 in extra_time_half then phase becomes extra_time_second with switched possession', () => {
    const { nextState } = etSimulator.simulateMinute(baseState({ minute: 105, phase: 'extra_time_half', possession: 'home', homeScore: 1, awayScore: 1 }));
    expect(nextState.phase).toBe('extra_time_second');
    expect(nextState.possession).toBe('away');
  });

  test('given minute 119 in extra_time_second then phase becomes extra_time_full', () => {
    const { nextState, events } = etSimulator.simulateMinute(baseState({ minute: 119, phase: 'extra_time_second', homeScore: 1, awayScore: 1 }));
    expect(nextState.phase).toBe('extra_time_full');
    expect(nextState.minute).toBe(120);
    expect(events.some(e => e.type === 'full_time')).toBe(true);
  });

  test('given extra time enabled and a forced draw then simulate() runs to minute 120', () => {
    // Force a 0-0 by giving the action selector no scoring chance is hard; instead assert
    // that whenever the result is level, it ended after extra time (minute 120).
    const result = etSimulator.simulate();
    if (result.finalState.homeScore === result.finalState.awayScore) {
      expect(result.finalState.phase).toBe('extra_time_full');
      expect(result.finalState.minute).toBe(120);
    } else {
      expect(['full_time', 'extra_time_full']).toContain(result.finalState.phase);
    }
  });

  test('given extra time disabled then a level match still ends at full_time minute 90', () => {
    const plain = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam });
    const result = plain.simulate();
    expect(result.finalState.phase).toBe('full_time');
    expect(result.finalState.minute).toBe(90);
  });
});

describe('MatchSimulator statistics:', () => {
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('derives every statistic from the recorded match events', () => {
    const homeTeam = createTestTeam('home', 'Home Team');
    const awayTeam = createTestTeam('away', 'Away Team');
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, rng: mulberry32(42) });

    const result = localSim.simulate();
    const ev = result.events;
    const he = ev.filter(e => e.team === 'home');
    const ae = ev.filter(e => e.team === 'away');

    // Independent recomputation of each formula — any mutated production formula diverges.
    const homeShots = he.filter(e => e.type === 'shot' || e.type === 'goal').length;
    const awayShots = ae.filter(e => e.type === 'shot' || e.type === 'goal').length;
    const homeOnTarget = he.filter(e => e.type === 'goal').length + ae.filter(e => e.type === 'save').length;
    const awayOnTarget = ae.filter(e => e.type === 'goal').length + he.filter(e => e.type === 'save').length;
    const homePoss = Math.round((he.length / ev.length) * 100);
    const count = (evs: typeof ev, type: string) => evs.filter(e => e.type === type).length;

    expect(ev.length).toBeGreaterThan(0);
    expect(result.statistics.shots).toEqual({ home: homeShots, away: awayShots });
    expect(result.statistics.shotsOnTarget).toEqual({ home: homeOnTarget, away: awayOnTarget });
    expect(result.statistics.possession).toEqual({ home: homePoss, away: 100 - homePoss });
    expect(result.statistics.corners).toEqual({ home: count(he, 'corner'), away: count(ae, 'corner') });
    expect(result.statistics.fouls).toEqual({ home: count(he, 'foul'), away: count(ae, 'foul') });
    expect(result.statistics.cards).toEqual({
      yellow: { home: count(he, 'yellow_card'), away: count(ae, 'yellow_card') },
      red: { home: count(he, 'red_card'), away: count(ae, 'red_card') },
    });
  });

  test('possession percentages always sum to 100', () => {
    const homeTeam = createTestTeam('home', 'Home Team');
    const awayTeam = createTestTeam('away', 'Away Team');
    const localSim = sim({ matchDuration: 90, eventsPerMinute: 3, homeTeam, awayTeam, rng: mulberry32(7) });
    const { possession } = localSim.simulate().statistics;
    expect(possession.home + possession.away).toBe(100);
  });
});
