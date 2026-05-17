import { EventLog } from './event-log.js'
import type { EventLogQuery } from './event-log.js'
import type { OccurrenceEvent } from './occurrence.js'
import { createGameDateTime } from './game-date-time.js'

function makeEvent(overrides: Partial<OccurrenceEvent> = {}): OccurrenceEvent {
  return {
    id: 'event-1',
    eventType: 'goal',
    occurrenceId: 'occ-1',
    occurrenceType: 'match',
    timestamp: createGameDateTime(2025, 8, 15, 14, 30),
    payload: {},
    ...overrides,
  }
}

describe('EventLog:', () => {
  describe('size:', () => {
    test('given a new log then size is 0', () => {
      expect(new EventLog().size()).toBe(0)
    })

    test('given a log when one event is appended then size is 1', () => {
      const log = new EventLog()
      log.append(makeEvent())
      expect(log.size()).toBe(1)
    })

    test('given a log when multiple events are appended then size reflects count', () => {
      const log = new EventLog()
      log.append(makeEvent({ id: 'e1' }))
      log.append(makeEvent({ id: 'e2' }))
      log.append(makeEvent({ id: 'e3' }))
      expect(log.size()).toBe(3)
    })
  })

  describe('clear:', () => {
    test('given a log with events when cleared then size is 0', () => {
      const log = new EventLog()
      log.append(makeEvent())
      log.clear()
      expect(log.size()).toBe(0)
    })

    test('given a log with events when cleared then query returns empty array', () => {
      const log = new EventLog()
      log.append(makeEvent())
      log.clear()
      expect(log.query()).toHaveLength(0)
    })
  })

  describe('query:', () => {
    test('given a log with events when queried with no filter then returns all events', () => {
      const log = new EventLog()
      log.append(makeEvent({ id: 'e1' }))
      log.append(makeEvent({ id: 'e2' }))
      expect(log.query()).toHaveLength(2)
    })

    test('given an empty log when queried then returns empty array', () => {
      expect(new EventLog().query()).toHaveLength(0)
    })

    describe('fromTime filter:', () => {
      test('given events at various times when filtered by fromTime then excludes events before that time', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'before', timestamp: createGameDateTime(2025, 8, 15, 13, 0) }))
        log.append(makeEvent({ id: 'at', timestamp: createGameDateTime(2025, 8, 15, 14, 0) }))
        log.append(makeEvent({ id: 'after', timestamp: createGameDateTime(2025, 8, 15, 15, 0) }))

        const results = log.query({ fromTime: createGameDateTime(2025, 8, 15, 14, 0) })
        expect(results.map(e => e.id)).toEqual(['at', 'after'])
      })

      test('given a fromTime that exactly matches an event timestamp then includes that event', () => {
        const log = new EventLog()
        const ts = createGameDateTime(2025, 8, 15, 14, 0)
        log.append(makeEvent({ id: 'exact', timestamp: ts }))

        expect(log.query({ fromTime: ts })).toHaveLength(1)
      })
    })

    describe('toTime filter:', () => {
      test('given events at various times when filtered by toTime then excludes events after that time', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'before', timestamp: createGameDateTime(2025, 8, 15, 13, 0) }))
        log.append(makeEvent({ id: 'at', timestamp: createGameDateTime(2025, 8, 15, 14, 0) }))
        log.append(makeEvent({ id: 'after', timestamp: createGameDateTime(2025, 8, 15, 15, 0) }))

        const results = log.query({ toTime: createGameDateTime(2025, 8, 15, 14, 0) })
        expect(results.map(e => e.id)).toEqual(['before', 'at'])
      })

      test('given a toTime that exactly matches an event timestamp then includes that event', () => {
        const log = new EventLog()
        const ts = createGameDateTime(2025, 8, 15, 14, 0)
        log.append(makeEvent({ id: 'exact', timestamp: ts }))

        expect(log.query({ toTime: ts })).toHaveLength(1)
      })
    })

    describe('time range filter:', () => {
      test('given events when filtered by fromTime and toTime then returns only events in range', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'before', timestamp: createGameDateTime(2025, 8, 15, 12, 0) }))
        log.append(makeEvent({ id: 'start', timestamp: createGameDateTime(2025, 8, 15, 14, 0) }))
        log.append(makeEvent({ id: 'middle', timestamp: createGameDateTime(2025, 8, 15, 15, 0) }))
        log.append(makeEvent({ id: 'end', timestamp: createGameDateTime(2025, 8, 15, 16, 0) }))
        log.append(makeEvent({ id: 'after', timestamp: createGameDateTime(2025, 8, 15, 17, 0) }))

        const results = log.query({
          fromTime: createGameDateTime(2025, 8, 15, 14, 0),
          toTime: createGameDateTime(2025, 8, 15, 16, 0),
        })
        expect(results.map(e => e.id)).toEqual(['start', 'middle', 'end'])
      })
    })

    describe('occurrenceId filter:', () => {
      test('given events from multiple occurrences when filtered by occurrenceId then returns only matching events', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'e1', occurrenceId: 'match-1' }))
        log.append(makeEvent({ id: 'e2', occurrenceId: 'match-2' }))
        log.append(makeEvent({ id: 'e3', occurrenceId: 'match-1' }))

        const results = log.query({ occurrenceId: 'match-1' })
        expect(results.map(e => e.id)).toEqual(['e1', 'e3'])
      })

      test('given events when filtered by non-existent occurrenceId then returns empty array', () => {
        const log = new EventLog()
        log.append(makeEvent({ occurrenceId: 'match-1' }))
        expect(log.query({ occurrenceId: 'non-existent' })).toHaveLength(0)
      })
    })

    describe('occurrenceType filter:', () => {
      test('given events of mixed types when filtered by occurrenceType then returns only matching events', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'e1', occurrenceType: 'match' }))
        log.append(makeEvent({ id: 'e2', occurrenceType: 'training' }))
        log.append(makeEvent({ id: 'e3', occurrenceType: 'match' }))

        const results = log.query({ occurrenceType: 'match' })
        expect(results.map(e => e.id)).toEqual(['e1', 'e3'])
      })
    })

    describe('eventType filter:', () => {
      test('given events of mixed event types when filtered by eventType then returns only matching events', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'e1', eventType: 'goal' }))
        log.append(makeEvent({ id: 'e2', eventType: 'yellow_card' }))
        log.append(makeEvent({ id: 'e3', eventType: 'goal' }))

        const results = log.query({ eventType: 'goal' })
        expect(results.map(e => e.id)).toEqual(['e1', 'e3'])
      })
    })

    describe('combined filters:', () => {
      test('given events when multiple filters are provided then applies all as AND conditions', () => {
        const log = new EventLog()
        log.append(makeEvent({ id: 'e1', occurrenceId: 'match-1', eventType: 'goal' }))
        log.append(makeEvent({ id: 'e2', occurrenceId: 'match-1', eventType: 'yellow_card' }))
        log.append(makeEvent({ id: 'e3', occurrenceId: 'match-2', eventType: 'goal' }))

        const results = log.query({ occurrenceId: 'match-1', eventType: 'goal' })
        expect(results.map(e => e.id)).toEqual(['e1'])
      })

      test('given events when all filters are combined then only returns exact matches', () => {
        const log = new EventLog()
        const ts = createGameDateTime(2025, 8, 15, 14, 45)
        log.append(makeEvent({ id: 'match', occurrenceId: 'occ-1', occurrenceType: 'match', eventType: 'goal', timestamp: ts }))
        log.append(makeEvent({ id: 'wrong-type', occurrenceId: 'occ-1', occurrenceType: 'match', eventType: 'pass', timestamp: ts }))
        log.append(makeEvent({ id: 'wrong-occ', occurrenceId: 'occ-2', occurrenceType: 'match', eventType: 'goal', timestamp: ts }))

        const results = log.query({
          occurrenceId: 'occ-1',
          occurrenceType: 'match',
          eventType: 'goal',
          fromTime: ts,
          toTime: ts,
        })
        expect(results.map(e => e.id)).toEqual(['match'])
      })
    })
  })

  describe('serialize:', () => {
    test('given a log when serialized then produces valid JSON', () => {
      const log = new EventLog()
      log.append(makeEvent())
      expect(() => JSON.parse(log.serialize())).not.toThrow()
    })

    test('given a log when serialized then includes version field set to 1', () => {
      const data = JSON.parse(new EventLog().serialize())
      expect(data.version).toBe(1)
    })

    test('given a log with two events when serialized then entries array has length 2', () => {
      const log = new EventLog()
      log.append(makeEvent({ id: 'e1' }))
      log.append(makeEvent({ id: 'e2' }))
      const data = JSON.parse(log.serialize())
      expect(data.entries).toHaveLength(2)
    })

    test('given an empty log when serialized then entries array is empty', () => {
      const data = JSON.parse(new EventLog().serialize())
      expect(data.entries).toHaveLength(0)
    })
  })

  describe('deserialize:', () => {
    test('given serialized log data when deserialized then restores all events', () => {
      const original = new EventLog()
      original.append(makeEvent({ id: 'e1' }))
      original.append(makeEvent({ id: 'e2' }))

      const restored = EventLog.deserialize(original.serialize())
      expect(restored.size()).toBe(2)
    })

    test('given serialized log data when deserialized then entry data is preserved exactly', () => {
      const event = makeEvent({ id: 'e1', eventType: 'goal', occurrenceId: 'match-42' })
      const original = new EventLog()
      original.append(event)

      const restored = EventLog.deserialize(original.serialize())
      expect(restored.query()[0]).toEqual(event)
    })

    test('given a roundtrip serialize and deserialize then query returns same results', () => {
      const original = new EventLog()
      original.append(makeEvent({ id: 'e1', occurrenceId: 'match-1', eventType: 'goal' }))
      original.append(makeEvent({ id: 'e2', occurrenceId: 'match-1', eventType: 'yellow_card' }))
      original.append(makeEvent({ id: 'e3', occurrenceId: 'match-2', eventType: 'goal' }))

      const restored = EventLog.deserialize(original.serialize())
      const results = restored.query({ occurrenceId: 'match-1' })
      expect(results.map(e => e.id)).toEqual(['e1', 'e2'])
    })

    test('given serialized data with an unknown version when deserialized then throws with version number', () => {
      const badData = JSON.stringify({ version: 99, entries: [] })
      expect(() => EventLog.deserialize(badData)).toThrow('Unsupported EventLog version: 99')
    })
  })
})
