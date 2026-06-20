import { NameGenerator, NameData } from './name-generator';
import {
  NORWEGIAN_NAMES, ENGLISH_NAMES, SWEDISH_NAMES, DANISH_NAMES,
  FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES,
} from './name-data';

// Builds a small, fully-controlled name-data set so behaviour can be asserted
// exactly (selection, validation guards) instead of probabilistically.
function makeData(overrides: {
  norwegian?: Partial<NameData['norwegian']>;
  english?: Partial<NameData['english']>;
} = {}): NameData {
  const empty = { male: [], female: [], last: [] };
  return {
    norwegian: { male: ['Nor'], female: ['Nora'], last: ['Norsen'], ...overrides.norwegian },
    english: { male: ['Eng'], female: ['Enga'], last: ['Engson'], ...overrides.english },
    swedish: empty,
    danish: empty,
    french: empty,
    german: empty,
    italian: empty,
    spanish: empty,
  };
}

// Helper function to flatten name entries (handles both strings and string arrays)
function flattenNameEntries(entries: (string | string[])[]): string[] {
  return entries.flatMap(entry => Array.isArray(entry) ? entry : [entry]);
}

// Longest-suffix match against every known surname, since a few (e.g. Italian
// "De Luca") are multi-word — a naive last-word split would mis-parse those.
const ALL_LAST_NAMES = [
  NORWEGIAN_NAMES, ENGLISH_NAMES, SWEDISH_NAMES, DANISH_NAMES,
  FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES,
].flatMap(pool => flattenNameEntries(pool.last)).sort((a, b) => b.length - a.length);

// Helper function to extract first and last name from full name
function parseFullName(fullName: string): { firstName: string, lastName: string } {
  const trimmed = fullName.trim();
  const lastName = ALL_LAST_NAMES.find(n => trimmed.endsWith(n)) ?? trimmed.slice(trimmed.lastIndexOf(' ') + 1);
  const firstName = trimmed.slice(0, trimmed.length - lastName.length).trim();
  return { firstName, lastName };
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
    test('given a male name generator with all countries when generating names then should use names from any country\'s pool', () => {
      const generator = new NameGenerator('male', 'all');
      const names = generator.generateNames(20);

      const allFirstNames = [SWEDISH_NAMES, DANISH_NAMES, FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES]
        .reduce((acc, pool) => [...acc, ...flattenNameEntries(pool.male)],
          [...flattenNameEntries(NORWEGIAN_NAMES.male), ...flattenNameEntries(ENGLISH_NAMES.male)]);
      const allLastNames = [SWEDISH_NAMES, DANISH_NAMES, FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES]
        .reduce((acc, pool) => [...acc, ...flattenNameEntries(pool.last)],
          [...flattenNameEntries(NORWEGIAN_NAMES.last), ...flattenNameEntries(ENGLISH_NAMES.last)]);

      names.forEach(name => {
        const { firstName, lastName } = parseFullName(name);
        expect(allFirstNames).toContain(firstName);
        expect(allLastNames).toContain(lastName);
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

  describe('deterministic selection (injected rng + data)', () => {
    test('given rng=0 then selects the first entry of every pool', () => {
      const data = makeData({ norwegian: { male: ['Alpha', 'Beta'], last: ['One', 'Two'] } });
      const generator = new NameGenerator('male', 'norway', () => 0, data);

      expect(generator.generateName()).toBe('Alpha One');
    });

    test('given rng near 1 then selects the last entry of every pool', () => {
      const data = makeData({ norwegian: { male: ['Alpha', 'Beta'], last: ['One', 'Two'] } });
      const generator = new NameGenerator('male', 'norway', () => 0.99, data);

      expect(generator.generateName()).toBe('Beta Two');
    });

    test('given a nested first-name entry then picks within that entry by rng', () => {
      const data = makeData({ norwegian: { male: [['Carl', 'Karl']], last: ['Last'] } });
      const generator = new NameGenerator('male', 'norway', () => 0.99, data);

      expect(generator.generateName()).toBe('Karl Last');
    });
  });

  describe('.generateUniqueNames() termination', () => {
    test('given an rng that always yields the same name then stops at the attempt cap', () => {
      // rng=0 makes every generated name identical, so uniqueness never grows;
      // the loop must terminate via the attempts guard and return a single name.
      const generator = new NameGenerator('male', 'norway', () => 0, makeData());

      expect(generator.generateUniqueNames(5)).toEqual(['Nor Norsen']);
    });
  });

  describe('constructor validation (empty pools)', () => {
    test('given an empty first-name pool for the chosen gender then throws', () => {
      expect(() => new NameGenerator('male', 'norway', Math.random, makeData({ norwegian: { male: [] } })))
        .toThrow('No names available for country: norway, gender: male');
    });

    test('given a female generator then validates the female pool, not male', () => {
      expect(() => new NameGenerator('female', 'norway', Math.random, makeData({ norwegian: { female: [] } })))
        .toThrow('No names available');
    });

    test('given an empty last-name pool then throws even when first names exist', () => {
      expect(() => new NameGenerator('male', 'norway', Math.random, makeData({ norwegian: { last: [] } })))
        .toThrow('No names available');
    });

    test('given all-countries with one empty pool then still valid because another pool has names', () => {
      // `some` (not `every`): one fully-empty pool must not invalidate the config.
      const data = makeData({ english: { male: [], female: [], last: [] } });
      expect(() => new NameGenerator('male', 'all', Math.random, data)).not.toThrow();
    });

    test('given an all-gender generator then validates the combined male+female pool', () => {
      // gender 'all' must consider male names too: an empty female pool alone
      // must not invalidate the config when male names exist.
      const data = makeData({ norwegian: { female: [] } });
      expect(() => new NameGenerator('all', 'norway', Math.random, data)).not.toThrow();
    });
  });

  describe('generation guards (empty pool reached at draw time)', () => {
    test('given all-countries where the selected pool is empty for the gender then throws', () => {
      // NOR valid keeps the config valid (some), but rng steers selection to the
      // empty ENG male pool, exercising the getRandomName empty-entries guard.
      const data = makeData({ english: { male: [] } });
      const generator = new NameGenerator('male', 'all', () => 0.99, data);

      expect(() => generator.generateName()).toThrow('No names available for type: male');
    });

    test('given a nested name entry that is empty then throws from the empty-array guard', () => {
      const data = makeData({ norwegian: { male: [[]], last: ['Last'] } });
      const generator = new NameGenerator('male', 'norway', () => 0, data);

      expect(() => generator.generateName()).toThrow('Cannot select from empty array');
    });
  });
});
