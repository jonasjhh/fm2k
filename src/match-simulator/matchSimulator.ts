import { MatchState, MatchEvent, MatchResult, MatchStatistics } from './types.js';
import { Team } from '../fm-types/types.js';
import { EventEngine, PassGenerator, ShotGenerator, GoalGenerator, SaveGenerator } from './eventEngine.js';

export interface MatchConfig {
  matchDuration: number;
  eventsPerMinute: number;
  homeTeam: Team;
  awayTeam: Team;
}

export class MatchSimulator {
  private eventEngine: EventEngine;
  private config: MatchConfig;
  private events: MatchEvent[] = [];
  private currentState: MatchState;

  constructor(config: MatchConfig) {
    this.config = config;
    this.eventEngine = new EventEngine();
    this.initializeEventGenerators();
    this.currentState = this.createInitialState();
  }

  private initializeEventGenerators(): void {
    this.eventEngine.registerGenerator('pass', new PassGenerator());
    this.eventEngine.registerGenerator('shot', new ShotGenerator());
    this.eventEngine.registerGenerator('goal', new GoalGenerator());
    this.eventEngine.registerGenerator('save', new SaveGenerator());
  }

  private createInitialState(): MatchState {
    return {
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      possession: Math.random() < 0.5 ? 'home' : 'away',
      ballPosition: { zone: 'middle_third', side: 'center' },
      phase: 'first_half',
      homeTeam: { ...this.config.homeTeam },
      awayTeam: { ...this.config.awayTeam },
      currentPlayers: {
        home: [...this.config.homeTeam.starters],
        away: [...this.config.awayTeam.starters],
      },
      bookings: {
        yellow: [],
        red: [],
      },
    };
  }

  simulate(): MatchResult {
    this.resetSimulation();

    while (this.currentState.phase !== 'full_time') {
      this.simulateMinute();
      this.advanceTime();
    }

    return {
      events: [...this.events],
      finalState: { ...this.currentState },
      statistics: this.calculateStatistics(),
    };
  }

  private resetSimulation(): void {
    this.events = [];
    this.currentState = this.createInitialState();
  }

  private simulateMinute(): void {
    const eventsThisMinute = Math.floor(Math.random() * this.config.eventsPerMinute) + 1;

    for (let i = 0; i < eventsThisMinute; i++) {
      const event = this.eventEngine.generateEvent(this.currentState);
      if (event) {
        this.processEvent(event);
      }
    }
  }

  private processEvent(event: MatchEvent): void {
    this.events.push(event);
    this.currentState = { ...event.resultingState };

    if (event.chainedEvent) {
      this.processEvent(event.chainedEvent);
    }
  }

  private advanceTime(): void {
    this.currentState.minute += 1;

    if (this.currentState.minute === 45 && this.currentState.phase === 'first_half') {
      this.currentState.phase = 'half_time';
      this.events.push(this.createHalfTimeEvent());
    } else if (this.currentState.minute === 46 && this.currentState.phase === 'half_time') {
      this.currentState.phase = 'second_half';
      this.events.push(this.createSecondHalfEvent());
    } else if (this.currentState.minute === 90 && this.currentState.phase === 'second_half') {
      this.currentState.phase = 'full_time';
      this.events.push(this.createFullTimeEvent());
    }
  }

  private createHalfTimeEvent(): MatchEvent {
    return {
      id: this.eventEngine.generateId(),
      type: 'half_time',
      minute: this.currentState.minute,
      team: 'home',
      description: 'Half Time',
      resultingState: { ...this.currentState },
    };
  }

  private createSecondHalfEvent(): MatchEvent {
    const newState = { ...this.currentState };
    newState.possession = newState.possession === 'home' ? 'away' : 'home';
    newState.ballPosition = { zone: 'middle_third', side: 'center' };

    return {
      id: this.eventEngine.generateId(),
      type: 'kickoff',
      minute: this.currentState.minute,
      team: newState.possession,
      description: 'Second Half begins',
      resultingState: newState,
    };
  }

  private createFullTimeEvent(): MatchEvent {
    return {
      id: this.eventEngine.generateId(),
      type: 'full_time',
      minute: this.currentState.minute,
      team: 'home',
      description: `Full Time: ${this.currentState.homeTeam.name} ${this.currentState.homeScore} - ${this.currentState.awayScore} ${this.currentState.awayTeam.name}`,
      resultingState: { ...this.currentState },
    };
  }

  private calculateStatistics(): MatchStatistics {
    const homeEvents = this.events.filter(e => e.team === 'home');
    const awayEvents = this.events.filter(e => e.team === 'away');

    const homeShots = homeEvents.filter(e => e.type === 'shot' || e.type === 'goal').length;
    const awayShots = awayEvents.filter(e => e.type === 'shot' || e.type === 'goal').length;

    const homeShotsOnTarget = homeEvents.filter(e => e.type === 'goal').length +
                              awayEvents.filter(e => e.type === 'save').length;
    const awayShotsOnTarget = awayEvents.filter(e => e.type === 'goal').length +
                              homeEvents.filter(e => e.type === 'save').length;

    const homePossession = Math.round((homeEvents.length / this.events.length) * 100);
    const awayPossession = 100 - homePossession;

    return {
      possession: { home: homePossession, away: awayPossession },
      shots: { home: homeShots, away: awayShots },
      shotsOnTarget: { home: homeShotsOnTarget, away: awayShotsOnTarget },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      cards: {
        yellow: { home: 0, away: 0 },
        red: { home: 0, away: 0 },
      },
    };
  }

  getCurrentState(): MatchState {
    return { ...this.currentState };
  }

  getEvents(): MatchEvent[] {
    return [...this.events];
  }
}

