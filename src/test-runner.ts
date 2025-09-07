export interface TestCase {
    name: string;
    fn: () => void | Promise<void>;
}

export interface TestResult {
    name: string;
    status: 'pass' | 'fail';
    duration: number;
    error?: string;
}

export class TestRunner {
    private tests: TestCase[] = [];
    private results: TestResult[] = [];
    private isNode: boolean;

    constructor() {
        this.isNode = typeof window === 'undefined';

        // Browser-specific setup
        if (!this.isNode) {
            this.setupResultsDisplay();
        }
    }

    private setupResultsDisplay(): void {
        const resultsElement = document.getElementById('test-results');
        if (resultsElement) {
            resultsElement.innerHTML = '<h2>Test Results</h2><div id="test-output"></div>';
        }
    }

    addTest(name: string, fn: () => void | Promise<void>): void {
        this.tests.push({ name, fn });
    }

    async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
        this.results = [];
        let passed = 0;
        let failed = 0;

        if (this.isNode) {
            console.log('Running tests...\n');
        }

        const output = this.isNode ? null : document.getElementById('test-output');

        for (const test of this.tests) {
            const startTime = Date.now();
            let result: TestResult;

            try {
                await test.fn();
                const duration = Date.now() - startTime;
                result = { name: test.name, status: 'pass', duration };
                passed++;

                if (this.isNode) {
                    console.log(`✓ ${test.name} (${duration}ms)`);
                } else {
                    this.logResult(output, test.name, `PASS (${duration}ms)`, 'green');
                }
            } catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : String(error);
                result = { name: test.name, status: 'fail', error: errorMessage, duration };
                failed++;

                if (this.isNode) {
                    console.log(`✗ ${test.name}: ${errorMessage} (${duration}ms)`);
                } else {
                    this.logResult(output, test.name, `FAIL: ${errorMessage} (${duration}ms)`, 'red');
                }
            }

            this.results.push(result);
        }

        const summary = {
            total: this.tests.length,
            passed,
            failed,
            results: this.results
        };

        if (this.isNode) {
            console.log(`\nTests: ${passed} passed, ${failed} failed`);
            if (failed > 0) {
                (globalThis as any).process?.exit?.(1);
            }
        } else {
            this.logSummary(output, passed, failed);
        }

        return summary;
    }

    private logResult(output: Element | null, name: string, result: string, color: string): void {
        if (output) {
            const div = document.createElement('div');
            div.style.color = color;
            div.textContent = `${name}: ${result}`;
            output.appendChild(div);
        }
    }

    private logSummary(output: Element | null, passed: number, failed: number): void {
        if (output) {
            const summary = document.createElement('div');
            summary.style.fontWeight = 'bold';
            summary.style.marginTop = '20px';
            summary.textContent = `Tests: ${passed} passed, ${failed} failed`;
            output.appendChild(summary);
        }
    }

    getLastResults(): { total: number; passed: number; failed: number; results: TestResult[] } {
        const passed = this.results.filter(r => r.status === 'pass').length;
        const failed = this.results.filter(r => r.status === 'fail').length;
        return {
            total: this.results.length,
            passed,
            failed,
            results: this.results
        };
    }

    clearResults(): void {
        this.results = [];
    }
}

// Global test runner instance
export const testRunner = new TestRunner();

// Helper function for assertions
export function assert(condition: boolean, message: string = 'Assertion failed'): void {
    if (!condition) {
        throw new Error(message);
    }
}