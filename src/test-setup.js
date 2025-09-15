// Suppress expected console warnings during tests
const originalConsoleWarn = console.warn;

beforeEach(() => {
  console.warn = (message, ...args) => {
    // Suppress expected warnings from state manager tests
    if (typeof message === 'string' && message.includes('Failed to save state to persistence')) {
      return;
    }

    // Call original console.warn for other messages
    originalConsoleWarn(message, ...args);
  };
});

afterEach(() => {
  // Restore original console.warn after each test
  console.warn = originalConsoleWarn;
});