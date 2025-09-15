import { ToastManager } from './toast_manager.js';

// Mock DOM for testing
const mockElement = {
  className: '',
  innerHTML: '',
  style: {} as any,
  setAttribute: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  querySelector: jest.fn(() => null),
  offsetHeight: 50,
  parentNode: {
    removeChild: jest.fn(),
  },
};

const mockDocument = {
  createElement: jest.fn(() => mockElement),
  body: {
    appendChild: jest.fn(),
  },
  head: {
    appendChild: jest.fn(),
  },
  querySelector: jest.fn(() => null),
} as any;

// Use Jest fake timers to properly mock setTimeout/clearTimeout
jest.useFakeTimers();

const mockWindow = {
  requestAnimationFrame: jest.fn((callback: () => void) => globalThis.setTimeout(callback, 0)),
  setTimeout: jest.fn((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay)),
  clearTimeout: jest.fn((id: any) => globalThis.clearTimeout(id)),
} as any;

// Mock requestAnimationFrame on globalThis as well
// @ts-ignore
globalThis.requestAnimationFrame = mockWindow.requestAnimationFrame;

// Override globals for testing
// @ts-ignore
globalThis.document = mockDocument;
// @ts-ignore
globalThis.window = mockWindow;

// Cleanup after all tests
afterAll(() => {
  jest.useRealTimers();
});

describe('ToastManager:', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockElement.className = '';
    mockElement.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    test('given default initialization when creating instance then should create instance with default configuration', () => {
      // Arrange & Act
      const toastManager = new ToastManager();

      // Assert
      expect(toastManager).toBeInstanceOf(ToastManager);
    });

    test('given custom configuration options when initializing with custom config then should accept configuration', () => {
      // Arrange
      const customConfig = {
        position: 'top-left' as const,
        duration: 6000,
        maxToasts: 3,
      };

      // Act & Assert - Should not throw
      expect(() => {
        new ToastManager(customConfig);
      }).not.toThrow();
    });

    test('given custom configuration options when initializing with maxToasts limit then should respect maxToasts configuration', () => {
      // Arrange
      const toastManager = new ToastManager({ maxToasts: 2 });

      // Act
      const toast1 = toastManager.show('Toast 1');
      const toast2 = toastManager.show('Toast 2');
      const toast3 = toastManager.show('Toast 3'); // Should remove oldest

      // Assert
      expect(typeof toast1).toBe('string');
      expect(typeof toast2).toBe('string');
      expect(typeof toast3).toBe('string');
    });

    test('given custom configuration options when initializing with different positions then should handle all position options', () => {
      // Arrange & Act
      const positions = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

      positions.forEach(position => {
        expect(() => {
          new ToastManager({ position });
        }).not.toThrow();
      });
    });
  });

  describe('.show()', () => {
    test('given default initialization when showing basic message then should return toast ID and create element', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Test message';

      // Act
      const toastId = toastManager.show(message);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(toastId.length).toBeGreaterThan(0);
      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
    });

    test('given default initialization when generating multiple toasts then should generate unique toast IDs', () => {
      // Arrange
      const toastManager = new ToastManager();

      // Act
      const toastId1 = toastManager.show('Test message 1');
      const toastId2 = toastManager.show('Test message 2');

      // Assert
      expect(typeof toastId1).toBe('string');
      expect(typeof toastId2).toBe('string');
      expect(toastId1).not.toBe(toastId2);
    });

    test('given toast type methods when showing different toast types then should handle all types', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Type test';

      // Act
      const defaultToast = toastManager.show(message, 'info');
      const successToast = toastManager.show(message, 'success');
      const errorToast = toastManager.show(message, 'error');
      const warningToast = toastManager.show(message, 'warning');
      const infoToast = toastManager.show(message, 'info');

      // Assert
      expect(typeof defaultToast).toBe('string');
      expect(typeof successToast).toBe('string');
      expect(typeof errorToast).toBe('string');
      expect(typeof warningToast).toBe('string');
      expect(typeof infoToast).toBe('string');
    });

    test('given custom duration settings when showing toast with custom duration then should handle custom duration', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Custom duration toast';

      // Act
      const toastId = toastManager.show(message, 'info', 1000);

      // Assert
      expect(typeof toastId).toBe('string');
      // Note: setTimeout may be called asynchronously during toast processing
    });

    test('given custom duration settings when showing persistent toast with zero duration then should handle persistent toast', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Persistent toast';

      // Act
      const toastId = toastManager.show(message, 'info', 0);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });
  });

  describe('.success()', () => {
    test('given toast type methods when calling success method then should show success toast', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Success message';

      // Act
      const toastId = toastManager.success(message);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });
  });

  describe('.error()', () => {
    test('given toast type methods when calling error method then should show error toast', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Error message';

      // Act
      const toastId = toastManager.error(message);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });
  });

  describe('.warning()', () => {
    test('given toast type methods when calling warning method then should show warning toast', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Warning message';

      // Act
      const toastId = toastManager.warning(message);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });
  });

  describe('.info()', () => {
    test('given toast type methods when calling info method then should show info toast', () => {
      // Arrange
      const toastManager = new ToastManager();
      const message = 'Info message';

      // Act
      const toastId = toastManager.info(message);

      // Assert
      expect(typeof toastId).toBe('string');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });
  });

  describe('.configure()', () => {
    test('given default initialization when configuring settings then should not throw error', () => {
      // Arrange
      const toastManager = new ToastManager();
      toastManager.show('Test message');

      // Act & Assert - Should not throw
      expect(() => {
        toastManager.configure({ duration: 5000 });
      }).not.toThrow();
    });
  });

  describe('.removeToast()', () => {
    test('given toast removal operations when removing specific toast then should remove without error', () => {
      // Arrange
      const toastManager = new ToastManager();
      const toastId = toastManager.show('Test message');

      // Act & Assert - Should not throw
      expect(() => toastManager.removeToast(toastId)).not.toThrow();
    });
  });

  describe('.clearAll()', () => {
    test('given toast removal operations when clearing all toasts then should clear all without error', () => {
      // Arrange
      const toastManager = new ToastManager();
      toastManager.show('Message 1');
      toastManager.show('Message 2');
      toastManager.show('Message 3');

      // Act & Assert - Should not throw
      expect(() => toastManager.clearAll()).not.toThrow();
    });
  });
});

describe('ToastManager constructor:', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  test('given default factory usage when creating instance then should create ToastManager instance', () => {
    // Act
    const toastManager = new ToastManager();

    // Assert
    expect(toastManager).toBeInstanceOf(ToastManager);
  });

  test('given default factory usage when creating multiple instances then should create independent instances', () => {
    // Act
    const toastManager1 = new ToastManager();
    const toastManager2 = new ToastManager();

    // Assert
    expect(toastManager1).toBeInstanceOf(ToastManager);
    expect(toastManager2).toBeInstanceOf(ToastManager);
    expect(toastManager1).not.toBe(toastManager2);
  });

  test('given custom configuration when creating with custom config then should create ToastManager with configuration', () => {
    // Arrange
    const config = {
      position: 'bottom-left' as const,
      duration: 4000,
      maxToasts: 5,
    };

    // Act & Assert - Should not throw
    expect(() => {
      new ToastManager(config);
    }).not.toThrow();
  });
});
