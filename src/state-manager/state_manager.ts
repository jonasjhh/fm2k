export type StateListener<T> = (newState: T, previousState: T) => void;

export interface StateOptions {
  enableHistory?: boolean;
  maxHistorySize?: number;
  enablePersistence?: boolean;
  persistenceKey?: string;
  debounceMs?: number;
}

export interface StateSnapshot<T> {
  state: T;
  timestamp: number;
  id: string;
}

export class StateManager<T extends Record<string, any>> {
  private state: T;
  private listeners: Set<StateListener<T>> = new Set();
  private history: StateSnapshot<T>[] = [];
  private options: Required<StateOptions>;

  constructor(initialState: T, options: StateOptions = {}) {
    this.options = {
      enableHistory: false,
      maxHistorySize: 50,
      enablePersistence: false,
      persistenceKey: 'state-manager',
      debounceMs: 0,
      ...options,
    };

    this.state = this.deepClone(initialState);

    if (this.options.enableHistory) {
      this.addToHistory(this.state);
    }

    if (this.options.enablePersistence) {
      this.loadFromPersistence();
    }
  }

  getState(): T {
    return this.deepClone(this.state);
  }

  updateState(updater: (draft: T) => void | Partial<T>): void {
    const previousState = this.deepClone(this.state);
    const newState = this.deepClone(this.state);

    const result = updater(newState);
    if (result && typeof result === 'object') {
      Object.assign(newState, result);
    }

    this.setState(newState, previousState);
  }

  setState(newState: T, previousState?: T): void {
    const prev = previousState ?? this.deepClone(this.state);
    this.state = this.deepClone(newState);

    if (this.options.enableHistory) {
      this.addToHistory(this.state);
    }

    if (this.options.enablePersistence) {
      this.saveToPersistence();
    }

    this.notifyListeners(prev);
  }

  subscribe(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    const initialState = this.history.length > 0 ? this.history[0].state : this.state;
    this.setState(this.deepClone(initialState));
  }

  getHistory(): StateSnapshot<T>[] {
    return [...this.history];
  }

  restoreFromHistory(snapshotId: string): boolean {
    const snapshot = this.history.find(s => s.id === snapshotId);
    if (!snapshot) {return false;}

    this.setState(this.deepClone(snapshot.state));
    return true;
  }

  clearHistory(): void {
    this.history = [];
    if (this.options.enableHistory) {
      this.addToHistory(this.state);
    }
  }

  undo(): boolean {
    if (this.history.length < 2) {return false;}

    this.history.pop(); // Remove current state
    const previousSnapshot = this.history[this.history.length - 1];
    this.setState(this.deepClone(previousSnapshot.state));
    return true;
  }

  createSnapshot(): string {
    const snapshot: StateSnapshot<T> = {
      state: this.deepClone(this.state),
      timestamp: Date.now(),
      id: this.generateId(),
    };

    if (this.options.enableHistory) {
      this.history.push(snapshot);
      this.trimHistory();
    }

    return snapshot.id;
  }

  private addToHistory(state: T): void {
    const snapshot: StateSnapshot<T> = {
      state: this.deepClone(state),
      timestamp: Date.now(),
      id: this.generateId(),
    };

    this.history.push(snapshot);
    this.trimHistory();
  }

  private trimHistory(): void {
    if (this.history.length > this.options.maxHistorySize) {
      this.history = this.history.slice(-this.options.maxHistorySize);
    }
  }

  private notifyListeners(previousState: T): void {
    const currentState = this.deepClone(this.state);

    if (this.options.debounceMs > 0) {
      globalThis.setTimeout(() => {
        this.listeners.forEach(listener => {
          try {
            listener(currentState, previousState);
          } catch (error) {
            console.error('Error in state listener:', error);
          }
        });
      }, this.options.debounceMs);
    } else {
      this.listeners.forEach(listener => {
        try {
          listener(currentState, previousState);
        } catch (error) {
          console.error('Error in state listener:', error);
        }
      });
    }
  }

  private saveToPersistence(): void {
    if (typeof globalThis.localStorage === 'undefined') {return;}

    try {
      const stateData = {
        state: this.state,
        history: this.options.enableHistory ? this.history : [],
        timestamp: Date.now(),
      };
      globalThis.localStorage.setItem(this.options.persistenceKey, JSON.stringify(stateData));
    } catch (error) {
      console.warn('Failed to save state to persistence:', error);
    }
  }

  private loadFromPersistence(): void {
    if (typeof globalThis.localStorage === 'undefined') {return;}

    try {
      const saved = globalThis.localStorage.getItem(this.options.persistenceKey);
      if (!saved) {return;}

      const data = JSON.parse(saved);
      if (data.state) {
        this.state = data.state;
        if (this.options.enableHistory && data.history) {
          this.history = data.history;
        }
      }
    } catch (error) {
      console.warn('Failed to load state from persistence:', error);
    }
  }

  private deepClone<U>(obj: U): U {
    if (obj === null || typeof obj !== 'object') {return obj;}
    if (obj instanceof Date) {return new Date(obj.getTime()) as unknown as U;}
    if (obj instanceof Array) {return obj.map(item => this.deepClone(item)) as unknown as U;}
    if (typeof obj === 'object') {
      const cloned = {} as U;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  }

  private generateId(): string {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function createStateManager<T extends Record<string, any>>(initialState: T, options?: StateOptions): StateManager<T> {
  return new StateManager(initialState, options);
}
