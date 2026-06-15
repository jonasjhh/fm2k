import { MatchState, MatchEvent, MatchResult, MatchStatistics, EventType } from './types.ts';

export function flattenMatchEventChain(event: MatchEvent): MatchEvent[] {
  if (!event.chainedEvent) {return [event];}
  return [event, ...flattenMatchEventChain(event.chainedEvent)];
}
import { Team } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
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
  /** When the scores are level after 90', play two 15-minute halves of extra time. */
  extraTimeIfDrawn?: boolean;
  /** Resolved tactical parameters. Override the values carried on the Team objects;
   *  default neutral (all 50), which reproduces the tactics-agnostic baseline. */
  homeParams?: MatchParameters;
  awayParams?: MatchParameters;
  /** Injected randomness (default Math.random) — makes a whole match deterministic in tests. */
  rng?: () => number;
}

/** Phases at which a match is over (regulation, or after extra time). */
export function isTerminalPhase(phase: MatchState['phase']): boolean {
  return phase === 'full_time' || phase === 'extra_time_full';
}

export class MatchSimulator {
  private readonly actionSelector: ActionSelector;
  private readonly config: MatchConfig;
  private readonly rng: () => number;
  private events: MatchEvent[] = [];
  private currentState: MatchState;

  constructor(config: MatchConfig) {
    this.config = config;
    this.rng = config.rng ?? Math.random;
    this.actionSelector = new ActionSelector(this.rng);
    this.initializeActionGenerators();
    this.currentState = this.createInitialState();
  }

  private initializeActionGenerators(): void {
    this.actionSelector.registerAction('short_pass', new ShortPassGenerator(this.rng));
    this.actionSelector.registerAction('dribble', new DribbleGenerator(this.rng));
    this.actionSelector.registerAction('tackle', new TackleGenerator(this.rng));
    this.actionSelector.registerAction('interception', new InterceptionGenerator(this.rng));
    this.actionSelector.registerAction('shot', new ShotGenerator(this.rng));
  }

  private selectXI(team: Team, unavailableIds?: ReadonlySet<string>) {
    return selectStartingXI([...team.starters, ...team.substitutes], team.formation, { unavailableIds });
  }

  private createInitialState(): MatchState {
    return {
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      possession: this.rng() < 0.5 ? 'home' : 'away',
      ballPosition: { zone: 'middle_third', side: 'center' },
      phase: 'first_half',
      homeTeam: { ...this.config.homeTeam },
      awayTeam: { ...this.config.awayTeam },
      currentPlayers: {
        home: this.selectXI(this.config.homeTeam, this.config.homeUnavailableIds),
        away: this.selectXI(this.config.awayTeam, this.config.awayUnavailableIds),
      },
      params: {
        home: this.config.homeParams ?? this.config.homeTeam.tacticsParams ?? NEUTRAL_PARAMS,
        away: this.config.awayParams ?? this.config.awayTeam.tacticsParams ?? NEUTRAL_PARAMS,
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

    // Tempo of the possessing team scales how many actions happen this minute.
    // At the neutral value (50) the multiplier is exactly 1 (baseline behaviour).
    const tempo = currentState.params?.[currentState.possession]?.tempo ?? 50;
    const tempoMult = 0.7 + (tempo / 100) * 0.6;
    const count = Math.floor(this.rng() * this.config.eventsPerMinute * tempoMult) + 1;
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
      if (this.config.extraTimeIfDrawn && currentState.homeScore === currentState.awayScore) {
        nextState = { ...nextState, phase: 'extra_time_first', ballPosition: { zone: 'middle_third', side: 'center' } };
        events.push(this.createPhaseEvent('kickoff', nextState, 'Extra Time begins'));
      } else {
        nextState = { ...nextState, phase: 'full_time' };
        events.push(this.createPhaseEvent(
          'full_time',
          nextState,
          `Full Time: ${nextState.homeTeam.name} ${nextState.homeScore} - ${nextState.awayScore} ${nextState.awayTeam.name}`,
        ));
      }
    } else if (nextMinute === 105 && currentState.phase === 'extra_time_first') {
      nextState = { ...nextState, phase: 'extra_time_half' };
      events.push(this.createPhaseEvent('half_time', nextState, 'Extra Time Half'));
    } else if (nextMinute === 106 && currentState.phase === 'extra_time_half') {
      const newPossession = nextState.possession === 'home' ? 'away' : 'home';
      nextState = {
        ...nextState,
        phase: 'extra_time_second',
        possession: newPossession,
        ballPosition: { zone: 'middle_third', side: 'center' },
      };
      events.push(this.createPhaseEvent('kickoff', nextState, 'Extra Time Second Half begins'));
    } else if (nextMinute === 120 && currentState.phase === 'extra_time_second') {
      nextState = { ...nextState, phase: 'extra_time_full' };
      events.push(this.createPhaseEvent(
        'full_time',
        nextState,
        `Full Time (AET): ${nextState.homeTeam.name} ${nextState.homeScore} - ${nextState.awayScore} ${nextState.awayTeam.name}`,
      ));
    }

    return { events, nextState };
  }

  simulate(): MatchResult {
    this.events = [];
    this.currentState = this.createInitialState();

    while (!isTerminalPhase(this.currentState.phase)) {
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
