import type { GameDateTime } from './game-date-time.js'

export type TickResolution = 'day' | 'hour' | 'minute'

export interface OccurrenceEvent {
  readonly id: string
  readonly eventType: string
  readonly occurrenceId: string
  readonly occurrenceType: string
  readonly timestamp: GameDateTime
  readonly payload: Readonly<Record<string, unknown>>
}

/**
 * Typed state manager slots are added here as game domain state is defined.
 * Example: league?: StateManager<LeagueState>; club?: StateManager<ClubState>
 * Import StateManager from '../state/state-manager.js' when adding slots.
 */
export interface OccurrenceContext {}

export interface Occurrence {
  readonly id: string
  readonly scheduledTime: GameDateTime
  readonly tickResolution: TickResolution

  onStart(context: OccurrenceContext): OccurrenceEvent[]
  onTick(now: GameDateTime, context: OccurrenceContext): OccurrenceEvent[]
  isComplete(now: GameDateTime): boolean
  onComplete(context: OccurrenceContext): OccurrenceEvent[]
}
