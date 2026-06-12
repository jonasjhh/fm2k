import { MatchState, MatchEvent, MatchResult, MatchStatistics, EventType } from './types.ts';

export function flattenMatchEventChain(event: MatchEvent): MatchEvent[] {
  if (!event.chainedEvent) {return [event];}
  return [event, ...flattenMatchEventChain(event.chainedEvent)];
}
import { Team } from '../shared/types.ts';
import { selectStartingXI } from '../lineup/selection.ts';
import { ActionSelector } from './action-selector.ts';
import {
  ShortPassGenerator,
  DribbleGenerator,
  TackleGenerator,
  InterceptionGenerator,
  ShotGenerator,
} from './action-generators.ts';

export interface MatchConfig {
  matchDuration: number;
  eventsPerMinute: number;
  homeTeam: Team;
  awayTeam: Team;
  /** Players that cannot play (injured/suspended/etc.); excluded from XI selection. */
  homeUnavailableIds?: ReadonlySet<string>;
  awayUnavailableIds?: ReadonlySet<string>;
}

export class MatchSimulator {
  private readonly actionSelector: ActionSelector;
  private readonly config: MatchConfig;
  private events: MatchEvent[] = [];
  private currentState: MatchState;

  constructor(config: MatchConfig) {
    this.config = config;
    this.actionSelector = new ActionSelector();
    this.initializeActionGenerators();
    this.currentState = this.createInitialState();
  }

  private initializeActionGenerators(): void {
    this.actionSelector.registerAction('short_pass', new ShortPassGenerator());
    this.actionSelector.registerAction('dribble', new DribbleGenerator());
    this.actionSelector.registerAction('tackle', new TackleGenerator());
    this.actionSelector.registerAction('interception', new InterceptionGenerator());
    this.actionSelector.registerAction('shot', new ShotGenerator());
  }

  private selectXI(team: Team, unavailableIds?: ReadonlySet<string>) {
    return selectStartingXI([...team.starters, ...team.substitutes], team.formation, { unavailableIds });
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
        home: this.selectXI(this.config.homeTeam, this.config.homeUnavailableIds),
        away: this.selectXI(this.config.awayTeam, this.config.awayUnavailableIds),
      },
      bookings: {
        yellow: [],
        red: [],
      },
    };
  }

  simulateMinute(state: MatchState): { events: MatchEvent[]; nextState: MatchState } {
    const events: MatchEvent[] = [];
    let currentState = state;

    const count = Math.floor(Math.random() * this.config.eventsPerMinute) + 1;
    for (let i = 0; i < count; i++) {
      const event = this.actionSelector.selectPlayerAction(currentState);
      if (event) {
        const chain = flattenMatchEventChain(event);
        events.push(...chain);
        currentState = { ...chain[chain.length - 1].resultingState };
      }
    }

    const nextMinute = currentState.minute + 1;
    let nextState: MatchState = { ...currentState, minute: nextMinute };

    if (nextMinute === 45 && currentState.phase === 'first_half') {
      nextState = { ...nextState, phase: 'half_time' };
      events.push(this.createPhaseEvent('half_time', nextState, 'Half Time'));
    } else if (nextMinute === 46 && currentState.phase === 'half_time') {
      const newPossession = nextState.possession === 'home' ? 'away' : 'home';
      nextState = {
        ...nextState,
        phase: 'second_half',
        possession: newPossession,
        ballPosition: { zone: 'middle_third', side: 'center' },
      };
      events.push(this.createPhaseEvent('kickoff', nextState, 'Second Half begins'));
    } else if (nextMinute === 90 && currentState.phase === 'second_half') {
      nextState = { ...nextState, phase: 'full_time' };
      events.push(this.createPhaseEvent(
        'full_time',
        nextState,
        `Full Time: ${nextState.homeTeam.name} ${nextState.homeScore} - ${nextState.awayScore} ${nextState.awayTeam.name}`,
      ));
    }

    return { events, nextState };
  }

  simulate(): MatchResult {
    this.events = [];
    this.currentState = this.createInitialState();

    while (this.currentState.phase !== 'full_time') {
      const { events, nextState } = this.simulateMinute(this.currentState);
      this.events.push(...events);
      this.currentState = nextState;
    }

    return {
      events: [...this.events],
      finalState: { ...this.currentState },
      statistics: this.calculateStatistics(),
    };
  }

  getCurrentState(): MatchState {
    return { ...this.currentState };
  }

  getEvents(): MatchEvent[] {
    return [...this.events];
  }


  private createPhaseEvent(type: EventType, state: MatchState, description: string): MatchEvent {
    return {
      id: this.actionSelector.generateId(),
      type,
      minute: state.minute,
      team: 'home',
      description,
      resultingState: { ...state },
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
}
