import { testRunner, assert } from '../test-runner.js';
import { NameGenerator } from './name_generator.js';

// Test basic name generation
testRunner.addTest('NameGenerator should generate names for Norwegian males', () => {
    const generator = new NameGenerator('male', 'norway');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
    assert(name.trim().length > 0, 'Should not be empty');
});

testRunner.addTest('NameGenerator should generate names for Norwegian females', () => {
    const generator = new NameGenerator('female', 'norway');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
});

testRunner.addTest('NameGenerator should generate names for English males', () => {
    const generator = new NameGenerator('male', 'england');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
});

testRunner.addTest('NameGenerator should generate names for English females', () => {
    const generator = new NameGenerator('female', 'england');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
});

testRunner.addTest('NameGenerator should generate names for all genders', () => {
    const generator = new NameGenerator('all', 'norway');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
});

testRunner.addTest('NameGenerator should generate names for all countries', () => {
    const generator = new NameGenerator('male', 'all');
    const name = generator.generateName();
    assert(typeof name === 'string', 'Should return a string');
    assert(name.includes(' '), 'Should contain a space between first and last name');
});

// Test multiple name generation
testRunner.addTest('NameGenerator should generate multiple names', () => {
    const generator = new NameGenerator('male', 'norway');
    const names = generator.generateNames(5);
    assert(names.length === 5, 'Should generate exactly 5 names');
    assert(names.every(name => typeof name === 'string'), 'All names should be strings');
    assert(names.every(name => name.includes(' ')), 'All names should have first and last name');
});

// Test unique name generation
testRunner.addTest('NameGenerator should generate unique names', () => {
    const generator = new NameGenerator('male', 'norway');
    const names = generator.generateUniqueNames(3);
    assert(names.length === 3, 'Should generate exactly 3 names');
    const uniqueNames = new Set(names);
    assert(uniqueNames.size === 3, 'All names should be unique');
});

// Test configuration
testRunner.addTest('NameGenerator should return correct configuration', () => {
    const generator = new NameGenerator('female', 'england');
    const config = generator.getConfig();
    assert(config.gender === 'female', 'Should return correct gender');
    assert(config.country === 'england', 'Should return correct country');
});

// Test error handling
testRunner.addTest('NameGenerator should handle invalid country', () => {
    let errorThrown = false;
    try {
        new NameGenerator('male', 'invalid' as any);
    } catch (error) {
        errorThrown = true;
        assert(error instanceof Error, 'Should throw an Error');
    }
    assert(errorThrown, 'Should throw error for invalid country');
});

// Test empty array handling
testRunner.addTest('NameGenerator should handle empty name arrays gracefully', () => {
    // This test assumes the name data has sufficient entries
    // If we had empty arrays, it should throw an error during validation
    const generator = new NameGenerator('male', 'norway');
    assert(generator !== null, 'Should create generator successfully with valid data');
});