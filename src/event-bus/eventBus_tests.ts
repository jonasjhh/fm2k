import { EventBus } from './eventBus';

describe('EventBus:', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('.on() and .emit()', () => {
    test('given listener registered for event when event is emitted then should execute callback with correct data', () => {
      // Arrange
      const testEventName = 'user-login';
      const testEventData = 'user123';
      let wasCallbackExecuted = false;
      let actualReceivedData: string | undefined;

      const eventListener = (data: string) => {
        wasCallbackExecuted = true;
        actualReceivedData = data;
      };

      eventBus.on(testEventName, eventListener);

      // Act
      eventBus.emit(testEventName, testEventData);

      // Assert
      expect(wasCallbackExecuted).toBe(true);
      expect(actualReceivedData).toBe(testEventData);
    });

    test('given multiple listeners registered for same event when event is emitted then should execute all callbacks', () => {
      // Arrange
      const eventName = 'notification-sent';
      const eventData = { message: 'Hello World', userId: 42 };
      let callback1Executed = false;
      let callback2Executed = false;
      let callback1Data: any;
      let callback2Data: any;

      const listener1 = (data: any) => {
        callback1Executed = true;
        callback1Data = data;
      };

      const listener2 = (data: any) => {
        callback2Executed = true;
        callback2Data = data;
      };

      eventBus.on(eventName, listener1);
      eventBus.on(eventName, listener2);

      // Act
      eventBus.emit(eventName, eventData);

      // Assert
      expect(callback1Executed).toBe(true);
      expect(callback2Executed).toBe(true);
      expect(callback1Data).toEqual(eventData);
      expect(callback2Data).toEqual(eventData);
    });

    test('given same listener registered multiple times when event is emitted then should execute listener multiple times', () => {
      // Arrange
      const eventName = 'duplicate-test';
      const eventData = 'test-data';
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      eventBus.on(eventName, listener);
      eventBus.on(eventName, listener);

      // Act
      eventBus.emit(eventName, eventData);

      // Assert
      expect(callCount).toBe(2);
    });

    test('given no listeners for event when event is emitted then should not throw error', () => {
      // Arrange & Act
      expect(() => {
        eventBus.emit('non-existent-event', 'some data');
      }).not.toThrow();
    });
  });

  describe('.off()', () => {
    test('given listener registered and then removed when event is emitted then should not execute callback', () => {
      // Arrange
      const eventName = 'user-logout';
      const eventData = 'user456';
      let wasCallbackExecuted = false;

      const eventListener = () => {
        wasCallbackExecuted = true;
      };

      eventBus.on(eventName, eventListener);
      eventBus.off(eventName, eventListener);

      // Act
      eventBus.emit(eventName, eventData);

      // Assert
      expect(wasCallbackExecuted).toBe(false);
    });

    test('given same listener registered multiple times and off called once when event is emitted then should only remove first instance of listener', () => {
      // Arrange
      const eventName = 'remove-test';
      const eventData = 'test-data';
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      eventBus.on(eventName, listener);
      eventBus.on(eventName, listener);
      eventBus.off(eventName, listener);

      // Act
      eventBus.emit(eventName, eventData);

      // Assert
      expect(callCount).toBe(1); // Only one instance should remain
    });
  });
});
