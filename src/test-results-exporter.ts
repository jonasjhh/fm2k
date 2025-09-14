export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface TestSuite {
  name: string;
  tests: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
}

export interface TestReport {
  summary: {
    totalSuites: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    success: boolean;
  };
  suites: TestSuite[];
  timestamp: string;
}

export function parseJestResults(jestResults: any): TestReport {
  const suites: TestSuite[] = jestResults.testResults.map((result: any) => {
    const tests: TestResult[] = result.assertionResults.map((assertion: any) => ({
      name: assertion.title,
      status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
      duration: assertion.duration || 0,
      error: assertion.failureMessages?.[0]
    }));

    return {
      name: result.testFilePath.split('/').pop().replace('.ts', ''),
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
      duration: jestResults.testResults.reduce((sum: number, result: any) =>
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0),
      success: jestResults.success
    },
    suites,
    timestamp: new Date().toISOString()
  };
}

export function generateTestResultsHTML(report: TestReport): string {
  const statusColor = (status: string) => {
    switch (status) {
      case 'passed': return '#28a745';
      case 'failed': return '#dc3545';
      case 'skipped': return '#ffc107';
      default: return '#6c757d';
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⚠️';
      default: return '❓';
    }
  };

  return `
    <div class="test-results">
      <h2>Test Results</h2>
      <div class="test-summary" style="margin-bottom: 20px; padding: 15px; border-radius: 5px; background-color: ${report.summary.success ? '#d4edda' : '#f8d7da'};">
        <h3>Summary</h3>
        <p><strong>Status:</strong> ${report.summary.success ? '✅ All tests passed' : '❌ Some tests failed'}</p>
        <p><strong>Total Tests:</strong> ${report.summary.totalTests}</p>
        <p><strong>Passed:</strong> <span style="color: #28a745;">${report.summary.passedTests}</span></p>
        <p><strong>Failed:</strong> <span style="color: #dc3545;">${report.summary.failedTests}</span></p>
        <p><strong>Skipped:</strong> <span style="color: #ffc107;">${report.summary.skippedTests}</span></p>
        <p><strong>Duration:</strong> ${report.summary.duration}ms</p>
        <p><strong>Run at:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
      </div>

      ${report.suites.map(suite => `
        <div class="test-suite" style="margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px;">
          <div style="padding: 10px; background-color: #f8f9fa; font-weight: bold;">
            ${suite.name} (${suite.passedTests}/${suite.totalTests} passed)
          </div>
          <div style="padding: 10px;">
            ${suite.tests.map(test => `
              <div style="padding: 5px 0; border-bottom: 1px solid #eee;">
                <span style="color: ${statusColor(test.status)};">
                  ${statusIcon(test.status)} ${test.name}
                </span>
                ${test.error ? `<div style="color: #dc3545; font-size: 0.9em; margin-top: 5px; padding: 5px; background-color: #f8f9fa;">${test.error}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}