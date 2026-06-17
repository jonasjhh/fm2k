import { MatchState, MatchEvent, MatchResult, MatchStatistics, EventType } from './types.ts';

export function flattenMatchEventChain(event: MatchEvent): MatchEvent[] {
  if (!event.chainedEvent) {return [event];}
  return [event, ...flattenMatchEventChain(event.chainedEvent)];
}
import { Player, Team } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS, clampParam } from '../tactics/match-parameters.ts';
import { perMinuteDrain, applyFatigue } from './fatigue.ts';
import { generateInjuries, type InjuryReport } from './injury.ts';

// Momentum: a goal gives the scorers a short-lived attacking lift that decays each minute.
const MOMENTUM_ON_GOAL = 35;
const MOMENTUM_DECAY = 0.72;

// Home advantage as a chance-quality bump (~+10% conversion at neutral via qFactor).
const HOME_ADVANTAGE_CQ = 16;
function withHomeAdvantage(p: MatchParameters): MatchParameters {
  return { ...p, chanceQuality: clampParam(p.chanceQuality + HOME_ADVANTAGE_CQ) };
}
import { selectStartingXI } from '../lineup/selection.ts';
import { ActionSelector } from './action-selector.ts';
import {
  ShortPassGenerator,
  DribbleGenerator,
  ShotGenerator,
  LongPassGenerator,
  ThroughBallGenerator,
  CrossGenerator,
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
  /** Starting energy 0..100 per player id (e.g. seeded from ClubPlayer.fitness so a
   *  tired squad starts flatter). Missing players default to 100 (fresh). */
  homeFitness?: Record<string, number>;
  awayFitness?: Record<string, number>;
  /** Injected randomness (default Math.random) — makes a whole match deterministic in tests. */
  rng?: () => number;
}

/** Phases at which a match is over (regulation, or after extra time). */
export function isTerminalPhase(phase: MatchState['phase']): boolean {
  return phase === 'full_time' || phase === 'extra_time_full';
}

/** Initial energy per player id; seeded from a fitness map where present, else fresh (100). */
function seedEnergy(players: Player[], fitness?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of players) { out[p.id] = fitness?.[p.id] ?? 100; }
  return out;
}

/** A copy of the roster whose attributes are scaled for each player's current energy. */
function fatiguedView(players: Player[], energy: Record<string, number>): Player[] {
  return players.map(p => ({ ...p, attributes: applyFatigue(p.attributes, energy[p.id] ?? 100) }));
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

  // Only offensive actions are registered. Defensive outcomes (tackle/interception/
  // clearance) are produced by the contest in ActionSelector, not selected as actions.
  private initializeActionGenerators(): void {
    this.actionSelector.registerAction('short_pass', new ShortPassGenerator(this.rng));
    this.actionSelector.registerAction('long_pass', new LongPassGenerator(this.rng));
    this.actionSelector.registerAction('through_ball', new ThroughBallGenerator(this.rng));
    this.actionSelector.registerAction('cross', new CrossGenerator(this.rng));
    this.actionSelector.registerAction('dribble', new DribbleGenerator(this.rng));
    this.actionSelector.registerAction('shot', new ShotGenerator(this.rng));
  }

  private selectXI(team: Team, unavailableIds?: ReadonlySet<string>) {
    return selectStartingXI([...team.starters, ...team.substitutes], team.formation, { unavailableIds });
  }

  private createInitialState(): MatchState {
    const homePlayers = this.selectXI(this.config.homeTeam, this.config.homeUnavailableIds);
    const awayPlayers = this.selectXI(this.config.awayTeam, this.config.awayUnavailableIds);
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
        home: homePlayers,
        away: awayPlayers,
      },
      params: {
        // Home advantage: a modest, realistic edge applied as a chance-quality bump on the
        // home side (crowd/familiarity) — lifts home win rate and trims draws. Kept on the
        // params (not in the generators) so the low-level maths stay pure/unit-testable.
        home: withHomeAdvantage(this.config.homeParams ?? this.config.homeTeam.tacticsParams ?? NEUTRAL_PARAMS),
        away: this.config.awayParams ?? this.config.awayTeam.tacticsParams ?? NEUTRAL_PARAMS,
      },
      energy: {
        home: seedEnergy(homePlayers, this.config.homeFitness),
        away: seedEnergy(awayPlayers, this.config.awayFitness),
      },
      momentum: { home: 0, away: 0 },
      bookings: {
        yellow: [],
        red: [],
      },
    };
  }

  /** Energy after one minute's drain for everyone currently on the pitch. */
  private decayEnergy(state: MatchState): { home: Record<string, number>; away: Record<string, number> } {
    const out = {
      home: { ...(state.energy?.home ?? {}) },
      away: { ...(state.energy?.away ?? {}) },
    };
    (['home', 'away'] as const).forEach(side => {
      const team = side === 'home' ? state.homeTeam : state.awayTeam;
      const params = state.params?.[side] ?? NEUTRAL_PARAMS;
      for (const p of state.currentPlayers[side]) {
        const cur = out[side][p.id] ?? 100;
        out[side][p.id] = Math.max(0, cur - perMinuteDrain(p, team.formation, params));
      }
    });
    return out;
  }

  simulateMinute(state: MatchState): { events: MatchEvent[]; nextState: MatchState } {
    const events: MatchEvent[] = [];

    // Drain energy for everyone on the pitch, then run this minute's actions against
    // a *fatigued view* of the rosters (attributes scaled by energy). The canonical
    // roster is restored afterwards — only the energy carries forward.
    const energy = this.decayEnergy(state);
    // Momentum from earlier goals decays each minute (set again below if a goal lands).
    const momentum = {
      home: (state.momentum?.home ?? 0) * MOMENTUM_DECAY,
      away: (state.momentum?.away ?? 0) * MOMENTUM_DECAY,
    };
    let currentState: MatchState = {
      ...state,
      energy,
      momentum,
      currentPlayers: {
        home: fatiguedView(state.currentPlayers.home, energy.home),
        away: fatiguedView(state.currentPlayers.away, energy.away),
      },
    };

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

    // Restore the real (un-fatigued) attributes, but keep any membership change from
    // this minute (e.g. a sending-off): map each player still on the pitch back to their
    // real object by id. Energy is the lasting state.
    const realById = new Map(
      [...state.currentPlayers.home, ...state.currentPlayers.away].map(p => [p.id, p] as const),
    );
    const restore = (players: Player[]): Player[] => players.map(p => realById.get(p.id) ?? p);
    currentState = {
      ...currentState,
      currentPlayers: {
        home: restore(currentState.currentPlayers.home),
        away: restore(currentState.currentPlayers.away),
      },
    };

    // A goal this minute gives the scorers a momentum lift (decays over the next minutes).
    for (const e of events) {
      if (e.type === 'goal') {
        currentState = { ...currentState, momentum: { ...currentState.momentum!, [e.team]: MOMENTUM_ON_GOAL } };
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
      injuries: this.generateInjuries(),
    };
  }

  /** Injuries picked up over the match, from each side's players and their end energy. */
  private generateInjuries(): { home: InjuryReport[]; away: InjuryReport[] } {
    const energy = this.currentState.energy ?? { home: {}, away: {} };
    return {
      home: generateInjuries(this.currentState.currentPlayers.home, energy.home, this.rng),
      away: generateInjuries(this.currentState.currentPlayers.away, energy.away, this.rng),
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

    const countType = (evs: MatchEvent[], type: EventType): number => evs.filter(e => e.type === type).length;

    return {
      possession: { home: homePossession, away: awayPossession },
      shots: { home: homeShots, away: awayShots },
      shotsOnTarget: { home: homeShotsOnTarget, away: awayShotsOnTarget },
      corners: { home: countType(homeEvents, 'corner'), away: countType(awayEvents, 'corner') },
      fouls: { home: countType(homeEvents, 'foul'), away: countType(awayEvents, 'foul') },
      cards: {
        yellow: { home: countType(homeEvents, 'yellow_card'), away: countType(awayEvents, 'yellow_card') },
        red: { home: countType(homeEvents, 'red_card'), away: countType(awayEvents, 'red_card') },
      },
    };
  }
}
