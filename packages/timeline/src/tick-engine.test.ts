import { TickEngine } from './tick-engine.ts';
import type { TickEngineConfig } from './tick-engine.ts';
import { EventLog } from './event-log.ts';
import { createGameDateTime } from './game-date-time.ts';
import type { Occurrence, OccurrenceContext, OccurrenceEvent, TickResolution } from './occurrence.ts';
import type { GameDateTime } from './game-date-time.ts';

// dt(15, 14, 30) = Aug 15 2025 14:30
const dt = (day: number, hour = 0, minute = 0) =>
  createGameDateTime(2025, 8, day, hour, minute);

function makeOccurrence(
  id: string,
  scheduledTime: GameDateTime,
  options: { tickResolution?: TickResolution; requiredTicks?: number } = {},
): Occurrence {
  let ticks = 0;
  const { tickResolution = 'minute', requiredTicks = 1 } = options;
  return {
    id,
    scheduledTime,
    tickResolution,
    onStart: (_ctx: OccurrenceContext): OccurrenceEvent[] => [{
      id: `${id}-start`,
      eventType: `${id}.started`,
      occurrenceId: id,
      occurrenceType: 'stub',
      timestamp: scheduledTime,
      payload: {},
    }],
    onTick: (now: GameDateTime, _ctx: OccurrenceContext): OccurrenceEvent[] => {
      ticks++;
      return [{
        id: `${id}-tick-${ticks}`,
        eventType: `${id}.ticked`,
        occurrenceId: id,
        occurrenceType: 'stub',
        timestamp: now,
        payload: { tick: ticks },
      }];
    },
    isComplete: (_now: GameDateTime): boolean => ticks >= requiredTicks,
    onComplete: (_ctx: OccurrenceContext): OccurrenceEvent[] => [{
      id: `${id}-complete`,
      eventType: `${id}.completed`,
      occurrenceId: id,
      occurrenceType: 'stub',
      timestamp: scheduledTime,
      payload: {},
    }],
  };
}

describe('TickEngine:', () => {
  let log: EventLog;

  beforeEach(() => {
    log = new EventLog();
  });

  function makeEngine(startTime: GameDateTime, config: Partial<TickEngineConfig> = {}): TickEngine {
    return new TickEngine({ startTime, eventLog: log, ...config });
  }

  describe('schedule:', () => {
    test('given an occurrence when scheduled then appears in getScheduledOccurrences', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14)));
      expect(engine.getScheduledOccurrences()).toHaveLength(1);
    });

    test('given occurrences scheduled out of order then queue is sorted by scheduled time', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('late', dt(15, 17)));
      engine.schedule(makeOccurrence('early', dt(15, 14)));
      engine.schedule(makeOccurrence('middle', dt(15, 15)));
      const hours = engine.getScheduledOccurrences().map(o => o.scheduledTime.hour);
      expect(hours).toEqual([14, 15, 17]);
    });

    test('given two occurrences at the same time when scheduled then both appear in queue', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('a', dt(15, 14)));
      engine.schedule(makeOccurrence('b', dt(15, 14)));
      expect(engine.getScheduledOccurrences()).toHaveLength(2);
    });

    test('given equal scheduled times then insertion order is preserved (stable FIFO)', () => {
      // The binary-search insertion uses `<= 0` so an equal-time newcomer is placed
      // after existing equal entries; `< 0` would reverse them.
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('a', dt(15, 14)));
      engine.schedule(makeOccurrence('b', dt(15, 14)));
      engine.schedule(makeOccurrence('c', dt(15, 14)));
      expect(engine.getScheduledOccurrences().map(o => o.id)).toEqual(['a', 'b', 'c']);
    });

    test('given a duplicate occurrence id when scheduled then throws', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14)));
      expect(() => engine.schedule(makeOccurrence('occ-1', dt(15, 15)))).toThrow('occ-1');
    });

    test('given an id already active when scheduled again then throws', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 10), { requiredTicks: 90 }));
      await engine.tickToNext(); // activates occ-1
      expect(() => engine.schedule(makeOccurrence('occ-1', dt(15, 12)))).toThrow('occ-1');
    });
  });

  describe('hasNext:', () => {
    test('given a new engine with no occurrences then returns false', () => {
      expect(makeEngine(dt(15, 10)).hasNext()).toBe(false);
    });

    test('given an engine with a scheduled occurrence then returns true', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14)));
      expect(engine.hasNext()).toBe(true);
    });

    test('given all occurrences have completed then returns false', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 10), { requiredTicks: 1 }));
      await engine.tickToNext();
      expect(engine.hasNext()).toBe(false);
    });
  });

  describe('peekNextTickTime:', () => {
    test('given an empty engine then returns null', () => {
      expect(makeEngine(dt(15, 10)).peekNextTickTime()).toBeNull();
    });

    test('given a queued occurrence when nothing is active then returns its scheduled time', () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14)));
      expect(engine.peekNextTickTime()).toEqual(dt(15, 14));
    });

    test('given an active minute-resolution occurrence then returns currentTime plus one minute', async () => {
      const engine = makeEngine(dt(15, 14));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext(); // activates occ-1 at 14:00
      expect(engine.peekNextTickTime()).toEqual(dt(15, 14, 1));
    });

    test('given a queued occurrence scheduled in the past then returns currentTime', () => {
      const engine = makeEngine(dt(15, 14));
      engine.schedule(makeOccurrence('past-occ', dt(15, 10), { requiredTicks: 90 }));
      expect(engine.peekNextTickTime()).toEqual(dt(15, 14));
    });

    test('given an active day-resolution occurrence and a sooner queued occurrence then returns queued time', async () => {
      const engine = makeEngine(dt(15, 9));
      engine.schedule(makeOccurrence('day-occ', dt(15, 9), { requiredTicks: 7, tickResolution: 'day' }));
      engine.schedule(makeOccurrence('match', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext(); // activates day-occ at 09:00
      // next day-tick would be day 16, but match is at 14:00 today (sooner)
      expect(engine.peekNextTickTime()).toEqual(dt(15, 14));
    });
  });

  describe('tickToNext:', () => {
    test('given an empty engine then returns null', async () => {
      expect(await makeEngine(dt(15, 10)).tickToNext()).toBeNull();
    });

    test('given a scheduled occurrence when ticked then advances currentTime to scheduled time', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext();
      expect(engine.getCurrentTime()).toEqual(dt(15, 14));
    });

    test('given a scheduled occurrence when ticked then result includes its id in started', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      // exact arrays: only occ-1 started, and nothing completed in this tick
      expect(result!.started).toEqual(['occ-1']);
      expect(result!.completed).toEqual([]);
    });

    test('given a scheduled occurrence when first ticked then fires onStart event', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      expect(result!.events.some(e => e.eventType === 'occ-1.started')).toBe(true);
    });

    test('given a scheduled occurrence when first ticked then also fires onTick event', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      expect(result!.events.some(e => e.eventType === 'occ-1.ticked')).toBe(true);
    });

    test('given an active minute-resolution occurrence when ticked again then advances by one minute', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext(); // to 14:00
      await engine.tickToNext(); // to 14:01
      expect(engine.getCurrentTime()).toEqual(dt(15, 14, 1));
    });

    test('given an active hour-resolution occurrence when ticked then advances by one hour', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 3, tickResolution: 'hour' }));
      await engine.tickToNext(); // to 14:00
      await engine.tickToNext(); // to 15:00
      expect(engine.getCurrentTime()).toEqual(dt(15, 15));
    });

    test('given an active day-resolution occurrence when ticked then advances by one day', async () => {
      const engine = makeEngine(dt(15));
      engine.schedule(makeOccurrence('occ-1', dt(16), { requiredTicks: 3, tickResolution: 'day' }));
      await engine.tickToNext(); // to day 16
      await engine.tickToNext(); // to day 17
      expect(engine.getCurrentTime()).toEqual(dt(17));
    });

    test('given active occurrences with mixed resolutions then uses the finest resolution', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('day-occ', dt(15, 14), { requiredTicks: 5, tickResolution: 'day' }));
      engine.schedule(makeOccurrence('min-occ', dt(15, 14), { requiredTicks: 90, tickResolution: 'minute' }));
      await engine.tickToNext(); // both start at 14:00
      await engine.tickToNext(); // advances by 1 minute (finest wins)
      expect(engine.getCurrentTime()).toEqual(dt(15, 14, 1));
    });

    test('given a day-resolution occurrence active and a sooner queued occurrence then ticks to the queued time', async () => {
      const engine = makeEngine(dt(15, 9));
      engine.schedule(makeOccurrence('day-occ', dt(15, 9), { requiredTicks: 7, tickResolution: 'day' }));
      engine.schedule(makeOccurrence('match', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext(); // to 09:00, day-occ starts
      const result = await engine.tickToNext(); // should jump to 14:00 not day 16
      expect(result!.currentTime).toEqual(dt(15, 14));
      expect(result!.started).toContain('match');
    });

    test('given an occurrence that completes in one tick then includes its id in completed', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      const result = await engine.tickToNext();
      expect(result!.completed).toContain('occ-1');
    });

    test('given a completing occurrence then fires its onComplete event', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      const result = await engine.tickToNext();
      expect(result!.events.some(e => e.eventType === 'occ-1.completed')).toBe(true);
    });

    test('given a completing occurrence then removes it from the active set', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      await engine.tickToNext();
      expect(engine.getActiveOccurrences()).toHaveLength(0);
    });

    test('given two occurrences at the same time when ticked then both are started', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('match-1', dt(15, 15), { requiredTicks: 90 }));
      engine.schedule(makeOccurrence('match-2', dt(15, 15), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      expect(result!.started).toContain('match-1');
      expect(result!.started).toContain('match-2');
    });

    test('given two occurrences at the same time when ticked then both receive onTick events', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('match-1', dt(15, 15), { requiredTicks: 90 }));
      engine.schedule(makeOccurrence('match-2', dt(15, 15), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      const tickedIds = result!.events
        .filter(e => e.eventType.endsWith('.ticked'))
        .map(e => e.occurrenceId);
      expect(tickedIds).toContain('match-1');
      expect(tickedIds).toContain('match-2');
    });

    test('given events are fired then all are appended to the event log', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      await engine.tickToNext();
      // start + tick + complete = 3 events
      expect(log.size()).toBe(3);
    });

    test('given an onEvents callback then it is called with all events from the tick', async () => {
      let received: readonly OccurrenceEvent[] = [];
      const onEvents = vi.fn().mockImplementation(async (events: readonly OccurrenceEvent[]) => {
        received = events;
      });
      const engine = makeEngine(dt(15, 10), { onEvents });
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      await engine.tickToNext();
      expect(received.length).toBeGreaterThan(0);
    });

    test('given an async onEvents callback then tickToNext awaits it before resolving', async () => {
      let consumerDone = false;
      const onEvents = async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10));
        consumerDone = true;
      };
      const engine = makeEngine(dt(15, 10), { onEvents });
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      await engine.tickToNext();
      expect(consumerDone).toBe(true);
    });

    test('given an occurrence that emits no events then onEvents is not called', async () => {
      const onEvents = vi.fn();
      const silent: Occurrence = {
        id: 'silent',
        scheduledTime: dt(15, 14),
        tickResolution: 'minute',
        onStart: () => [],
        onTick: () => [],
        isComplete: () => true,
        onComplete: () => [],
      };
      const engine = makeEngine(dt(15, 10), { onEvents });
      engine.schedule(silent);
      await engine.tickToNext();
      expect(onEvents).not.toHaveBeenCalled();
    });

    test('given a tick then result previousTime and currentTime reflect the advance', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      const result = await engine.tickToNext();
      expect(result!.previousTime).toEqual(dt(15, 10));
      expect(result!.currentTime).toEqual(dt(15, 14));
    });

    test('given an occurrence scheduled at current time then activates immediately without moving clock', async () => {
      const engine = makeEngine(dt(15, 14));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickToNext();
      expect(engine.getCurrentTime()).toEqual(dt(15, 14));
      expect(engine.getActiveOccurrences()).toHaveLength(1);
    });

    test('given an active occurrence with an unknown tickResolution when ticked again then throws', async () => {
      const badOcc: Occurrence = {
        ...makeOccurrence('bad', dt(15, 14), { requiredTicks: 90 }),
        tickResolution: 'week' as TickResolution,
      };
      const engine = makeEngine(dt(15, 10));
      engine.schedule(badOcc);
      await engine.tickToNext(); // first tick: occurrence starts (active.size was 0, minResolution not called)
      await expect(engine.tickToNext()).rejects.toThrow('active occurrence has unknown tickResolution');
    });
  });

  describe('tickTo:', () => {
    test('given a future target with no occurrences then advances clock to target', async () => {
      const engine = makeEngine(dt(15, 10));
      await engine.tickTo(dt(15, 14));
      expect(engine.getCurrentTime()).toEqual(dt(15, 14));
    });

    test('given a future target with no occurrences then returns no tick results', async () => {
      const engine = makeEngine(dt(15, 10));
      const results = await engine.tickTo(dt(15, 14));
      expect(results).toHaveLength(0);
    });

    test('given an occurrence before the target then processes it and returns a tick result', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      const results = await engine.tickTo(dt(15, 15));
      expect(results.some(r => r.started.includes('occ-1'))).toBe(true);
    });

    test('given an occurrence after the target then does not activate it', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 17), { requiredTicks: 90 }));
      await engine.tickTo(dt(15, 14));
      expect(engine.getActiveOccurrences()).toHaveLength(0);
      expect(engine.getScheduledOccurrences()).toHaveLength(1);
    });

    test('given a target mid-match then stops at target with match still active', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('match', dt(15, 14), { requiredTicks: 90 }));
      await engine.tickTo(dt(15, 14, 30));
      expect(engine.getCurrentTime()).toEqual(dt(15, 14, 30));
      expect(engine.getActiveOccurrences()).toHaveLength(1);
    });

    test('given a target in the past then does not change currentTime', async () => {
      const engine = makeEngine(dt(15, 14));
      await engine.tickTo(dt(15, 10));
      expect(engine.getCurrentTime()).toEqual(dt(15, 14));
    });

    test('given two concurrent matches when ticked to their end then both complete', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('match-1', dt(15, 15), { requiredTicks: 90 }));
      engine.schedule(makeOccurrence('match-2', dt(15, 15), { requiredTicks: 90 }));
      // Advance past both matches (15:00 start + 90 min = 16:30)
      const results = await engine.tickTo(dt(15, 17));
      const allCompleted = results.flatMap(r => r.completed);
      expect(allCompleted).toContain('match-1');
      expect(allCompleted).toContain('match-2');
    });
  });

  describe('tickBy:', () => {
    test('given an amount in minutes then advances by that many minutes', async () => {
      const engine = makeEngine(dt(15, 10));
      await engine.tickBy(30, 'minute');
      expect(engine.getCurrentTime()).toEqual(dt(15, 10, 30));
    });

    test('given an amount in hours then advances by that many hours', async () => {
      const engine = makeEngine(dt(15, 10));
      await engine.tickBy(3, 'hour');
      expect(engine.getCurrentTime()).toEqual(dt(15, 13));
    });

    test('given an amount in days then advances by that many days', async () => {
      const engine = makeEngine(dt(15));
      await engine.tickBy(3, 'day');
      expect(engine.getCurrentTime()).toEqual(dt(18));
    });

    test('given occurrences within the advanced range then processes them', async () => {
      const engine = makeEngine(dt(15, 10));
      engine.schedule(makeOccurrence('occ-1', dt(15, 14), { requiredTicks: 1 }));
      const results = await engine.tickBy(5, 'hour'); // 10:00 + 5h = 15:00
      expect(results.some(r => r.started.includes('occ-1'))).toBe(true);
    });
  });
});
