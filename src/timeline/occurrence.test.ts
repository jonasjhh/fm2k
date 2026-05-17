import { createGameDateTime } from './game-date-time.js'
import type { Occurrence, OccurrenceContext, OccurrenceEvent, TickResolution } from './occurrence.js'
import type { GameDateTime } from './game-date-time.js'

class StubOccurrence implements Occurrence {
  readonly id = 'stub-occ-1'
  readonly scheduledTime = createGameDateTime(2025, 8, 15, 14, 0)
  readonly tickResolution: TickResolution = 'minute'
  readonly occurrenceType = 'stub'

  private ticks = 0
  private readonly requiredTicks: number

  constructor(requiredTicks = 90) {
    this.requiredTicks = requiredTicks
  }

  onStart(_context: OccurrenceContext): OccurrenceEvent[] {
    return [{
      id: 'start-event',
      eventType: 'stub.started',
      occurrenceId: this.id,
      occurrenceType: this.occurrenceType,
      timestamp: this.scheduledTime,
      payload: {},
    }]
  }

  onTick(now: GameDateTime, _context: OccurrenceContext): OccurrenceEvent[] {
    this.ticks++
    return [{
      id: `tick-event-${this.ticks}`,
      eventType: 'stub.ticked',
      occurrenceId: this.id,
      occurrenceType: this.occurrenceType,
      timestamp: now,
      payload: { tick: this.ticks },
    }]
  }

  isComplete(_now: GameDateTime): boolean {
    return this.ticks >= this.requiredTicks
  }

  onComplete(_context: OccurrenceContext): OccurrenceEvent[] {
    return [{
      id: 'complete-event',
      eventType: 'stub.completed',
      occurrenceId: this.id,
      occurrenceType: this.occurrenceType,
      timestamp: this.scheduledTime,
      payload: { totalTicks: this.ticks },
    }]
  }
}

describe('Occurrence (contract):', () => {
  const context: OccurrenceContext = {}

  describe('onStart:', () => {
    test('given a new occurrence when started then returns start events with correct occurrence id', () => {
      const occ = new StubOccurrence()
      const events = occ.onStart(context)
      expect(events).toHaveLength(1)
      expect(events[0].occurrenceId).toBe('stub-occ-1')
    })

    test('given a new occurrence when started then event timestamp matches scheduled time', () => {
      const occ = new StubOccurrence()
      const events = occ.onStart(context)
      expect(events[0].timestamp).toEqual(createGameDateTime(2025, 8, 15, 14, 0))
    })

    test('given a new occurrence when started then event has occurrenceType set', () => {
      const occ = new StubOccurrence()
      const events = occ.onStart(context)
      expect(events[0].occurrenceType).toBe('stub')
    })
  })

  describe('onTick:', () => {
    test('given an active occurrence when ticked then returns tick events', () => {
      const occ = new StubOccurrence()
      const now = createGameDateTime(2025, 8, 15, 14, 1)
      const events = occ.onTick(now, context)
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('stub.ticked')
    })

    test('given an active occurrence when ticked then event timestamp matches current time', () => {
      const occ = new StubOccurrence()
      const now = createGameDateTime(2025, 8, 15, 14, 5)
      const events = occ.onTick(now, context)
      expect(events[0].timestamp).toEqual(now)
    })

    test('given an occurrence ticked multiple times then each tick has unique event id', () => {
      const occ = new StubOccurrence()
      const now = createGameDateTime(2025, 8, 15, 14, 1)
      const first = occ.onTick(now, context)
      const second = occ.onTick(now, context)
      expect(first[0].id).not.toBe(second[0].id)
    })
  })

  describe('isComplete:', () => {
    test('given a new occurrence then is not complete', () => {
      const occ = new StubOccurrence(3)
      expect(occ.isComplete(createGameDateTime(2025, 8, 15, 14, 0))).toBe(false)
    })

    test('given an occurrence that has not reached its duration then is not complete', () => {
      const occ = new StubOccurrence(3)
      const now = createGameDateTime(2025, 8, 15, 14, 1)
      occ.onTick(now, context)
      occ.onTick(now, context)
      expect(occ.isComplete(now)).toBe(false)
    })

    test('given an occurrence that has reached its duration then is complete', () => {
      const occ = new StubOccurrence(3)
      const now = createGameDateTime(2025, 8, 15, 14, 3)
      occ.onTick(now, context)
      occ.onTick(now, context)
      occ.onTick(now, context)
      expect(occ.isComplete(now)).toBe(true)
    })
  })

  describe('onComplete:', () => {
    test('given a completed occurrence when completing then returns completion events', () => {
      const occ = new StubOccurrence()
      const events = occ.onComplete(context)
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('stub.completed')
    })

    test('given a completed occurrence when completing then event has correct occurrence id', () => {
      const occ = new StubOccurrence()
      const events = occ.onComplete(context)
      expect(events[0].occurrenceId).toBe('stub-occ-1')
    })
  })

  describe('properties:', () => {
    test('given an occurrence then has required id, scheduledTime, and tickResolution', () => {
      const occ = new StubOccurrence()
      expect(occ.id).toBe('stub-occ-1')
      expect(occ.scheduledTime).toEqual(createGameDateTime(2025, 8, 15, 14, 0))
      expect(occ.tickResolution).toBe('minute')
    })
  })
})
