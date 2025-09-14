import { StateManager, createStateManager } from './state_manager';

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

describe('StateManager', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  test('should create instance with initial state', () => {
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

  test('should update state with function updater', () => {
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

  test('should update state with object updater', () => {
    // Arrange
    const stateManager = new StateManager<SimpleState>({ count: 3, message: 'initial' });

    // Act
    stateManager.updateState(draft => { draft.count = 7; });
    const newState = stateManager.getState();

    // Assert
    expect(newState.count).toBe(7);
    expect(newState.message).toBe('initial'); // Should preserve other properties
  });

  test('should notify subscribers when state changes', () => {
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
    expect(lastReceivedState).toBeTruthy();
    // Use type assertion since we know it's not null from the test above
    const state = lastReceivedState!;
    expect(state.count).toBe(5);
    expect(state.message).toBe('test');

    // Cleanup
    unsubscribe();
  });

  test('should not notify unsubscribed listeners', () => {
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

  test('should handle complex nested state updates', () => {
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

  test('should persist and restore state from localStorage', () => {
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

  test('should handle localStorage errors gracefully', () => {
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

  test('should support multiple subscribers', () => {
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

describe('createStateManager factory', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  test('should create StateManager instance with initial state', () => {
    // Arrange & Act
    const stateManager = createStateManager<SimpleState>({ count: 10, message: 'factory' });
    const state = stateManager.getState();

    // Assert
    expect(state.count).toBe(10);
    expect(state.message).toBe('factory');
  });

  test('should create StateManager with persistence key', () => {
    // Arrange
    const initialState: SimpleState = { count: 20, message: 'persistent' };
    const key = 'factory-test';

    // Act
    const stateManager1 = createStateManager(initialState, { enablePersistence: true, persistenceKey: key });
    stateManager1.updateState(draft => { draft.count = 30; });

    const stateManager2 = createStateManager<SimpleState>({ count: 0, message: '' }, { enablePersistence: true, persistenceKey: key });
    const restoredState = stateManager2.getState();

    // Assert
    expect(restoredState.count).toBe(30);
    expect(restoredState.message).toBe('persistent');
  });
});
