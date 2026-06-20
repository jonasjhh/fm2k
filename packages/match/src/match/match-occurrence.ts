import type { Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';
import { MatchSimulator, isTerminalPhase } from './match-simulator.ts';
import { simulateShootout } from './penalty-shootout.ts';
import { generateInjuries } from './injury.ts';
import type { MatchState, MatchEvent } from './types.ts';
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

  private simulator: MatchSimulator | null = null;
  private matchState!: MatchState;
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
    this.eventsPerMinute = config.eventsPerMinute ?? 3;

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
  private ensureStarted(): MatchSimulator {
    if (!this.simulator) {
      this.simulator = new MatchSimulator({
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
    }
    return this.simulator;
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

    const energy = this.matchState.energy;
    const homeInjuries = generateInjuries(this.matchState.currentPlayers.home, energy?.home ?? {}, this.rng);
    const awayInjuries = generateInjuries(this.matchState.currentPlayers.away, energy?.away ?? {}, this.rng);

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
        ...(shootout && { shootout }),
        ...(winnerTeamId && { winnerTeamId }),
        ...(this.matchState.energy && {
          homeEnergy: this.matchState.energy.home,
          awayEnergy: this.matchState.energy.away,
        }),
        ...(homeInjuries.length > 0 && { homeInjuries }),
        ...(awayInjuries.length > 0 && { awayInjuries }),
      },
    }];
  }

  getMatchState(): MatchState {
    this.ensureStarted();
    return this.matchState;
  }

  private applyPendingSubstitutions(now: GameDateTime): OccurrenceEvent[] {
    if (!this.getPlayerStarters || !this.playerTeamSide) {return [];}

    const desired = this.getPlayerStarters();
    const current = this.matchState.currentPlayers[this.playerTeamSide];

    const currentIds = new Set(current.map(p => p.id));
    const desiredIds = new Set(desired.map(p => p.id));

    const playersOut = current.filter(p => !desiredIds.has(p.id));
    const playersIn = desired.filter(p => !currentIds.has(p.id));

    if (playersIn.length === 0) {return [];}

    const side = this.playerTeamSide;
    const sideFielded = { ...(this.matchState.fieldedPositions?.[side] ?? {}) };
    playersIn.forEach((playerIn, i) => {
      const outgoingId = playersOut[i]?.id;
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

    return playersIn.map((playerIn, i) => ({
      id: `${this.id}-sub-${playersOut[i]?.id ?? 'unknown'}-${playerIn.id}`,
      eventType: 'match.substitution_applied',
      occurrenceId: this.id,
      occurrenceType: 'match',
      timestamp: now,
      payload: {
        matchId: this.id,
        playerOutId: playersOut[i]?.id ?? null,
        playerInId: playerIn.id,
        minute: this.matchState.minute,
      },
    }));
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
