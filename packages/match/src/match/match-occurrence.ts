import type { Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';
import { MatchSimulator, isTerminalPhase } from './match-simulator.ts';
import { simulateShootout } from './penalty-shootout.ts';
import { generateInjuries } from './injury.ts';
import type { MatchState, MatchEvent } from './types.ts';
import type { Team, Player } from '../shared/types.ts';

export interface MatchOccurrenceConfig {
  readonly id: string
  readonly scheduledTime: GameDateTime
  readonly homeTeam: Team
  readonly awayTeam: Team
  readonly eventsPerMinute?: number
  // When provided, lineup diffs are applied each tick and emitted as match.substitution_applied
  readonly playerTeamId?: string
  readonly getPlayerTeamLineup?: () => Player[]
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
  private readonly getPlayerTeamLineup?: () => Player[];
  private readonly knockout: boolean;
  private readonly rng: () => number;
  private readonly homeTeam: Team;
  private readonly awayTeam: Team;
  private readonly eventsPerMinute: number;

  constructor(config: MatchOccurrenceConfig) {
    this.id = config.id;
    this.scheduledTime = config.scheduledTime;
    this.getPlayerTeamLineup = config.getPlayerTeamLineup;
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

  /**
   * Build the simulator lazily, at the moment the match first needs it (kickoff).
   * This reads the home/away Team objects *as they are then*, so a manager's
   * pre-match changes to lineup/formation/tactics take effect for that match.
   */
  private ensureStarted(): MatchSimulator {
    if (!this.simulator) {
      this.simulator = new MatchSimulator({
        matchDuration: 90,
        eventsPerMinute: this.eventsPerMinute,
        homeTeam: this.homeTeam,
        awayTeam: this.awayTeam,
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

    let decidedBy: 'normal' | 'extra_time' | 'penalties' = minute > 90 ? 'extra_time' : 'normal';
    let shootout: { home: number; away: number } | undefined;
    let winnerTeamId: string | undefined;

    if (this.knockout) {
      if (homeScore === awayScore) {
        const result = simulateShootout(homeTeam, awayTeam, this.rng);
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
    if (!this.getPlayerTeamLineup || !this.playerTeamSide) {return [];}

    const desired = this.getPlayerTeamLineup();
    const current = this.matchState.currentPlayers[this.playerTeamSide];

    const currentIds = new Set(current.map(p => p.id));
    const desiredIds = new Set(desired.map(p => p.id));

    const playersOut = current.filter(p => !desiredIds.has(p.id));
    const playersIn = desired.filter(p => !currentIds.has(p.id));

    if (playersIn.length === 0) {return [];}

    this.matchState = {
      ...this.matchState,
      currentPlayers: {
        ...this.matchState.currentPlayers,
        [this.playerTeamSide]: [
          ...current.filter(p => desiredIds.has(p.id)),
          ...playersIn,
        ],
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
