import { MatchState, MatchEvent, MatchResult, MatchStatistics, EventType } from './types.ts';
import { StatsAccumulator } from './stats.ts';

export function flattenMatchEventChain(event: MatchEvent): MatchEvent[] {
  if (!event.chainedEvent) {return [event];}
  return [event, ...flattenMatchEventChain(event.chainedEvent)];
}
import { Player, Team } from '../shared/types.ts';
import { type MatchParameters, NEUTRAL_PARAMS, clampParam } from '../tactics/match-parameters.ts';
import { perMinuteDrain, applyFatigue } from './fatigue.ts';
import { rollInjuries, injuryDescription, injuriesBySide } from './injury.ts';
import { mulberry32 } from './rng.ts';

// Momentum: a goal gives the scorers a short-lived attacking lift that decays each minute.
const MOMENTUM_ON_GOAL = 35;
const MOMENTUM_DECAY = 0.72;

// Home advantage as a chance-quality bump (~+10% conversion at neutral via qFactor).
// Exported so the occurrence applies the same bump when re-resolving mid-match tactics.
const HOME_ADVANTAGE_CQ = 16;
export function withHomeAdvantage(p: MatchParameters): MatchParameters {
  return { ...p, chanceQuality: clampParam(p.chanceQuality + HOME_ADVANTAGE_CQ) };
}
import { deriveFieldedPositions, deriveCustomFieldedPositions } from '../lineup/lineup.ts';
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
  /** Already-resolved starting XI (slot-ordered) — resolution (AI best-fit vs the human
   *  club's own choice) happens upstream, never inside the simulator. */
  homeStarters: Player[];
  awayStarters: Player[];
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
  /** Dedicated injury stream (tests). Defaults to a mulberry32 seeded by ONE draw from
   *  the main rng, so injury rolls never disturb the main stream beyond that draw. */
  injuryRng?: () => number;
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
  private stats = new StatsAccumulator();
  private injuryRng!: () => number;

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

  private createInitialState(): MatchState {
    // Derive the dedicated injury stream from exactly one main-stream draw: injury
    // rolls (variable in number) then never shift the rest of the match's randomness.
    this.injuryRng = this.config.injuryRng ?? mulberry32(Math.floor(this.rng() * 2 ** 31));
    const homePlayers = this.config.homeStarters;
    const awayPlayers = this.config.awayStarters;
    // A team's customSlots (manager-chosen free positioning) takes precedence over the
    // formation template when present; AI/opponent teams never set it.
    const homeCustom = this.config.homeTeam.customSlots
      ? deriveCustomFieldedPositions(this.config.homeTeam.customSlots) : undefined;
    const awayCustom = this.config.awayTeam.customSlots
      ? deriveCustomFieldedPositions(this.config.awayTeam.customSlots) : undefined;
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
      fieldedPositions: {
        home: homeCustom?.fieldedPositions ?? deriveFieldedPositions(homePlayers, this.config.homeTeam.formation),
        away: awayCustom?.fieldedPositions ?? deriveFieldedPositions(awayPlayers, this.config.awayTeam.formation),
      },
      ...(homeCustom || awayCustom ? {
        fieldedGeometry: {
          home: homeCustom?.fieldedGeometry ?? {},
          away: awayCustom?.fieldedGeometry ?? {},
        },
      } : {}),
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

  /**
   * One simulated game minute, as a sequence of named pipeline steps
   * (see MATCH-PIPELINE.md): fatigue → actions → roster restore → momentum →
   * phase transitions → post-processing (statistics).
   */
  simulateMinute(state: MatchState): { events: MatchEvent[]; nextState: MatchState } {
    const events: MatchEvent[] = [];

    let currentState = this.beginMinute(state);
    currentState = this.runActions(currentState, events);
    currentState = this.restoreRosters(state, currentState);
    currentState = this.applyGoalMomentum(currentState, events);
    currentState = this.applyInjuries(currentState, events);
    const nextState = this.advancePhase(currentState, events);

    // Post-processing: counting only (no rng), so the live tick-by-tick path and the
    // one-shot simulate() path stay byte-identical.
    this.stats.record(events);

    return { events, nextState };
  }

  /** Drain energy for everyone on the pitch, decay goal momentum, and build the
   *  *fatigued view* of the rosters this minute's actions run against. The canonical
   *  roster is restored afterwards — only the energy carries forward. */
  private beginMinute(state: MatchState): MatchState {
    const energy = this.decayEnergy(state);
    const momentum = {
      home: (state.momentum?.home ?? 0) * MOMENTUM_DECAY,
      away: (state.momentum?.away ?? 0) * MOMENTUM_DECAY,
    };
    return {
      ...state,
      energy,
      momentum,
      currentPlayers: {
        home: fatiguedView(state.currentPlayers.home, energy.home),
        away: fatiguedView(state.currentPlayers.away, energy.away),
      },
    };
  }

  /** Run this minute's actions through the skill-check pipeline. The tempo of the
   *  possessing team scales how many happen; at the neutral value (50) the multiplier
   *  is exactly 1 (baseline behaviour). */
  private runActions(state: MatchState, events: MatchEvent[]): MatchState {
    let currentState = state;
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
    return currentState;
  }

  /** Restore the real (un-fatigued) attributes, but keep any membership change from
   *  this minute (e.g. a sending-off): map each player still on the pitch back to their
   *  real object by id. Energy is the lasting state. */
  private restoreRosters(preMinute: MatchState, state: MatchState): MatchState {
    const realById = new Map(
      [...preMinute.currentPlayers.home, ...preMinute.currentPlayers.away].map(p => [p.id, p] as const),
    );
    const restore = (players: Player[]): Player[] => players.map(p => realById.get(p.id) ?? p);
    return {
      ...state,
      currentPlayers: {
        home: restore(state.currentPlayers.home),
        away: restore(state.currentPlayers.away),
      },
    };
  }

  /** A goal this minute gives the scorers a momentum lift (decays over the next minutes). */
  private applyGoalMomentum(state: MatchState, events: MatchEvent[]): MatchState {
    let currentState = state;
    for (const e of events) {
      if (e.type === 'goal') {
        const momentum = currentState.momentum ?? { home: 0, away: 0 };
        currentState = { ...currentState, momentum: { ...momentum, [e.team]: MOMENTUM_ON_GOAL } };
      }
    }
    return currentState;
  }

  /** Injuries are consequences of the minute's events: risky involvements (challenges,
   *  sprints, aerial duels — see injury.ts) roll against the dedicated injury rng,
   *  fatigue-scaled. An injured player is forced off (the team plays short until
   *  substituted) and never returns. */
  private applyInjuries(state: MatchState, events: MatchEvent[]): MatchState {
    const already = new Set((state.matchInjuries ?? []).map(i => i.playerId));
    const injuries = rollInjuries(events, state, already, this.injuryRng);
    if (injuries.length === 0) { return state; }

    let currentState = state;
    for (const injury of injuries) {
      const player = currentState.currentPlayers[injury.team].find(p => p.id === injury.playerId);
      currentState = {
        ...currentState,
        currentPlayers: {
          ...currentState.currentPlayers,
          [injury.team]: currentState.currentPlayers[injury.team].filter(p => p.id !== injury.playerId),
        },
        matchInjuries: [...(currentState.matchInjuries ?? []), injury],
      };
      events.push({
        id: this.actionSelector.generateId(),
        type: 'injury',
        minute: currentState.minute,
        team: injury.team,
        playerId: injury.playerId,
        description: injuryDescription(player?.name ?? injury.playerId, injury),
        resultingState: currentState,
        metadata: { injuryType: injury.type, baseDuration: injury.baseDuration, cause: injury.cause },
      });
    }
    return currentState;
  }

  /** Advance the clock one minute and fire phase transitions (HT, 2nd half + possession
   *  swap, FT or extra time) with their announcement events. */
  private advancePhase(currentState: MatchState, events: MatchEvent[]): MatchState {
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

    return nextState;
  }

  simulate(): MatchResult {
    this.events = [];
    this.stats = new StatsAccumulator();
    this.currentState = this.createInitialState();

    while (!isTerminalPhase(this.currentState.phase)) {
      const { events, nextState } = this.simulateMinute(this.currentState);
      this.events.push(...events);
      this.currentState = nextState;
    }

    return {
      events: [...this.events],
      finalState: { ...this.currentState },
      statistics: this.stats.build(),
      injuries: injuriesBySide(this.currentState),
    };
  }

  /** Statistics accumulated so far — readable mid-match (live stat sheet, half-time). */
  getStatistics(): MatchStatistics {
    return this.stats.build();
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

}
