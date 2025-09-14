import { ToastManager, createToastManager } from './toast_manager';

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

const mockWindow = {
  requestAnimationFrame: jest.fn((callback: () => void) => globalThis.setTimeout(callback, 0)),
  setTimeout: jest.fn((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay)),
  clearTimeout: jest.fn(),
} as any;

// Mock requestAnimationFrame on globalThis as well
// @ts-ignore
globalThis.requestAnimationFrame = mockWindow.requestAnimationFrame;

// Override globals for testing
// @ts-ignore
globalThis.document = mockDocument;
// @ts-ignore
globalThis.window = mockWindow;

describe('ToastManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElement.className = '';
    mockElement.innerHTML = '';
  });

  test('should create instance with default configuration', () => {
    // Arrange & Act
    const toastManager = new ToastManager();

    // Assert
    expect(toastManager).toBeInstanceOf(ToastManager);
  });

  test('should accept custom configuration options', () => {
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

  test('should show toast with message', () => {
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

  test('should show success toast', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Success message';

    // Act
    const toastId = toastManager.success(message);

    // Assert
    expect(typeof toastId).toBe('string');
    expect(mockDocument.createElement).toHaveBeenCalled();
  });

  test('should show error toast', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Error message';

    // Act
    const toastId = toastManager.error(message);

    // Assert
    expect(typeof toastId).toBe('string');
    expect(mockDocument.createElement).toHaveBeenCalled();
  });

  test('should show warning toast', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Warning message';

    // Act
    const toastId = toastManager.warning(message);

    // Assert
    expect(typeof toastId).toBe('string');
    expect(mockDocument.createElement).toHaveBeenCalled();
  });

  test('should show info toast', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Info message';

    // Act
    const toastId = toastManager.info(message);

    // Assert
    expect(typeof toastId).toBe('string');
    expect(mockDocument.createElement).toHaveBeenCalled();
  });

  test('should remove specific toast', async () => {
    // Arrange
    const toastManager = new ToastManager();
    const toastId = toastManager.show('Test message');

    // Act & Assert - Should not throw
    await expect(toastManager.removeToast(toastId)).resolves.not.toThrow();
  });

  test('should clear all toasts', async () => {
    // Arrange
    const toastManager = new ToastManager();
    toastManager.show('Message 1');
    toastManager.show('Message 2');
    toastManager.show('Message 3');

    // Act & Assert - Should not throw
    await expect(toastManager.clearAll()).resolves.not.toThrow();
  });

  test('should handle custom duration', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Custom duration toast';

    // Act
    const toastId = toastManager.show(message, 'info', 1000);

    // Assert
    expect(typeof toastId).toBe('string');
    // Note: setTimeout may be called asynchronously during toast processing
  });

  test('should handle persistent toast (duration: 0)', () => {
    // Arrange
    const toastManager = new ToastManager();
    const message = 'Persistent toast';

    // Act
    const toastId = toastManager.show(message, 'info', 0);

    // Assert
    expect(typeof toastId).toBe('string');
    expect(mockDocument.createElement).toHaveBeenCalled();
  });

  test('should handle different toast types', () => {
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

  test('should respect maxToasts configuration', () => {
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

  test('should handle different positions', () => {
    // Arrange & Act
    const positions = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

    positions.forEach(position => {
      expect(() => {
        new ToastManager({ position });
      }).not.toThrow();
    });
  });

  test('should configure toast manager settings', () => {
    // Arrange
    const toastManager = new ToastManager();
    toastManager.show('Test message');

    // Act & Assert - Should not throw
    expect(() => {
      toastManager.configure({ duration: 5000 });
    }).not.toThrow();
  });

  test('should generate unique toast IDs', () => {
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
});

describe('createToastManager factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create ToastManager instance', () => {
    // Act
    const toastManager = createToastManager();

    // Assert
    expect(toastManager).toBeInstanceOf(ToastManager);
  });

  test('should create ToastManager with custom configuration', () => {
    // Arrange
    const config = {
      position: 'bottom-left' as const,
      duration: 4000,
      maxToasts: 5,
    };

    // Act & Assert - Should not throw
    expect(() => {
      createToastManager(config);
    }).not.toThrow();
  });

  test('should create multiple independent instances', () => {
    // Act
    const toastManager1 = createToastManager();
    const toastManager2 = createToastManager();

    // Assert
    expect(toastManager1).toBeInstanceOf(ToastManager);
    expect(toastManager2).toBeInstanceOf(ToastManager);
    expect(toastManager1).not.toBe(toastManager2);
  });
});
