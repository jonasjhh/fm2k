import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the Jest results JSON
const resultsPath = path.join(__dirname, 'dist', 'test-results.json');
const detailedOutputPath = path.join(__dirname, 'dist', 'test-results.html');
const dashboardOutputPath = path.join(__dirname, 'dist', 'index.html');
const dashboardJsPath = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(resultsPath)) {
  console.log('No test results found. Run tests first.');
  process.exit(0);
}

const jestResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

// Parse results
function parseJestResults(jestResults) {
  const suites = jestResults.testResults.map((result) => {
    const tests = result.assertionResults.map((assertion) => ({
      name: assertion.title,
      status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
      duration: assertion.duration || 0,
      error: assertion.failureMessages?.[0]
    }));

    return {
      name: (result.testFilePath || result.name || 'unknown').split('/').pop().replace('.ts', ''),
      tests,
      totalTests: result.numTotalTests,
      passedTests: result.numPassingTests,
      failedTests: result.numFailingTests,
      skippedTests: result.numPendingTests,
      duration: result.perfStats?.end - result.perfStats?.start || 0
    };
  });

  return {
    summary: {
      totalSuites: jestResults.numTotalTestSuites,
      totalTests: jestResults.numTotalTests,
      passedTests: jestResults.numPassedTests,
      failedTests: jestResults.numFailedTests,
      skippedTests: jestResults.numPendingTests,
      duration: jestResults.testResults.reduce((sum, result) =>
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0),
      success: jestResults.success
    },
    suites,
    timestamp: new Date().toISOString()
  };
}

function generateTestResultsHTML(report) {
  const statusColor = (status) => {
    switch (status) {
      case 'passed': return '#28a745';
      case 'failed': return '#dc3545';
      case 'skipped': return '#ffc107';
      default: return '#6c757d';
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⚠️';
      default: return '❓';
    }
  };

  return `<!DOCTYPE html>
<html>
<head>
  <title>Test Results</title>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .test-results { max-width: 800px; }
    .test-summary { margin-bottom: 20px; padding: 15px; border-radius: 5px; }
    .test-suite { margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .suite-header { padding: 10px; background-color: #f8f9fa; font-weight: bold; }
    .test-item { padding: 5px 10px; border-bottom: 1px solid #eee; }
    .error { color: #dc3545; font-size: 0.9em; margin-top: 5px; padding: 5px; background-color: #f8f9fa; }
  </style>
</head>
<body>
  <div class="test-results">
    <h1>Test Results</h1>
    <div class="test-summary" style="background-color: ${report.summary.success ? '#d4edda' : '#f8d7da'};">
      <h2>Summary</h2>
      <p><strong>Status:</strong> ${report.summary.success ? '✅ All tests passed' : '❌ Some tests failed'}</p>
      <p><strong>Total Tests:</strong> ${report.summary.totalTests}</p>
      <p><strong>Passed:</strong> <span style="color: #28a745;">${report.summary.passedTests}</span></p>
      <p><strong>Failed:</strong> <span style="color: #dc3545;">${report.summary.failedTests}</span></p>
      <p><strong>Skipped:</strong> <span style="color: #ffc107;">${report.summary.skippedTests}</span></p>
      <p><strong>Duration:</strong> ${report.summary.duration}ms</p>
      <p><strong>Run at:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
    </div>

    ${report.suites.map(suite => `
      <div class="test-suite">
        <div class="suite-header">
          ${suite.name} (${suite.passedTests}/${suite.totalTests} passed)
        </div>
        <div>
          ${suite.tests.map(test => `
            <div class="test-item">
              <span style="color: ${statusColor(test.status)};">
                ${statusIcon(test.status)} ${test.name}
              </span>
              ${test.error ? `<div class="error">${test.error.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;
}

// Generate dashboard HTML
function generateDashboardHTML() {
  return `<body>
    <h1>FM2K - Component Test Dashboard</h1>
    <div style="margin: 20px 0;">
        <a href="test-results.html" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Test Results</a>
    </div>
    <div id="test-results"></div>
    <div id="version-hash"></div>
    <script type="module" src="./index.js"></script>
</body>`;
}

// Generate dashboard JavaScript
function generateDashboardJS() {
  return `// Load and display test results summary
async function loadTestResults() {
  try {
    const response = await fetch('./test-results.json');
    const testResults = await response.json();

    const summary = {
      totalTests: testResults.numTotalTests,
      passedTests: testResults.numPassedTests,
      failedTests: testResults.numFailedTests,
      success: testResults.success
    };

    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = \`
      <div style="padding: 15px; margin: 20px 0; border-radius: 5px; background-color: \${summary.success ? '#d4edda' : '#f8d7da'};">
        <h2>Latest Test Results Summary</h2>
        <p><strong>Status:</strong> \${summary.success ? '✅ All tests passed' : '❌ Some tests failed'}</p>
        <p><strong>Total:</strong> \${summary.totalTests} tests</p>
        <p><strong>Passed:</strong> <span style="color: #28a745;">\${summary.passedTests}</span></p>
        <p><strong>Failed:</strong> <span style="color: #dc3545;">\${summary.failedTests}</span></p>
        <p style="margin-top: 10px;">
          <a href="test-results.html" style="color: #007bff;">View detailed results →</a>
        </p>
      </div>
    \`;
  } catch (error) {
    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = \`
      <div style="padding: 15px; margin: 20px 0; border-radius: 5px; background-color: #f8f9fa; border: 1px solid #dee2e6;">
        <h2>Test Results</h2>
        <p>No test results available. Run tests to see results.</p>
      </div>
    \`;
  }
}

// Load version information
function loadVersionInfo() {
  const versionDiv = document.getElementById('version-hash');
  versionDiv.innerHTML = \`
    <div style="margin-top: 30px; padding: 10px; background-color: #f8f9fa; border-radius: 5px; font-family: monospace; font-size: 0.9em;">
      <strong>Built:</strong> \${new Date().toLocaleString()}
    </div>
  \`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTestResults();
  loadVersionInfo();
});`;
}

const report = parseJestResults(jestResults);
const detailedHtml = generateTestResultsHTML(report);
const dashboardHtml = generateDashboardHTML();
const dashboardJs = generateDashboardJS();

// Write all files
fs.writeFileSync(detailedOutputPath, detailedHtml);
fs.writeFileSync(dashboardOutputPath, dashboardHtml);
fs.writeFileSync(dashboardJsPath, dashboardJs);

console.log(`Test results HTML generated at: ${detailedOutputPath}`);
console.log(`Dashboard HTML generated at: ${dashboardOutputPath}`);
console.log(`Dashboard JS generated at: ${dashboardJsPath}`);