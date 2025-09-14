// Simple Node.js test runner entry point
import { testRunner } from './test-runner.js';

// Import and run all test files
async function runTests() {
    await import('./timeline/timeline_test.js');
    await import('./name-generator/name_generator_test.js');
    await import('./event-bus/eventBus_tests.js');
    await import('./toast-manager/toast_manager_tests.js');
    await import('./state-manager/state_manager_tests.js');
    await import('./match-simulator/matchSimulator_tests.js');
    await testRunner.runAllTests();
}

runTests().catch(console.error);