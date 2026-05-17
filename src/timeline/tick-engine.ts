import type { Occurrence, OccurrenceContext, OccurrenceEvent, TickResolution } from './occurrence.js'
import type { GameDateTime } from './game-date-time.js'
import { addMinutes, addHours, addDays, compareGameDateTime, isBefore, isAfter } from './game-date-time.js'
import { EventLog } from './event-log.js'

export interface TickResult {
  readonly previousTime: GameDateTime
  readonly currentTime: GameDateTime
  readonly events: readonly OccurrenceEvent[]
  readonly started: readonly string[]
  readonly completed: readonly string[]
}

export interface TickEngineConfig {
  readonly startTime: GameDateTime
  readonly eventLog: EventLog
  readonly context?: OccurrenceContext
  readonly onEvents?: (events: readonly OccurrenceEvent[]) => Promise<void>
}

const RESOLUTION_ORDER: TickResolution[] = ['minute', 'hour', 'day']

export class TickEngine {
  private readonly queue: Occurrence[] = []
  private readonly active = new Map<string, Occurrence>()
  private currentTime: GameDateTime
  private readonly eventLog: EventLog
  private readonly context: OccurrenceContext
  private readonly onEvents?: (events: readonly OccurrenceEvent[]) => Promise<void>

  constructor(config: TickEngineConfig) {
    this.currentTime = config.startTime
    this.eventLog = config.eventLog
    this.context = config.context ?? {}
    this.onEvents = config.onEvents
  }

  schedule(occurrence: Occurrence): void {
    if (this.active.has(occurrence.id) || this.queue.some(o => o.id === occurrence.id)) {
      throw new Error(`Occurrence with id '${occurrence.id}' is already scheduled or active`)
    }
    let lo = 0, hi = this.queue.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (compareGameDateTime(this.queue[mid].scheduledTime, occurrence.scheduledTime) <= 0) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    this.queue.splice(lo, 0, occurrence)
  }

  hasNext(): boolean {
    return this.active.size > 0 || this.queue.length > 0
  }

  getCurrentTime(): GameDateTime {
    return this.currentTime
  }

  getScheduledOccurrences(): readonly Occurrence[] {
    return this.queue
  }

  getActiveOccurrences(): readonly Occurrence[] {
    return [...this.active.values()]
  }

  peekNextTickTime(): GameDateTime | null {
    if (!this.hasNext()) return null

    if (this.active.size > 0) {
      const advanced = this.advanceByResolution(this.currentTime, this.minResolution())
      if (this.queue.length > 0 && isBefore(this.queue[0].scheduledTime, advanced)) {
        return this.queue[0].scheduledTime
      }
      return advanced
    }

    const scheduled = this.queue[0].scheduledTime
    return isAfter(scheduled, this.currentTime) ? scheduled : this.currentTime
  }

  async tickToNext(): Promise<TickResult | null> {
    if (!this.hasNext()) return null

    const previousTime = this.currentTime
    const allEvents: OccurrenceEvent[] = []
    const started: string[] = []
    const completed: string[] = []

    if (this.active.size > 0) {
      const advanced = this.advanceByResolution(this.currentTime, this.minResolution())
      this.currentTime =
        this.queue.length > 0 && isBefore(this.queue[0].scheduledTime, advanced)
          ? this.queue[0].scheduledTime
          : advanced
    } else {
      const scheduled = this.queue[0].scheduledTime
      this.currentTime = isAfter(scheduled, this.currentTime) ? scheduled : this.currentTime
    }

    while (
      this.queue.length > 0 &&
      compareGameDateTime(this.queue[0].scheduledTime, this.currentTime) <= 0
    ) {
      const occurrence = this.queue.shift()!
      this.active.set(occurrence.id, occurrence)
      started.push(occurrence.id)
      allEvents.push(...occurrence.onStart(this.context))
    }

    for (const occurrence of this.active.values()) {
      allEvents.push(...occurrence.onTick(this.currentTime, this.context))
    }

    const toComplete = [...this.active.values()].filter(occ => occ.isComplete(this.currentTime))
    for (const occurrence of toComplete) {
      completed.push(occurrence.id)
      allEvents.push(...occurrence.onComplete(this.context))
      this.active.delete(occurrence.id)
    }

    for (const event of allEvents) {
      this.eventLog.append(event)
    }

    if (this.onEvents !== undefined && allEvents.length > 0) {
      await this.onEvents(allEvents)
    }

    return { previousTime, currentTime: this.currentTime, events: allEvents, started, completed }
  }

  async tickTo(target: GameDateTime): Promise<TickResult[]> {
    const results: TickResult[] = []
    while (isBefore(this.currentTime, target)) {
      if (!this.hasNext()) {
        this.currentTime = target
        break
      }
      const next = this.peekNextTickTime()!
      if (isAfter(next, target)) {
        this.currentTime = target
        break
      }
      results.push((await this.tickToNext())!)
    }
    return results
  }

  async tickBy(amount: number, unit: TickResolution): Promise<TickResult[]> {
    if (unit === 'minute') return this.tickTo(addMinutes(this.currentTime, amount))
    if (unit === 'hour') return this.tickTo(addHours(this.currentTime, amount))
    return this.tickTo(addDays(this.currentTime, amount))
  }

  private minResolution(): TickResolution {
    for (const res of RESOLUTION_ORDER) {
      for (const occ of this.active.values()) {
        if (occ.tickResolution === res) return res
      }
    }
    throw new Error('active occurrence has unknown tickResolution')
  }

  private advanceByResolution(time: GameDateTime, resolution: TickResolution): GameDateTime {
    if (resolution === 'minute') return addMinutes(time, 1)
    if (resolution === 'hour') return addHours(time, 1)
    return addDays(time, 1)
  }
}
