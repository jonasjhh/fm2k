import { EventBus } from './event-bus.ts';

type TestEvents = {
  scored: { team: string; points: number };
  reset: undefined;
};

describe('EventBus:', () => {
  test('given a handler then emit invokes it with the payload', () => {
    const bus = new EventBus<TestEvents>();
    const received: TestEvents['scored'][] = [];
    bus.on('scored', payload => received.push(payload));

    bus.emit('scored', { team: 'red', points: 3 });

    expect(received).toEqual([{ team: 'red', points: 3 }]);
  });

  test('given multiple handlers for the same event then all are invoked', () => {
    const bus = new EventBus<TestEvents>();
    let a = 0;
    let b = 0;
    bus.on('scored', () => { a++; });
    bus.on('scored', () => { b++; });

    bus.emit('scored', { team: 'red', points: 1 });

    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test('given an unsubscribe callback then the handler stops receiving events', () => {
    const bus = new EventBus<TestEvents>();
    let count = 0;
    const off = bus.on('scored', () => { count++; });

    bus.emit('scored', { team: 'red', points: 1 });
    off();
    bus.emit('scored', { team: 'red', points: 2 });

    expect(count).toBe(1);
  });

  test('given unsubscribing one of two handlers then the other keeps receiving events', () => {
    const bus = new EventBus<TestEvents>();
    let kept = 0;
    const off = bus.on('scored', () => { /* removed */ });
    bus.on('scored', () => { kept++; });

    off();
    bus.emit('scored', { team: 'red', points: 1 });

    expect(kept).toBe(1);
  });

  test('given an event with no handlers then emit does not throw', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('reset', undefined)).not.toThrow();
  });
});
