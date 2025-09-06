import { testRunner } from './test-runner.js';
import './example-component/example_component_test.js';

// Generate a simple build hash from current timestamp
const buildTime = new Date().toISOString();
const buildHash = btoa(buildTime).slice(0, 8);
console.log('🚀 Build loaded:', buildTime);
console.log('📦 Build hash:', buildHash);

document.addEventListener('DOMContentLoaded', () => {
    testRunner.runAllTests();

    // Add build hash to bottom of page
    const versionDiv = document.getElementById('version-hash');
    if (versionDiv) {
        versionDiv.textContent = `build: ${buildHash}`;
    }
});