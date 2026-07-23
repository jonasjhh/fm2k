import type { Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';
import { DuelMatchSimulator } from './duel/duel-simulator.ts';
import { isTerminalPhase } from './types.ts';
import { withHomeAdvantage } from '../tactics/match-parameters.ts';
import { simulateShootout } from './penalty-shootout.ts';
import { injuriesBySide } from './injury.ts';
import { NEUTRAL_PARAMS } from '../tactics/match-parameters.ts';
import { deriveFieldedPositions, deriveCustomFieldedPositions, slotShapeToPlayers, slotOverridesToPlayers } from '../lineup/lineup.ts';
import type { MatchState, MatchEvent, MatchStatistics } from './types.ts';
import type { Team, Player, MatchOutcomeDecidedBy } from '../shared/types.ts';

export interface MatchOccurrenceConfig {
  readonly id: string
  readonly scheduledTime: GameDateTime
  readonly homeTeam: Team
  readonly awayTeam: Team
  /** Eager, already-resolved starting XI for whichever side isn't the human club (AI's
   *  best-fit XI, computed once at schedule time). Ignored for `playerTeamId`'s side when
   *  `getPlayerStarters` is supplied. */
  readonly homeStarters?: Player[]
  readonly awayStarters?: Player[]
  readonly eventsPerMinute?: number
  /** When set, identifies which side is the human club; `getPlayerStarters` (if present)
   *  resolves that side's XI lazily — at kickoff, and again each tick for substitution
   *  diffing — instead of using the eager `homeStarters`/`awayStarters` default. */
  readonly playerTeamId?: string
  readonly getPlayerStarters?: () => Player[]
  /** Knockout tie: play extra time and a penalty shootout to force a winner. */
  readonly knockout?: boolean
  /** Injectable RNG for the shootout (deterministic tests). */
  readonly rng?: () => number
}

export class MatchOccurrence implements Occurrence {
  readonly id: string;
  readonly scheduledTime: GameDateTime;
  readonly tickResolution = 'minute' as const;

  private simulator: DuelMatchSimulator | null = null;
  private matchState!: MatchState;
  /** Signature of the player team's tactics as last applied to the live state —
   *  cheap change detection so re-resolution only happens when something changed. */
  private lastTacticsSignature: string | null = null;
  private readonly playerTeamSide: 'home' | 'away' | null;
  private readonly getPlayerStarters?: () => Player[];
  private readonly homeStartersDefault?: Player[];
  private readonly awayStartersDefault?: Player[];
  private readonly knockout: boolean;
  private readonly rng: () => number;
  private readonly homeTeam: Team;
  private readonly awayTeam: Team;
  private readonly eventsPerMinute: number;

  constructor(config: MatchOccurrenceConfig) {
    this.id = config.id;
    this.scheduledTime = config.scheduledTime;
    this.getPlayerStarters = config.getPlayerStarters;
    this.homeStartersDefault = config.homeStarters;
    this.awayStartersDefault = config.awayStarters;
    this.knockout = config.knockout ?? false;
    this.rng = config.rng ?? Math.random;
    this.homeTeam = config.homeTeam;
    this.awayTeam = config.awayTeam;
    this.eventsPerMinute = config.eventsPerMinute ?? 12;

    if (config.playerTeamId) {
      this.playerTeamSide =
        config.homeTeam.id === config.playerTeamId ? 'home' :
          config.awayTeam.id === config.playerTeamId ? 'away' :
            null;
    } else {
      this.playerTeamSide = null;
    }
  }

  /** Resolve a side's starting XI: lazily from `getPlayerStarters` for the human club's
   *  side (fresh as of right now — kickoff, or a later tick for sub diffing), else the
   *  eager AI default computed when the match was scheduled. */
  private resolveStarters(side: 'home' | 'away'): Player[] {
    if (this.playerTeamSide === side && this.getPlayerStarters) {
      return this.getPlayerStarters();
    }
    const fallback = side === 'home' ? this.homeStartersDefault : this.awayStartersDefault;
    if (!fallback) {
      throw new Error(`MatchOccurrence: no starters resolved for ${side} side of match ${this.id}`);
    }
    return fallback;
  }

  /**
   * Build the simulator lazily, at the moment the match first needs it (kickoff).
   * This reads the home/away Team objects *as they are then*, and resolves each side's
   * starting XI fresh too, so a manager's pre-match changes to lineup/formation/tactics
   * take effect for that match.
   */
  private ensureStarted(): DuelMatchSimulator {
    if (!this.simulator) {
      this.simulator = new DuelMatchSimulator({
        matchDuration: 90,
        eventsPerMinute: this.eventsPerMinute,
        homeTeam: this.homeTeam,
        awayTeam: this.awayTeam,
        homeStarters: this.resolveStarters('home'),
        awayStarters: this.resolveStarters('away'),
        homeFitness: this.homeTeam.fitness,
        awayFitness: this.awayTeam.fitness,
        extraTimeIfDrawn: this.knockout,
        rng: this.rng,
      });
      this.matchState = this.simulator.getCurrentState();
      if (this.playerTeamSide) {
        this.lastTacticsSignature = this.tacticsSignature(this.playerTeam());
      }
    }
    return this.simulator;
  }

  private playerTeam(): Team {
    return this.playerTeamSide === 'home' ? this.homeTeam : this.awayTeam;
  }

  private tacticsSignature(team: Team): string {
    return JSON.stringify([team.tacticsParams ?? null, team.formation, team.shapes ?? null]);
  }

  /**
   * Mid-match tactic/formation changes for the human club. The session mirrors the
   * manager's live edits onto the Team object (tacticsParams/formation/shapes);
   * when that changed since it was last applied, rebuild the live state's params and
   * fielded positions for that side. Pure recomputation — no rng — so determinism is
   * untouched when nothing changed. AI sides deliberately never react mid-match.
   */
  private applyPendingTactics(): void {
    const side = this.playerTeamSide;
    if (!side || !this.getPlayerStarters) { return; }
    const team = this.playerTeam();
    const sig = this.tacticsSignature(team);
    if (sig === this.lastTacticsSignature) { return; }
    this.lastTacticsSignature = sig;

    const raw = team.tacticsParams ?? NEUTRAL_PARAMS;
    const params = side === 'home' ? withHomeAdvantage(raw) : raw;

    // Re-derive positions from the slot-ordered active lineup; keep the existing
    // assignment for any on-pitch player the new map doesn't cover (e.g. a substitute
    // not yet reflected in the shapes).
    const starters = this.getPlayerStarters();
    const overrides = slotOverridesToPlayers(team.roleOverrides, starters);
    const custom = team.shapes
      ? deriveCustomFieldedPositions(slotShapeToPlayers(team.shapes.defending, starters), overrides) : undefined;
    const basePositions = custom?.fieldedPositions ?? deriveFieldedPositions(starters, team.formation);
    const derived = overrides
      ? Object.fromEntries(Object.entries(basePositions).map(([id, pos]) => [id, overrides[id] ?? pos]))
      : basePositions;
    const fielded = { ...(this.matchState.fieldedPositions?.[side] ?? {}) };
    for (const p of this.matchState.currentPlayers[side]) {
      if (derived[p.id]) { fielded[p.id] = derived[p.id]; }
    }

    this.matchState = {
      ...this.matchState,
      params: {
        home: this.matchState.params?.home ?? NEUTRAL_PARAMS,
        away: this.matchState.params?.away ?? NEUTRAL_PARAMS,
        [side]: params,
      },
      fieldedPositions: {
        home: this.matchState.fieldedPositions?.home ?? {},
        away: this.matchState.fieldedPositions?.away ?? {},
        [side]: fielded,
      },
      fieldedGeometry: {
        home: this.matchState.fieldedGeometry?.home ?? {},
        away: this.matchState.fieldedGeometry?.away ?? {},
        [side]: custom?.fieldedGeometry ?? {},
      },
    };
  }

  onStart(_context: OccurrenceContext): OccurrenceEvent[] {
    this.ensureStarted();
    return [{
      id: `${this.id}-started`,
      eventType: 'match.started',
      occurrenceId: this.id,
      occurrenceType: 'match',
      timestamp: this.scheduledTime,
      payload: {
        homeTeamId: this.matchState.homeTeam.id,
        awayTeamId: this.matchState.awayTeam.id,
        homeTeam: this.matchState.homeTeam.name,
        awayTeam: this.matchState.awayTeam.name,
      },
    }];
  }

  onTick(now: GameDateTime, _context: OccurrenceContext): OccurrenceEvent[] {
    const simulator = this.ensureStarted();
    const subEvents = this.applyPendingSubstitutions(now);
    this.applyPendingTactics();
    const { events, nextState } = simulator.simulateMinute(this.matchState);
    this.matchState = nextState;
    return [...subEvents, ...events.map(e => this.toOccurrenceEvent(e, now))];
  }

  isComplete(_now: GameDateTime): boolean {
    this.ensureStarted();
    return isTerminalPhase(this.matchState.phase);
  }

  onComplete(_context: OccurrenceContext): OccurrenceEvent[] {
    this.ensureStarted();
    const { homeScore, awayScore, homeTeam, awayTeam, minute } = this.matchState;

    let decidedBy: MatchOutcomeDecidedBy = minute > 90 ? 'extra_time' : 'normal';
    let shootout: { home: number; away: number } | undefined;
    let winnerTeamId: string | undefined;

    if (this.knockout) {
      if (homeScore === awayScore) {
        const result = simulateShootout(
          this.matchState.currentPlayers.home, this.matchState.currentPlayers.away, this.rng);
        decidedBy = 'penalties';
        shootout = { home: result.home, away: result.away };
        winnerTeamId = result.winner === 'home' ? homeTeam.id : awayTeam.id;
      } else {
        winnerTeamId = homeScore > awayScore ? homeTeam.id : awayTeam.id;
      }
    }

    // Injuries happened live, during play (see injury.ts) — report them per side.
    const { home: homeInjuries, away: awayInjuries } = injuriesBySide(this.matchState);

    return [{
      id: `${this.id}-completed`,
      eventType: 'match.completed',
      occurrenceId: this.id,
      occurrenceType: 'match',
      timestamp: this.scheduledTime,
      payload: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeTeam: homeTeam.name,
        awayTeam: awayTeam.name,
        homeScore,
        awayScore,
        finalMinute: minute,
        decidedBy,
        statistics: this.getStatistics(),
        ...(shootout && { shootout }),
        ...(winnerTeamId && { winnerTeamId }),
        ...(this.matchState.energy && {
          homeEnergy: this.matchState.energy.home,
          awayEnergy: this.matchState.energy.away,
        }),
        ...(homeInjuries.length > 0 && { homeInjuries }),
        ...(awayInjuries.length > 0 && { awayInjuries }),
        bookings: this.matchState.bookings,
      },
    }];
  }

  getMatchState(): MatchState {
    this.ensureStarted();
    return this.matchState;
  }

  /** Statistics accumulated so far (live) or the full-match totals once complete. */
  getStatistics(): MatchStatistics {
    return this.ensureStarted().getStatistics();
  }

  private applyPendingSubstitutions(now: GameDateTime): OccurrenceEvent[] {
    if (!this.getPlayerStarters || !this.playerTeamSide) {return [];}

    const desired = this.getPlayerStarters();
    const current = this.matchState.currentPlayers[this.playerTeamSide];

    const currentIds = new Set(current.map(p => p.id));
    const desiredIds = new Set(desired.map(p => p.id));
    // A sent-off or injured player is gone from the pitch but may still occupy a lineup
    // slot in the club's state — never let the diff bring them back on.
    const sentOff = new Set(this.matchState.bookings.red.map(b => b.playerId));
    const injuredOff = new Set((this.matchState.matchInjuries ?? []).map(i => i.playerId));

    const playersOut = current.filter(p => !desiredIds.has(p.id));
    const playersIn = desired.filter(p => !currentIds.has(p.id) && !sentOff.has(p.id) && !injuredOff.has(p.id));

    if (playersIn.length === 0) {return [];}

    const side = this.playerTeamSide;
    const sideFielded = { ...(this.matchState.fieldedPositions?.[side] ?? {}) };
    // Slots vacated by players already off the pitch (injured — never red cards, whose
    // team stays a player short): a sub replacing an injured player inherits that slot.
    const offPitchVacated = Object.keys(sideFielded).filter(
      id => !desiredIds.has(id) && !currentIds.has(id) && injuredOff.has(id) && !sentOff.has(id),
    );
    playersIn.forEach((playerIn, i) => {
      const outgoingId = playersOut[i]?.id ?? offPitchVacated.shift();
      const slot = outgoingId ? sideFielded[outgoingId] : undefined;
      if (outgoingId) {delete sideFielded[outgoingId];}
      if (slot) {sideFielded[playerIn.id] = slot;}
    });

    this.matchState = {
      ...this.matchState,
      currentPlayers: {
        ...this.matchState.currentPlayers,
        [side]: [
          ...current.filter(p => desiredIds.has(p.id)),
          ...playersIn,
        ],
      },
      fieldedPositions: {
        home: this.matchState.fieldedPositions?.home ?? {},
        away: this.matchState.fieldedPositions?.away ?? {},
        [side]: sideFielded,
      },
    };

    return playersIn.map((playerIn, i) => {
      const playerOut = playersOut[i];
      return {
        id: `${this.id}-sub-${playerOut?.id ?? 'unknown'}-${playerIn.id}`,
        eventType: 'match.substitution_applied',
        occurrenceId: this.id,
        occurrenceType: 'match',
        timestamp: now,
        payload: {
          matchId: this.id,
          playerOutId: playerOut?.id ?? null,
          playerInId: playerIn.id,
          minute: this.matchState.minute,
          // Shaped like a match event so the UI ticker can animate it directly.
          team: side,
          description: playerOut
            ? `Substitution: ${playerIn.name} on for ${playerOut.name}`
            : `Substitution: ${playerIn.name} comes on`,
          homeScore: this.matchState.homeScore,
          awayScore: this.matchState.awayScore,
          phase: this.matchState.phase,
        },
      };
    });
  }

  private toOccurrenceEvent(matchEvent: MatchEvent, timestamp: GameDateTime): OccurrenceEvent {
    return {
      id: matchEvent.id,
      eventType: matchEvent.type,
      occurrenceId: this.id,
      occurrenceType: 'match',
      timestamp,
      payload: {
        minute: matchEvent.minute,
        team: matchEvent.team,
        playerId: matchEvent.playerId ?? null,
        description: matchEvent.description,
        homeScore: matchEvent.resultingState.homeScore,
        awayScore: matchEvent.resultingState.awayScore,
        phase: matchEvent.resultingState.phase,
      },
    };
  }
}
