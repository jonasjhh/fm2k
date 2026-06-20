import { NameGenerator, CountryKey } from './name-generator.ts';
import {
  NORWEGIAN_NAMES, ENGLISH_NAMES, SWEDISH_NAMES, DANISH_NAMES,
  FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES,
} from './name-data.ts';

type Pool = { male: (string | string[])[]; female: (string | string[])[]; last: (string | string[])[] };

function flatten(entries: (string | string[])[]): string[] {
  return entries.flatMap(e => (Array.isArray(e) ? e : [e]));
}

// Longest-suffix match against every known surname, since a few (e.g. Italian
// "De Luca") are multi-word — a naive last-word split would mis-parse those.
const ALL_LAST_NAMES = [
  NORWEGIAN_NAMES, ENGLISH_NAMES, SWEDISH_NAMES, DANISH_NAMES,
  FRENCH_NAMES, GERMAN_NAMES, ITALIAN_NAMES, SPANISH_NAMES,
].flatMap(pool => flatten(pool.last)).sort((a, b) => b.length - a.length);

function lastNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  const match = ALL_LAST_NAMES.find(n => trimmed.endsWith(n));
  return match ?? trimmed.slice(trimmed.lastIndexOf(' ') + 1);
}

// ── data integrity ────────────────────────────────────────────────────────────

describe('name-data integrity:', () => {
  const pools: Array<[string, Pool]> = [
    ['NORWEGIAN_NAMES', NORWEGIAN_NAMES as Pool],
    ['ENGLISH_NAMES', ENGLISH_NAMES as Pool],
    ['SWEDISH_NAMES', SWEDISH_NAMES as Pool],
    ['DANISH_NAMES', DANISH_NAMES as Pool],
    ['FRENCH_NAMES', FRENCH_NAMES as Pool],
    ['GERMAN_NAMES', GERMAN_NAMES as Pool],
    ['ITALIAN_NAMES', ITALIAN_NAMES as Pool],
    ['SPANISH_NAMES', SPANISH_NAMES as Pool],
  ];

  for (const [name, pool] of pools) {
    it(`given ${name} then every category is a non-empty pool of non-empty strings`, () => {
      for (const category of ['male', 'female', 'last'] as const) {
        const flat = flatten(pool[category]);
        expect(flat.length).toBeGreaterThan(0);
        expect(flat.every(n => typeof n === 'string' && n.trim().length > 0)).toBe(true);
      }
    });
  }
});

// ── country -> pool mapping (lives in the mutated name-generator) ──────────────

describe('country name-pool mapping:', () => {
  const lastNamesByCountry: Record<CountryKey, Set<string>> = {
    norway: new Set(flatten(NORWEGIAN_NAMES.last)),
    england: new Set(flatten(ENGLISH_NAMES.last)),
    sweden: new Set(flatten(SWEDISH_NAMES.last)),
    denmark: new Set(flatten(DANISH_NAMES.last)),
    france: new Set(flatten(FRENCH_NAMES.last)),
    germany: new Set(flatten(GERMAN_NAMES.last)),
    italy: new Set(flatten(ITALIAN_NAMES.last)),
    spain: new Set(flatten(SPANISH_NAMES.last)),
  };

  // Sample enough names that a wrong mapping is overwhelmingly likely to be caught.
  function lastNames(country: CountryKey): string[] {
    return new NameGenerator('all', country).generateNames(40).map(lastNameOf);
  }

  it.each<CountryKey>(['norway', 'england', 'sweden', 'denmark', 'france', 'germany', 'italy', 'spain'])(
    'given %s then surnames are drawn from its own dedicated pool',
    (country) => {
      expect(lastNames(country).every(n => lastNamesByCountry[country].has(n))).toBe(true);
    },
  );

  it('given the all pool then surnames may come from any country\'s pool', () => {
    const allLastNames = new Set(Object.values(lastNamesByCountry).flatMap(s => [...s]));
    const names = new NameGenerator('all', 'all').generateNames(60).map(lastNameOf);
    expect(names.every(n => allLastNames.has(n))).toBe(true);
  });
});
