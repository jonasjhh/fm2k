// Simple Node.js test runner entry point
import { testRunner } from './test-runner.js';

// Import and run all test files
async function runTests() {
    await import('./timeline/timeline_test.js');
    await import('./name-generator/name_generator_test.js');
    await testRunner.runAllTests();
}

runTests().catch(console.error);