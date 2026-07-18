import { StateManager } from './state-manager.ts';
import { assertDefined } from './assert.ts';

interface TestGameState {
  score: number;
  player: {
    name: string;
    level: number;
  };
  inventory: string[];
}

interface SimpleState {
  count: number;
  message: string;
}

// Mock localStorage for testing
const mockLocalStorage = {
  store: new Map<string, string>(),
  getItem: (key: string) => mockLocalStorage.store.get(key) ?? null,
  setItem: (key: string, value: string) => mockLocalStorage.store.set(key, value),
  removeItem: (key: string) => mockLocalStorage.store.delete(key),
  clear: () => mockLocalStorage.store.clear(),
};

// @ts-ignore
globalThis.localStorage = mockLocalStorage;

describe('StateManager:', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('.getState()', () => {
    test('given a new StateManager instance when created with initial state then should return cloned initial state', () => {
      // Arrange
      const initialState: SimpleState = { count: 0, message: 'hello' };

      // Act
      const stateManager = new StateManager(initialState);
      const currentState = stateManager.getState();

      // Assert
      expect(currentState.count).toBe(0);
      expect(currentState.message).toBe('hello');
      expect(currentState).not.toBe(initialState); // Should return cloned state
    });
  });

  describe('.updateState()', () => {
    test('given a StateManager with simple state when updating state with function updater then should apply changes correctly', () => {
      // Arrange
      const stateManager = new StateManager<SimpleState>({ count: 5, message: 'start' });

      // Act
      stateManager.updateState(draft => {
        draft.count += 10;
        draft.message = 'updated';
      });
      const newState = stateManager.getState();

      // Assert
      expect(newState.count).toBe(15);
      expect(newState.message).toBe('updated');
    });

    test('given a StateManager with simple state when updating partial state then should preserve other properties', () => {
      // Arrange
      const stateManager = new StateManager<SimpleState>({ count: 3, message: 'initial' });

      // Act
      stateManager.updateState(draft => { draft.count = 7; });
      const newState = stateManager.getState();

      // Assert
      expect(newState.count).toBe(7);
      expect(newState.message).toBe('initial'); // Should preserve other properties
    });

    test('given a StateManager with complex nested state when updating nested properties then should handle complex updates correctly', () => {
      // Arrange
      const initialState: TestGameState = {
        score: 100,
        player: { name: 'John', level: 1 },
        inventory: ['sword', 'potion'],
      };
      const stateManager = new StateManager(initialState);

      // Act
      stateManager.updateState(draft => {
        draft.score += 50;
        draft.player.level = 2;
        draft.inventory.push('shield');
      });
      const newState = stateManager.getState();

      // Assert
      expect(newState.score).toBe(150);
      expect(newState.player.level).toBe(2);
      expect(newState.player.name).toBe('John');
      expect(newState.inventory).toEqual(['sword', 'potion', 'shield']);
    });

    test('given a StateManager with persistence enabled when state is updated and new instance is created then should restore persisted state', () => {
      // Arrange
      const initialState: SimpleState = { count: 42, message: 'persisted' };
      const key = 'test-state';

      // Act - Save state
      const stateManager1 = new StateManager(initialState, { enablePersistence: true, persistenceKey: key });
      stateManager1.updateState(draft => { draft.count = 99; });

      // Act - Restore state
      const stateManager2 = new StateManager<SimpleState>({ count: 0, message: '' }, { enablePersistence: true, persistenceKey: key });
      const restoredState = stateManager2.getState();

      // Assert
      expect(restoredState.count).toBe(99);
      expect(restoredState.message).toBe('persisted');
    });

    test('given a StateManager with persistence enabled when localStorage throws errors then should handle gracefully', () => {
      // Arrange
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = () => {
        throw new Error('Storage quota exceeded');
      };

      const stateManager = new StateManager<SimpleState>({ count: 1, message: 'test' }, { enablePersistence: true, persistenceKey: 'error-key' });

      // Act & Assert - Should not throw
      expect(() => {
        stateManager.updateState(draft => { draft.count = 2; });
      }).not.toThrow();

      // Cleanup
      mockLocalStorage.setItem = originalSetItem;
    });
  });

  describe('.subscribe()', () => {
    test('given a StateManager with subscribers when state changes then should notify all subscribers', () => {
      // Arrange
      const stateManager = new StateManager<SimpleState>({ count: 0, message: 'test' });
      let notificationCount = 0;
      let lastReceivedState: SimpleState | null = null;

      const unsubscribe = stateManager.subscribe((newState, _previousState) => {
        notificationCount++;
        lastReceivedState = newState;
      });

      // Act
      stateManager.updateState(draft => { draft.count = 5; });

      // Assert
      expect(notificationCount).toBe(1);
      const state = assertDefined<SimpleState>(lastReceivedState, 'lastReceivedState missing');
      expect(state.count).toBe(5);
      expect(state.message).toBe('test');

      // Cleanup
      unsubscribe();
    });

    test('given a StateManager with subscriber when subscriber unsubscribes then should not receive further notifications', () => {
      // Arrange
      const stateManager = new StateManager<SimpleState>({ count: 0, message: 'test' });
      let notificationCount = 0;

      const unsubscribe = stateManager.subscribe(() => {
        notificationCount++;
      });

      // Act & Assert
      stateManager.updateState(draft => { draft.count = 1; });
      expect(notificationCount).toBe(1);

      unsubscribe();
      stateManager.updateState(draft => { draft.count = 2; });
      expect(notificationCount).toBe(1); // Should still be 1
    });

    test('given a StateManager when multiple subscribers exist then should notify all of them', () => {
      // Arrange
      const stateManager = new StateManager<SimpleState>({ count: 0, message: 'test' });
      let subscriber1Count = 0;
      let subscriber2Count = 0;

      const unsubscribe1 = stateManager.subscribe(() => { subscriber1Count++; });
      const unsubscribe2 = stateManager.subscribe(() => { subscriber2Count++; });

      // Act
      stateManager.updateState(draft => { draft.count = 1; });

      // Assert
      expect(subscriber1Count).toBe(1);
      expect(subscriber2Count).toBe(1);

      // Cleanup
      unsubscribe1();
      unsubscribe2();
    });
  });
});

describe('StateManager constructor:', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  test('given the StateManager constructor when called with initial state then should create StateManager instance', () => {
    // Arrange & Act
    const stateManager = new StateManager<SimpleState>({ count: 10, message: 'factory' });
    const state = stateManager.getState();

    // Assert
    expect(state.count).toBe(10);
    expect(state.message).toBe('factory');
  });

  test('given the StateManager constructor when called with persistence options then should create StateManager with persistence', () => {
    // Arrange
    const initialState: SimpleState = { count: 20, message: 'persistent' };
    const key = 'factory-test';

    // Act
    const stateManager1 = new StateManager(initialState, { enablePersistence: true, persistenceKey: key });
    stateManager1.updateState(draft => { draft.count = 30; });

    const stateManager2 = new StateManager<SimpleState>({ count: 0, message: '' }, { enablePersistence: true, persistenceKey: key });
    const restoredState = stateManager2.getState();

    // Assert
    expect(restoredState.count).toBe(30);
    expect(restoredState.message).toBe('persistent');
  });
});

describe('StateManager history & snapshots:', () => {
  beforeEach(() => mockLocalStorage.clear());

  test('given no options then history is disabled by default', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' });
    expect(sm.getHistory()).toEqual([]);
  });

  test('given enableHistory then the constructor seeds an initial snapshot', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    expect(sm.getHistory()).toHaveLength(1);
  });

  test('given enableHistory then each setState appends a snapshot', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    sm.updateState(d => { d.count = 1; });
    sm.updateState(d => { d.count = 2; });
    expect(sm.getHistory()).toHaveLength(3); // initial + 2 updates
  });

  test('given getHistory then returns a copy that cannot mutate internal history', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    sm.getHistory().push({ state: { count: 9, message: 'x' }, timestamp: 0, id: 'fake' });
    expect(sm.getHistory()).toHaveLength(1);
  });

  test('given maxHistorySize then trims to the most recent snapshots', () => {
    // initial[0] + count1 + count2 = 3 entries > max 2, so the oldest (initial)
    // is dropped, goalkeeping exactly the two most recent in order.
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true, maxHistorySize: 2 });
    sm.updateState(d => { d.count = 1; });
    sm.updateState(d => { d.count = 2; });
    const h = sm.getHistory();
    expect(h).toHaveLength(2);
    expect(h[0].state.count).toBe(1);                 // oldest kept
    expect(h[1].state.count).toBe(2);                 // newest kept
  });

  test('given history then reset restores the first historical state', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'init' }, { enableHistory: true });
    sm.updateState(d => { d.count = 5; });
    sm.reset();
    expect(sm.getState().count).toBe(0);
  });

  test('given no history then reset leaves state unchanged and does not throw', () => {
    const sm = new StateManager<SimpleState>({ count: 7, message: 'x' });
    expect(() => sm.reset()).not.toThrow();
    expect(sm.getState().count).toBe(7);
  });

  test('given a valid snapshot id then restoreFromHistory restores it and returns true', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    const id = sm.createSnapshot();
    sm.updateState(d => { d.count = 42; });
    expect(sm.restoreFromHistory(id)).toBe(true);
    expect(sm.getState().count).toBe(0);
  });

  test('given an unknown snapshot id then restoreFromHistory returns false and keeps state', () => {
    const sm = new StateManager<SimpleState>({ count: 5, message: 'a' }, { enableHistory: true });
    expect(sm.restoreFromHistory('does-not-exist')).toBe(false);
    expect(sm.getState().count).toBe(5);
  });

  test('given exactly two history entries then undo reverts to the previous state', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    sm.updateState(d => { d.count = 1; });  // history: [0, 1]
    expect(sm.undo()).toBe(true);
    expect(sm.getState().count).toBe(0);
  });

  test('given fewer than two history entries then undo returns false', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
    expect(sm.undo()).toBe(false);
  });

  test('given enableHistory then createSnapshot appends to history and returns its id', () => {
    const sm = new StateManager<SimpleState>({ count: 1, message: 'a' }, { enableHistory: true });
    const before = sm.getHistory().length;
    const id = sm.createSnapshot();
    expect(sm.getHistory()).toHaveLength(before + 1);
    expect(sm.getHistory().some(s => s.id === id)).toBe(true);
  });

  test('given history disabled then createSnapshot returns an id without recording it', () => {
    const sm = new StateManager<SimpleState>({ count: 1, message: 'a' });
    const id = sm.createSnapshot();
    expect(id).toMatch(/^snapshot-/);
    expect(sm.getHistory()).toEqual([]);
  });

  test('given two snapshots then their generated ids are unique and well-formed', () => {
    const sm = new StateManager<SimpleState>({ count: 1, message: 'a' }, { enableHistory: true });
    const id1 = sm.createSnapshot();
    const id2 = sm.createSnapshot();
    expect(id1).not.toBe(id2);
    // `snapshot-<timestamp>-<base36 suffix>`; the suffix is sliced to drop the
    // leading "0." so it must not contain a dot.
    expect(id1).toMatch(/^snapshot-\d+-[0-9a-z]+$/);
  });

  describe('clearHistory', () => {
    test('given enableHistory then clearHistory keeps only the current state', () => {
      const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enableHistory: true });
      sm.updateState(d => { d.count = 1; });
      sm.updateState(d => { d.count = 2; });
      sm.clearHistory();
      const h = sm.getHistory();
      expect(h).toHaveLength(1);
      expect(h[0].state.count).toBe(2);
    });

    test('given history disabled then clearHistory empties history', () => {
      const sm = new StateManager<SimpleState>({ count: 0, message: 'a' });
      sm.clearHistory();
      expect(sm.getHistory()).toEqual([]);
    });
  });
});

describe('StateManager updateState merge & deepClone:', () => {
  beforeEach(() => mockLocalStorage.clear());

  test('given an updater that returns a partial object then merges it into state', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'keep' });
    sm.updateState(() => ({ count: 99 }));
    expect(sm.getState().count).toBe(99);
    expect(sm.getState().message).toBe('keep');
  });

  test('given state with Date, null and nested arrays then getState deep-clones them', () => {
    const now = new Date('2020-01-01T00:00:00Z');
    const sm = new StateManager<{ when: Date; missing: null; tags: string[]; n: number }>({
      when: now, missing: null, tags: ['a', 'b'], n: 5,
    });

    const s = sm.getState();
    expect(s.when).toEqual(now);
    expect(s.when instanceof Date).toBe(true);
    expect(s.when).not.toBe(now);          // cloned, not the same instance
    expect(s.missing).toBeNull();
    expect(s.n).toBe(5);

    s.tags.push('c');
    expect(sm.getState().tags).toEqual(['a', 'b']); // internal array untouched
  });
});

describe('StateManager listener notification:', () => {
  beforeEach(() => mockLocalStorage.clear());

  test('given debounceMs then listeners fire only after the delay', () => {
    vi.useFakeTimers();
    try {
      const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { debounceMs: 100 });
      let called = 0;
      sm.subscribe(() => { called++; });
      sm.updateState(d => { d.count = 1; });
      expect(called).toBe(0);            // not fired synchronously
      vi.advanceTimersByTime(100);
      expect(called).toBe(1);            // fired after the delay
    } finally {
      vi.useRealTimers();
    }
  });

  test('given a throwing listener (sync) then others still run and the error is logged', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let okCalled = 0;
    sm.subscribe(() => { throw new Error('boom'); });
    sm.subscribe(() => { okCalled++; });

    expect(() => sm.updateState(d => { d.count = 1; })).not.toThrow();
    expect(okCalled).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('Error in state listener:', expect.any(Error));
    errSpy.mockRestore();
  });

  test('given a throwing listener with debounce then the error is caught after the delay', () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { debounceMs: 50 });
      sm.subscribe(() => { throw new Error('boom'); });
      sm.updateState(d => { d.count = 1; });
      expect(() => vi.advanceTimersByTime(50)).not.toThrow();
      expect(errSpy).toHaveBeenCalledWith('Error in state listener:', expect.any(Error));
    } finally {
      errSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('StateManager persistence internals:', () => {
  beforeEach(() => mockLocalStorage.clear());

  test('given persistence without an explicit key then saves under the default key', () => {
    const sm = new StateManager<SimpleState>({ count: 7, message: 'a' }, { enablePersistence: true });
    sm.updateState(d => { d.count = 8; });
    expect(mockLocalStorage.getItem('state-manager')).not.toBeNull();
  });

  test('given persistence disabled then nothing is written to localStorage', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' });
    sm.updateState(d => { d.count = 1; });
    expect(mockLocalStorage.store.size).toBe(0);
  });

  test('given persistence without history then the stored history is an empty array', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enablePersistence: true, persistenceKey: 'no-hist' });
    sm.updateState(d => { d.count = 1; });
    const stored = JSON.parse(assertDefined(mockLocalStorage.getItem('no-hist'), 'no-hist not stored'));
    expect(stored.history).toEqual([]);
  });

  test('given persistence and history then history is persisted and reloaded', () => {
    const key = 'persist-history';
    const sm1 = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enablePersistence: true, enableHistory: true, persistenceKey: key });
    sm1.updateState(d => { d.count = 1; });

    const sm2 = new StateManager<SimpleState>({ count: 0, message: 'x' }, { enablePersistence: true, enableHistory: true, persistenceKey: key });
    expect(sm2.getState().count).toBe(1);
    // Loaded history (initial + update) replaces the single seeded snapshot, so
    // the length must reflect the persisted entries, not just the seed.
    expect(sm2.getHistory().length).toBe(2);
  });

  test('given history disabled on load then persisted history is ignored', () => {
    const key = 'persist-nohist-load';
    const sm1 = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enablePersistence: true, enableHistory: true, persistenceKey: key });
    sm1.updateState(d => { d.count = 1; });

    const sm2 = new StateManager<SimpleState>({ count: 0, message: 'x' }, { enablePersistence: true, persistenceKey: key });
    expect(sm2.getState().count).toBe(1);   // state still restored
    expect(sm2.getHistory()).toEqual([]);   // but history ignored
  });

  test('given persistence disabled then a pre-existing stored state is ignored', () => {
    mockLocalStorage.setItem('state-manager', JSON.stringify({ state: { count: 999, message: 'stale' }, history: [], timestamp: 0 }));
    const sm = new StateManager<SimpleState>({ count: 0, message: 'fresh' });
    expect(sm.getState().count).toBe(0);   // loadFromPersistence must not run
  });

  test('given history disabled then setState does not record history', () => {
    const sm = new StateManager<SimpleState>({ count: 0, message: 'a' });
    sm.updateState(d => { d.count = 1; });
    expect(sm.getHistory()).toEqual([]);
  });

  test('given a stored payload without a state field then nothing is loaded', () => {
    const key = 'no-state-field';
    mockLocalStorage.setItem(key, JSON.stringify({ history: [], timestamp: 0 }));
    const sm = new StateManager<SimpleState>({ count: 5, message: 'fresh' }, { enablePersistence: true, persistenceKey: key });
    expect(sm.getState().count).toBe(5);   // initial state preserved
  });

  test('given corrupt stored data then load fails gracefully with a warning', () => {
    const key = 'corrupt';
    mockLocalStorage.setItem(key, 'not-valid-json{');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => new StateManager<SimpleState>({ count: 1, message: 'a' }, { enablePersistence: true, persistenceKey: key }))
      .not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Failed to load state from persistence:', expect.any(Error));
    warnSpy.mockRestore();
  });

  test('given a save failure then it is caught and logged without throwing', () => {
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => { throw new Error('quota'); };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const sm = new StateManager<SimpleState>({ count: 1, message: 'a' }, { enablePersistence: true, persistenceKey: 'save-fail' });
      expect(() => sm.updateState(d => { d.count = 2; })).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith('Failed to save state to persistence:', expect.any(Error));
    } finally {
      mockLocalStorage.setItem = originalSetItem;
      warnSpy.mockRestore();
    }
  });

  test('given no localStorage available then persistence is a silent no-op', () => {
    const saved = globalThis.localStorage;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // @ts-expect-error - simulate an environment without localStorage
      delete globalThis.localStorage;
      expect(() => {
        const sm = new StateManager<SimpleState>({ count: 0, message: 'a' }, { enablePersistence: true, persistenceKey: 'k' });
        sm.updateState(d => { d.count = 1; });
      }).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();   // guard returned early; no failed access
    } finally {
      globalThis.localStorage = saved;
      warnSpy.mockRestore();
    }
  });
});
