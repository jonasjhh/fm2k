import { testRunner, assert } from '../test-runner.js';
import { NameGenerator } from './name_generator.js';
import { NORWEGIAN_NAMES, ENGLISH_NAMES } from './name_data.js';

// Helper function to flatten name entries (handles both strings and string arrays)
function flattenNameEntries(entries: (string | string[])[]): string[] {
  return entries.flatMap(entry => Array.isArray(entry) ? entry : [entry]);
}

// Helper function to extract first and last name from full name
function parseFullName(fullName: string): { firstName: string, lastName: string } {
  const parts = fullName.trim().split(' ');
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

testRunner.addTest('NameGenerator should generate Norwegian male names from correct data', () => {
  const generator = new NameGenerator('male', 'norway');
  const name = generator.generateName();
  const { firstName, lastName } = parseFullName(name);

  const validFirstNames = flattenNameEntries(NORWEGIAN_NAMES.male);
  const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);

  assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from Norwegian male names`);
  assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from Norwegian last names`);
});

testRunner.addTest('NameGenerator should generate Norwegian female names from correct data', () => {
  const generator = new NameGenerator('female', 'norway');
  const name = generator.generateName();
  const { firstName, lastName } = parseFullName(name);

  const validFirstNames = flattenNameEntries(NORWEGIAN_NAMES.female);
  const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);

  assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from Norwegian female names`);
  assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from Norwegian last names`);
});

testRunner.addTest('NameGenerator should generate English male names from correct data', () => {
  const generator = new NameGenerator('male', 'england');
  const name = generator.generateName();
  const { firstName, lastName } = parseFullName(name);

  const validFirstNames = flattenNameEntries(ENGLISH_NAMES.male);
  const validLastNames = flattenNameEntries(ENGLISH_NAMES.last);

  assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from English male names`);
  assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from English last names`);
});

testRunner.addTest('NameGenerator should generate English female names from correct data', () => {
  const generator = new NameGenerator('female', 'england');
  const name = generator.generateName();
  const { firstName, lastName } = parseFullName(name);

  const validFirstNames = flattenNameEntries(ENGLISH_NAMES.female);
  const validLastNames = flattenNameEntries(ENGLISH_NAMES.last);

  assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from English female names`);
  assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from English last names`);
});

testRunner.addTest('NameGenerator should generate names from both genders when gender is "all"', () => {
  const generator = new NameGenerator('all', 'norway');

  // Generate multiple names to increase chance of getting both genders
  const names = generator.generateNames(20);

  const validMaleNames = flattenNameEntries(NORWEGIAN_NAMES.male);
  const validFemaleNames = flattenNameEntries(NORWEGIAN_NAMES.female);
  const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);
  const allValidFirstNames = [...validMaleNames, ...validFemaleNames];

  for (const name of names) {
    const { firstName, lastName } = parseFullName(name);
    assert(allValidFirstNames.includes(firstName), `First name "${firstName}" should be from Norwegian male or female names`);
    assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from Norwegian last names`);
  }
});

testRunner.addTest('NameGenerator should generate names from both countries when country is "all"', () => {
  const generator = new NameGenerator('male', 'all');

  // Generate multiple names to increase chance of getting both countries
  const names = generator.generateNames(20);

  const validNorwegianFirstNames = flattenNameEntries(NORWEGIAN_NAMES.male);
  const validEnglishFirstNames = flattenNameEntries(ENGLISH_NAMES.male);
  const validNorwegianLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);
  const validEnglishLastNames = flattenNameEntries(ENGLISH_NAMES.last);

  const allValidFirstNames = [...validNorwegianFirstNames, ...validEnglishFirstNames];
  const allValidLastNames = [...validNorwegianLastNames, ...validEnglishLastNames];

  for (const name of names) {
    const { firstName, lastName } = parseFullName(name);
    assert(allValidFirstNames.includes(firstName), `First name "${firstName}" should be from Norwegian or English male names`);
    assert(allValidLastNames.includes(lastName), `Last name "${lastName}" should be from Norwegian or English last names`);
  }
});

testRunner.addTest('NameGenerator should consistently generate valid names in batch', () => {
  const generator = new NameGenerator('female', 'england');
  const names = generator.generateNames(10);

  const validFirstNames = flattenNameEntries(ENGLISH_NAMES.female);
  const validLastNames = flattenNameEntries(ENGLISH_NAMES.last);

  assert(names.length === 10, 'Should generate exactly 10 names');

  for (const name of names) {
    const { firstName, lastName } = parseFullName(name);
    assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from English female names`);
    assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from English last names`);
  }
});

testRunner.addTest('NameGenerator should generate unique valid names', () => {
  const generator = new NameGenerator('male', 'norway');
  const names = generator.generateUniqueNames(5);

  const validFirstNames = flattenNameEntries(NORWEGIAN_NAMES.male);
  const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);

  assert(names.length === 5, 'Should generate exactly 5 names');

  const uniqueNames = new Set(names);
  assert(uniqueNames.size === 5, 'All names should be unique');

  for (const name of names) {
    const { firstName, lastName } = parseFullName(name);
    assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from Norwegian male names`);
    assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from Norwegian last names`);
  }
});

// Test that name variants work correctly
testRunner.addTest('NameGenerator should handle name variants correctly', () => {
  const generator = new NameGenerator('male', 'england');

  // Generate many names to increase chance of hitting variants
  const names = generator.generateNames(50);

  const validFirstNames = flattenNameEntries(ENGLISH_NAMES.male);
  const validLastNames = flattenNameEntries(ENGLISH_NAMES.last);

  for (const name of names) {
    const { firstName, lastName } = parseFullName(name);
    assert(validFirstNames.includes(firstName), `First name "${firstName}" should be from English male names (including variants)`);
    assert(validLastNames.includes(lastName), `Last name "${lastName}" should be from English last names (including variants)`);
  }
});

// Test configuration
testRunner.addTest('NameGenerator should return correct configuration', () => {
  const generator = new NameGenerator('female', 'england');
  const config = generator.getConfig();
  assert(config.gender === 'female', 'Should return correct gender');
  assert(config.country === 'england', 'Should return correct country');
});
