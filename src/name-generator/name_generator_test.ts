import { NameGenerator } from './name_generator';
import { NORWEGIAN_NAMES, ENGLISH_NAMES } from './name_data';

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

describe('NameGenerator:', () => {
  describe('.generateName()', () => {
    test('given a Norwegian male name generator when generating a name then should use Norwegian male and Norwegian last names', () => {
      const generator = new NameGenerator('male', 'norway');
      const name = generator.generateName();
      const { firstName, lastName } = parseFullName(name);

      const validFirstNames = flattenNameEntries(NORWEGIAN_NAMES.male);
      const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);

      expect(validFirstNames).toContain(firstName);
      expect(validLastNames).toContain(lastName);
    });

    test('given a Norwegian female name generator when generating a name then should use Norwegian female and Norwegian last names', () => {
      const generator = new NameGenerator('female', 'norway');
      const name = generator.generateName();
      const { firstName, lastName } = parseFullName(name);

      const validFirstNames = flattenNameEntries(NORWEGIAN_NAMES.female);
      const validLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);

      expect(validFirstNames).toContain(firstName);
      expect(validLastNames).toContain(lastName);
    });

    test('given an English male name generator when generating a name then should use English male and English last names', () => {
      const generator = new NameGenerator('male', 'england');
      const name = generator.generateName();
      const { firstName, lastName } = parseFullName(name);

      const validFirstNames = flattenNameEntries(ENGLISH_NAMES.male);
      const validLastNames = flattenNameEntries(ENGLISH_NAMES.last);

      expect(validFirstNames).toContain(firstName);
      expect(validLastNames).toContain(lastName);
    });
  });

  describe('.generateUniqueNames()', () => {
    test('given a name generator with all genders and countries when generating unique names then should return requested number of unique names', () => {
      const generator = new NameGenerator('all', 'all');
      const names = generator.generateUniqueNames(10);

      expect(names).toHaveLength(10);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(10);
    });
  });

  describe('.generateNames()', () => {
    test('given a male name generator with all countries when generating names then should use names from both Norwegian and English data', () => {
      const generator = new NameGenerator('male', 'all');
      const names = generator.generateNames(20);

      names.forEach(name => {
        const { firstName, lastName } = parseFullName(name);
        const norwayFirstNames = flattenNameEntries(NORWEGIAN_NAMES.male);
        const englishFirstNames = flattenNameEntries(ENGLISH_NAMES.male);
        const norwayLastNames = flattenNameEntries(NORWEGIAN_NAMES.last);
        const englishLastNames = flattenNameEntries(ENGLISH_NAMES.last);

        const isValidFirstName = norwayFirstNames.includes(firstName) || englishFirstNames.includes(firstName);
        const isValidLastName = norwayLastNames.includes(lastName) || englishLastNames.includes(lastName);

        expect(isValidFirstName).toBe(true);
        expect(isValidLastName).toBe(true);
      });
    });
  });

  describe('.getConfig()', () => {
    test('given a female English name generator when getting configuration then should return correct gender and country', () => {
      const generator = new NameGenerator('female', 'england');
      const config = generator.getConfig();

      expect(config.gender).toBe('female');
      expect(config.country).toBe('england');
    });
  });

  describe('constructor', () => {
    test('given an unsupported country when creating a name generator then should throw an error', () => {
      expect(() => {
        new NameGenerator('male', 'unsupported' as any);
      }).toThrow('Unsupported country: unsupported');
    });
  });
});
