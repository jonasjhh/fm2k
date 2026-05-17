import type { Occurrence, OccurrenceContext, OccurrenceEvent } from '../timeline/occurrence.js';
import type { GameDateTime } from '../timeline/game-date-time.js';
import { MatchSimulator } from './match-simulator.js';
import type { MatchState, MatchEvent } from './types.js';
import type { Team } from '../shared/types.js';

export interface MatchOccurrenceConfig {
  readonly id: string
  readonly scheduledTime: GameDateTime
  readonly homeTeam: Team
  readonly awayTeam: Team
  readonly eventsPerMinute?: number
}

export class MatchOccurrence implements Occurrence {
  readonly id: string
  readonly scheduledTime: GameDateTime
  readonly tickResolution = 'minute' as const

  private readonly simulator: MatchSimulator
  private matchState: MatchState

  constructor(config: MatchOccurrenceConfig) {
    this.id = config.id
    this.scheduledTime = config.scheduledTime
    this.simulator = new MatchSimulator({
      matchDuration: 90,
      eventsPerMinute: config.eventsPerMinute ?? 3,
      homeTeam: config.homeTeam,
      awayTeam: config.awayTeam,
    })
    this.matchState = this.simulator.getCurrentState()
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
    }]
  }

  onTick(now: GameDateTime, _context: OccurrenceContext): OccurrenceEvent[] {
    const { events, nextState } = this.simulator.simulateMinute(this.matchState)
    this.matchState = nextState
    return events.map(e => this.toOccurrenceEvent(e, now))
  }

  isComplete(_now: GameDateTime): boolean {
    return this.matchState.phase === 'full_time'
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
    }]
  }

  getMatchState(): MatchState {
    return this.matchState
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
    }
  }
}
