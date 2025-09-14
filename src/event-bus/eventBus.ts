type EventCallback<T = any> = (data: T) => void;

interface EventListeners {
  [event: string]: EventCallback[];
}

export class EventBus {
  private listeners: EventListeners = {};
  private eventQueue: Array<{ event: string; data: any }> = [];
  private processing = false;

  on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners[event]) {return;}
    const index = this.listeners[event].indexOf(callback);
    if (index > -1) {
      this.listeners[event].splice(index, 1);
    }
  }

  emit<T = any>(event: string, data?: T): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

export const eventBus = new EventBus();
