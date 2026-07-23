// The v2 match simulator (REWORK_01.md): MatchSimulator's exact public surface, with
// the action-selector pipeline replaced by the duel-engine flow — live 22-player
// positions travelling toward dual-shape anchors, an explicit ball, and the §4
// situation chains. Infrastructure (fatigue, injuries, stats, rng discipline, the
// minute/phase skeleton) is shared with v1's design unchanged.

import { isTerminalPhase, type MatchConfig, type MatchState, type MatchEvent, type MatchResult, type MatchStatistics, type EventType, type BallPosition } from '../types.ts';
import type { Player, Team, PlayerShapes } from '../../shared/types.ts';
import { StatsAccumulator } from '../stats.ts';
import { NEUTRAL_PARAMS, withHomeAdvantage } from '../../tactics/match-parameters.ts';
import { perMinuteDrain, applyFatigue } from '../fatigue.ts';
import { rollInjuries, injuryDescription, injuriesBySide } from '../injury.ts';
import { mulberry32, drawMatchForm, type MatchForm } from '../rng.ts';
import {
  deriveFieldedPositions, deriveCustomFieldedPositions, seedShapesFromFormation,
  slotShapeToPlayers, slotShapesToPlayers, slotOverridesToPlayers,
} from '../../lineup/lineup.ts';
import { type XY, type Side, targetsForShape, phaseOf, anchorXY, toAbsolute, BAND_Y, nearestTo } from './field.ts';
import { advancePositions, travelled } from './movement.ts';
import {
  lineShift, applyWidth, applyCompactness, applyBallSideShift, applyPress, transitionUrgency,
} from './tactical-motion.ts';
import { flowTick, type BallState, type FlowTeam, type FlowEvent } from './flow.ts';

function applyOverrides<T extends Record<string, string>>(
  positions: T,
  overrides: Record<string, string> | undefined,
): T {
  if (!overrides || Object.keys(overrides).length === 0) { return positions; }
  const result = { ...positions };
  for (const [id, role] of Object.entries(overrides)) {
    if (id in result) { (result as Record<string, string>)[id] = role; }
  }
  return result;
}

// Same momentum model as v1 (a goal lifts the scorers, decaying per minute).
const MOMENTUM_ON_GOAL = 35;
const MOMENTUM_DECAY = 0.72;

function seedEnergy(players: Player[], fitness?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of players) { out[p.id] = fitness?.[p.id] ?? 100; }
  return out;
}

function fatiguedView(players: Player[], energy: Record<string, number>): Player[] {
  return players.map(p => ({ ...p, attributes: applyFatigue(p.attributes, energy[p.id] ?? 100) }));
}

/** MatchState.ballPosition zone from an absolute ball point (home attacks toward y=1,
 *  so high y is the away side's defensive end — the "away" zones). */
export function toBallPosition(at: XY): BallPosition {
  const zone = at.y < 0.17 ? 'home_box'
    : at.y < 0.4 ? 'home_third'
      : at.y <= 0.6 ? 'middle_third'
        : at.y <= 0.83 ? 'away_third' : 'away_box';
  const side = at.x < 0.33 ? 'left' : at.x > 0.67 ? 'right' : 'center';
  return { zone, side };
}

export class DuelMatchSimulator {
  private readonly config: MatchConfig;
  private readonly rng: () => number;
  private events: MatchEvent[] = [];
  private currentState!: MatchState;
  private stats = new StatsAccumulator();
  private injuryRng!: () => number;
  private form!: { home: MatchForm; away: MatchForm };
  private eventSeq = 0;

  // v2-only live state (ephemeral; never on MatchState, never persisted).
  private positions!: { home: Record<string, XY>; away: Record<string, XY> };
  private shapes!: { home: PlayerShapes; away: PlayerShapes };
  // Distance each player travelled last minute — charged to this minute's fatigue drain.
  private lastTravel!: { home: Record<string, number>; away: Record<string, number> };
  private ball!: BallState;

  constructor(config: MatchConfig) {
    this.config = config;
    this.rng = config.rng ?? Math.random;
    this.currentState = this.createInitialState();
  }

  private generateId(): string {
    return `duel-event-${++this.eventSeq}`;
  }

  /** A side's dual shapes, mapped to the player-keyed internal view: the team's own
   *  slot-keyed shape when set, else its formation preset (AI teams never author shapes),
   *  converted via the slot-ordered starters (GK at 0). */
  private resolveShapes(team: Team, starters: Player[]): PlayerShapes {
    return slotShapesToPlayers(team.shapes ?? seedShapesFromFormation(team.formation), starters);
  }

  /** Everyone starts the match at their defending anchor (kickoff shape). */
  private initialPositions(shapes: PlayerShapes, starters: Player[], side: Side): Record<string, XY> {
    const out: Record<string, XY> = {};
    const gkId = starters[0]?.id;
    for (const p of starters) {
      const geometry = shapes.defending[p.id];
      out[p.id] = geometry
        ? toAbsolute(anchorXY(geometry), side)
        : toAbsolute({ x: 0.5, y: p.id === gkId ? BAND_Y.GK : 0.5 }, side);
    }
    return out;
  }

  private createInitialState(): MatchState {
    // Injury sub-stream from exactly ONE main draw (v1's rng discipline).
    this.injuryRng = this.config.injuryRng ?? mulberry32(Math.floor(this.rng() * 2 ** 31));
    // Per-match form: injected verbatim (real gameplay / TASK_17), else drawn from the
    // main stream so standalone & harness sims still get final-third variance.
    this.form = {
      home: this.config.homeForm ?? drawMatchForm(this.rng),
      away: this.config.awayForm ?? drawMatchForm(this.rng),
    };
    const homePlayers = this.config.homeStarters;
    const awayPlayers = this.config.awayStarters;
    for (const p of homePlayers) { this.stats.seedPlayer(p.id); }
    for (const p of awayPlayers) { this.stats.seedPlayer(p.id); }

    this.shapes = {
      home: this.resolveShapes(this.config.homeTeam, homePlayers),
      away: this.resolveShapes(this.config.awayTeam, awayPlayers),
    };
    this.positions = {
      home: this.initialPositions(this.shapes.home, homePlayers, 'home'),
      away: this.initialPositions(this.shapes.away, awayPlayers, 'away'),
    };
    this.lastTravel = { home: {}, away: {} };

    // Map the stored slot-keyed shape/overrides to player-keyed via the slot-ordered starters.
    const homeOverrides = slotOverridesToPlayers(this.config.homeTeam.roleOverrides, homePlayers);
    const awayOverrides = slotOverridesToPlayers(this.config.awayTeam.roleOverrides, awayPlayers);
    const homeCustom = this.config.homeTeam.shapes?.defending
      ? deriveCustomFieldedPositions(slotShapeToPlayers(this.config.homeTeam.shapes.defending, homePlayers), homeOverrides) : undefined;
    const awayCustom = this.config.awayTeam.shapes?.defending
      ? deriveCustomFieldedPositions(slotShapeToPlayers(this.config.awayTeam.shapes.defending, awayPlayers), awayOverrides) : undefined;

    const possession: Side = this.rng() < 0.5 ? 'home' : 'away';
    this.ball = this.kickoffBall(possession, homePlayers, awayPlayers);

    return {
      minute: 0,
      homeScore: 0,
      awayScore: 0,
      possession,
      ballPosition: { zone: 'middle_third', side: 'center' },
      phase: 'first_half',
      homeTeam: { ...this.config.homeTeam },
      awayTeam: { ...this.config.awayTeam },
      currentPlayers: { home: homePlayers, away: awayPlayers },
      fieldedPositions: {
        home: applyOverrides(homeCustom?.fieldedPositions ?? deriveFieldedPositions(homePlayers, this.config.homeTeam.formation), homeOverrides),
        away: applyOverrides(awayCustom?.fieldedPositions ?? deriveFieldedPositions(awayPlayers, this.config.awayTeam.formation), awayOverrides),
      },
      params: {
        home: withHomeAdvantage(this.config.homeParams ?? this.config.homeTeam.tacticsParams ?? NEUTRAL_PARAMS),
        away: this.config.awayParams ?? this.config.awayTeam.tacticsParams ?? NEUTRAL_PARAMS,
      },
      energy: {
        home: seedEnergy(homePlayers, this.config.homeFitness),
        away: seedEnergy(awayPlayers, this.config.awayFitness),
      },
      momentum: { home: 0, away: 0 },
      bookings: { yellow: [], red: [] },
    };
  }

  /** Kickoff possession: the most central outfielder of the side carries. */
  private kickoffBall(side: Side, home: Player[], away: Player[]): BallState {
    const players = side === 'home' ? home : away;
    const gkId = players[0]?.id;
    const positions = this.positions[side];
    const carrierId = nearestTo({ x: 0.5, y: 0.5 }, positions, gkId ? new Set([gkId]) : undefined)[0]
      ?? gkId ?? players[0]?.id ?? '';
    return { mode: 'carried', side, carrierId };
  }

  /** The current GK on the pitch for a side: fielded at GK, else the best Keeping. */
  private gkIdOf(state: MatchState, side: Side): string | null {
    const players = state.currentPlayers[side];
    const fielded = state.fieldedPositions?.[side];
    const byFielded = players.find(p => fielded?.[p.id] === 'GK');
    if (byFielded) { return byFielded.id; }
    const byPosition = players.find(p => p.position === 'GK');
    if (byPosition) { return byPosition.id; }
    let best: Player | null = null;
    for (const p of players) {
      if (!best || p.attributes.goalkeeping > best.attributes.goalkeeping) { best = p; }
    }
    return best?.id ?? null;
  }

  simulateMinute(state: MatchState): { events: MatchEvent[]; nextState: MatchState } {
    const events: MatchEvent[] = [];

    let currentState = this.beginMinute(state);
    this.syncPositions(currentState);
    this.movePlayers(currentState);
    currentState = this.runFlow(currentState, events);
    currentState = this.restoreRosters(state, currentState);
    currentState = this.applyGoalMomentum(currentState, events);
    currentState = this.applyInjuries(currentState, events);
    const nextState = this.advancePhase(currentState, events);

    this.stats.record(events);
    return { events, nextState };
  }

  /** Energy drain + momentum decay + the fatigued roster view (v1's beginMinute). */
  private beginMinute(state: MatchState): MatchState {
    const energy = {
      home: { ...(state.energy?.home ?? {}) },
      away: { ...(state.energy?.away ?? {}) },
    };
    (['home', 'away'] as const).forEach(side => {
      const team = side === 'home' ? state.homeTeam : state.awayTeam;
      const params = state.params?.[side] ?? NEUTRAL_PARAMS;
      for (const p of state.currentPlayers[side]) {
        const cur = energy[side][p.id] ?? 100;
        const moved = this.lastTravel[side]?.[p.id] ?? 0;
        energy[side][p.id] = Math.max(0, cur - perMinuteDrain(p, team.formation, params, moved));
      }
    });
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

  /** Keep the live position map in step with the roster: drop players who left the
   *  pitch, drop a substituted-on player in at their defending anchor. */
  private syncPositions(state: MatchState): void {
    (['home', 'away'] as const).forEach(side => {
      const onPitch = new Set(state.currentPlayers[side].map(p => p.id));
      for (const id of Object.keys(this.positions[side])) {
        if (!onPitch.has(id)) { delete this.positions[side][id]; }
      }
      const gkId = this.gkIdOf(state, side);
      for (const p of state.currentPlayers[side]) {
        if (this.positions[side][p.id]) { continue; }
        const geometry = this.shapes[side].defending[p.id];
        this.positions[side][p.id] = geometry
          ? toAbsolute(anchorXY(geometry), side)
          : toAbsolute({ x: 0.5, y: p.id === gkId ? BAND_Y.GK : 0.5 }, side);
      }
    });
  }

  /** One minute of travel toward the current-phase anchors (§5), with the tactical
   *  sliders applied mechanically to the targets (Step 5): line height shifts the
   *  defending shape, press pulls nearby defenders toward the ball, compactness
   *  narrows the block, width stretches the attacking shape, transition speed is
   *  urgency into attack. A substitute covering a shape-less slot holds position
   *  (advancePositions' targetless rule). */
  private movePlayers(state: MatchState): void {
    const ball = this.ballAt();
    const onPitch = [...state.currentPlayers.home, ...state.currentPlayers.away];
    const refSpeed = onPitch.length > 0
      ? onPitch.reduce((s, p) => s + p.attributes.speed, 0) / onPitch.length
      : 50;
    (['home', 'away'] as const).forEach(side => {
      const phase = phaseOf(side, state.possession);
      const gkId = this.gkIdOf(state, side);
      const params = state.params?.[side] ?? NEUTRAL_PARAMS;
      const shift = phase === 'defending' ? lineShift(params.spaceLeftBehind) : 0;
      let targets = targetsForShape(this.shapes[side][phase], gkId, side, shift);
      let minutes = 1;
      if (phase === 'attacking') {
        targets = applyWidth(targets, params.buildUpWidth, gkId);
        minutes = transitionUrgency(params.transitionSpeed);
      } else {
        targets = applyCompactness(targets, params.defensiveCompactness, gkId);
        targets = applyBallSideShift(targets, ball, side, gkId);
        targets = applyPress(targets, params.pressIntensity, ball, gkId);
      }
      const prev = this.positions[side];
      const next = advancePositions(
        prev, targets, state.currentPlayers[side], state.energy?.[side] ?? {}, minutes, refSpeed,
      );
      this.lastTravel[side] = travelled(prev, next);
      this.positions[side] = next;
    });
  }

  /** Run this minute's flow ticks. Tempo scales the count exactly like v1 (neutral 50
   *  → multiplier 1). Each tick's FlowEvents are wrapped into full MatchEvents, and
   *  goals/cards mutate the working state. */
  private runFlow(state: MatchState, events: MatchEvent[]): MatchState {
    let currentState = state;
    const tempo = currentState.params?.[currentState.possession]?.tempo ?? 50;
    const tempoMult = 0.7 + (tempo / 100) * 0.6;
    const count = Math.floor(this.rng() * this.config.eventsPerMinute * tempoMult) + 1;

    for (let i = 0; i < count; i++) {
      const homeView = this.flowTeam(currentState, 'home');
      const awayView = this.flowTeam(currentState, 'away');
      const result = flowTick(homeView, awayView, this.ball, this.rng);
      this.ball = result.ball;

      for (const fe of result.events) {
        currentState = this.applyFlowEvent(currentState, fe, events);
        if (isTerminalPhase(currentState.phase)) { return currentState; }
      }
      currentState = this.postTickState(currentState, result.goal);
    }
    return currentState;
  }

  private flowTeam(state: MatchState, side: Side): FlowTeam {
    return {
      side,
      players: state.currentPlayers[side],
      positions: this.positions[side],
      params: state.params?.[side] ?? NEUTRAL_PARAMS,
      momentum: state.momentum?.[side] ?? 0,
      gkId: this.gkIdOf(state, side),
      fieldedPositions: state.fieldedPositions?.[side],
      bookedPlayers: new Set(state.bookings.yellow.filter(b => b.team === side).map(b => b.playerId)),
      form: this.form[side],
    };
  }

  /** Wrap one FlowEvent into a MatchEvent, folding its consequences (goal, bookings,
   *  sending-off, second yellow) into the working state. */
  private applyFlowEvent(state: MatchState, fe: FlowEvent, events: MatchEvent[]): MatchState {
    let next = state;
    let type: EventType = fe.type;
    let description = fe.description;

    if (fe.type === 'goal') {
      next = {
        ...next,
        homeScore: next.homeScore + (fe.team === 'home' ? 1 : 0),
        awayScore: next.awayScore + (fe.team === 'away' ? 1 : 0),
      };
    }

    if (fe.type === 'yellow_card' && fe.playerId) {
      const alreadyBooked = next.bookings.yellow.some(b => b.playerId === fe.playerId);
      if (alreadyBooked) {
        type = 'red_card';
        description = `${description} — a second yellow! Off he goes`;
      } else {
        next = {
          ...next,
          bookings: {
            ...next.bookings,
            yellow: [...next.bookings.yellow, { playerId: fe.playerId, team: fe.team, minute: next.minute }],
          },
        };
      }
    }

    if (type === 'red_card' && fe.playerId) {
      next = {
        ...next,
        bookings: {
          ...next.bookings,
          red: [...next.bookings.red, { playerId: fe.playerId, team: fe.team, minute: next.minute }],
        },
        currentPlayers: {
          ...next.currentPlayers,
          [fe.team]: next.currentPlayers[fe.team].filter(p => p.id !== fe.playerId),
        },
      };
      delete this.positions[fe.team][fe.playerId];
    }

    next = { ...next, ballPosition: toBallPosition(this.ballAt()) };
    if (this.ball.mode === 'carried') { next = { ...next, possession: this.ball.side }; }

    events.push({
      id: this.generateId(),
      type,
      minute: next.minute,
      team: fe.team,
      playerId: fe.playerId,
      description,
      resultingState: next,
      ...(fe.metadata ? { metadata: fe.metadata } : {}),
    });
    return next;
  }

  private ballAt(): XY {
    if (this.ball.mode === 'free') { return this.ball.at; }
    return this.positions[this.ball.side][this.ball.carrierId] ?? { x: 0.5, y: 0.5 };
  }

  /** After a chain: possession follows the ball; nothing else to fold in (the goal
   *  momentum lift happens once per minute over the collected events, as in v1). */
  private postTickState(state: MatchState, _goal?: Side): MatchState {
    const possession = this.ball.mode === 'carried' ? this.ball.side : state.possession;
    return { ...state, possession, ballPosition: toBallPosition(this.ballAt()) };
  }

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
      delete this.positions[injury.team][injury.playerId];
      events.push({
        id: this.generateId(),
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

  /** v1's phase skeleton verbatim: HT@45, second half@46 (+possession swap), FT@90 or
   *  extra time, ET half@105/106, ET full@120. */
  private advancePhase(currentState: MatchState, events: MatchEvent[]): MatchState {
    const nextMinute = currentState.minute + 1;
    let nextState: MatchState = { ...currentState, minute: nextMinute };

    const restart = (possession: Side): void => {
      this.ball = this.kickoffBall(possession, nextState.currentPlayers.home, nextState.currentPlayers.away);
    };

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
      restart(newPossession);
      events.push(this.createPhaseEvent('kickoff', nextState, 'Second Half begins'));
    } else if (nextMinute === 90 && currentState.phase === 'second_half') {
      if (this.config.extraTimeIfDrawn && currentState.homeScore === currentState.awayScore) {
        nextState = { ...nextState, phase: 'extra_time_first', ballPosition: { zone: 'middle_third', side: 'center' } };
        restart(nextState.possession);
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
      restart(newPossession);
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
    // Re-initialize only when this instance already simulated something: a fresh
    // instance keeps its constructor-built state, so the one-shot path consumes the
    // exact same rng stream as the tick-by-tick path (byte-identical matches).
    if (this.events.length > 0 || this.currentState.minute > 0) {
      this.stats = new StatsAccumulator();
      this.eventSeq = 0;
      this.currentState = this.createInitialState();
    }
    this.events = [];

    while (!isTerminalPhase(this.currentState.phase)) {
      const { events, nextState } = this.simulateMinute(this.currentState);
      this.events.push(...events);
      this.currentState = nextState;
    }

    for (const p of this.currentState.currentPlayers.home) { this.stats.seedPlayer(p.id); }
    for (const p of this.currentState.currentPlayers.away) { this.stats.seedPlayer(p.id); }

    return {
      events: [...this.events],
      finalState: { ...this.currentState },
      statistics: this.stats.build(),
      injuries: injuriesBySide(this.currentState),
    };
  }

  getStatistics(): MatchStatistics {
    for (const p of this.currentState.currentPlayers.home) { this.stats.seedPlayer(p.id); }
    for (const p of this.currentState.currentPlayers.away) { this.stats.seedPlayer(p.id); }
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
      id: this.generateId(),
      type,
      minute: state.minute,
      team: 'home',
      description,
      resultingState: { ...state },
    };
  }
}
