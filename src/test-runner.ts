export interface TestCase {
    name: string;
    fn: () => void | Promise<void>;
}

export class TestRunner {
    private tests: TestCase[] = [];
    private results: HTMLDivElement;

    constructor() {
        this.results = document.getElementById('test-results') as HTMLDivElement;
        this.setupResultsDisplay();
    }

    private setupResultsDisplay(): void {
        this.results.innerHTML = '<h2>Test Results</h2><div id="test-output"></div>';
    }

    addTest(name: string, fn: () => void | Promise<void>): void {
        this.tests.push({ name, fn });
    }

    async runAllTests(): Promise<void> {
        const output = document.getElementById('test-output') as HTMLDivElement;
        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                await test.fn();
                this.logResult(output, test.name, 'PASS', 'green');
                passed++;
            } catch (error) {
                this.logResult(output, test.name, `FAIL: ${error}`, 'red');
                failed++;
            }
        }

        this.logSummary(output, passed, failed);
    }

    private logResult(output: HTMLDivElement, name: string, result: string, color: string): void {
        const div = document.createElement('div');
        div.style.color = color;
        div.textContent = `${name}: ${result}`;
        output.appendChild(div);
    }

    private logSummary(output: HTMLDivElement, passed: number, failed: number): void {
        const summary = document.createElement('div');
        summary.style.fontWeight = 'bold';
        summary.style.marginTop = '20px';
        summary.textContent = `Tests: ${passed} passed, ${failed} failed`;
        output.appendChild(summary);
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