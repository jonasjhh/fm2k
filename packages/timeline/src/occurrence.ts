import type { GameDateTime } from './game-date-time.ts';

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
 * Typed state manager slots — add here as game domain state is defined.
 *
 * Planned slots:
 *   club?:     ClubManager     (src/club/club-manager.ts)
 *   season?:   SeasonManager   (src/season/season-manager.ts)
 *   transfer?: TransferManager (src/transfer/transfer-manager.ts)
 *
 * Note: these managers wire to TickEngine via LeagueManager.onMatchCompleted
 * rather than through OccurrenceContext — this keeps match simulation stateless.
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
