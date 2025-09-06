import { testRunner, assert } from '../test-runner.js';
import { ExampleComponent } from './example_component.js';

// Register tests
testRunner.addTest('ExampleComponent.add should add two numbers', () => {
    const component = new ExampleComponent();
    const result = component.add(2, 3);
    assert(result === 5, `Expected 5, got ${result}`);
});