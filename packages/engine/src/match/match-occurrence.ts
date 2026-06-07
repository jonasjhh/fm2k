import type { Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';
import type { GameDateTime } from '@fm2k/timeline';
import { MatchSimulator } from './match-simulator.ts';
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
}

export class MatchOccurrence implements Occurrence {
  readonly id: string;
  readonly scheduledTime: GameDateTime;
  readonly tickResolution = 'minute' as const;

  private readonly simulator: MatchSimulator;
  private matchState: MatchState;
  private readonly playerTeamSide: 'home' | 'away' | null;
  private readonly getPlayerTeamLineup?: () => Player[];

  constructor(config: MatchOccurrenceConfig) {
    this.id = config.id;
    this.scheduledTime = config.scheduledTime;
    this.getPlayerTeamLineup = config.getPlayerTeamLineup;
    this.simulator = new MatchSimulator({
      matchDuration: 90,
      eventsPerMinute: config.eventsPerMinute ?? 3,
      homeTeam: config.homeTeam,
      awayTeam: config.awayTeam,
    });
    this.matchState = this.simulator.getCurrentState();

    if (config.playerTeamId) {
      this.playerTeamSide =
        config.homeTeam.id === config.playerTeamId ? 'home' :
          config.awayTeam.id === config.playerTeamId ? 'away' :
            null;
    } else {
      this.playerTeamSide = null;
    }
  }

  onStart(_context: OccurrenceContext): OccurrenceEvent[] {
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
    const subEvents = this.applyPendingSubstitutions(now);
    const { events, nextState } = this.simulator.simulateMinute(this.matchState);
    this.matchState = nextState;
    return [...subEvents, ...events.map(e => this.toOccurrenceEvent(e, now))];
  }

  isComplete(_now: GameDateTime): boolean {
    return this.matchState.phase === 'full_time';
  }

  onComplete(_context: OccurrenceContext): OccurrenceEvent[] {
    return [{
      id: `${this.id}-completed`,
      eventType: 'match.completed',
      occurrenceId: this.id,
      occurrenceType: 'match',
      timestamp: this.scheduledTime,
      payload: {
        homeTeamId: this.matchState.homeTeam.id,
        awayTeamId: this.matchState.awayTeam.id,
        homeTeam: this.matchState.homeTeam.name,
        awayTeam: this.matchState.awayTeam.name,
        homeScore: this.matchState.homeScore,
        awayScore: this.matchState.awayScore,
        finalMinute: this.matchState.minute,
      },
    }];
  }

  getMatchState(): MatchState {
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
