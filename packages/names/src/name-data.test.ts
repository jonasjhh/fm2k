import { NameGenerator, CountryKey } from './name-generator.ts';
import { NORWEGIAN_NAMES, ENGLISH_NAMES } from './name-data.ts';

type Pool = { male: (string | string[])[]; female: (string | string[])[]; last: (string | string[])[] };

function flatten(entries: (string | string[])[]): string[] {
  return entries.flatMap(e => (Array.isArray(e) ? e : [e]));
}

function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

// ── data integrity ────────────────────────────────────────────────────────────

describe('name-data integrity:', () => {
  const pools: Array<[string, Pool]> = [
    ['NORWEGIAN_NAMES', NORWEGIAN_NAMES as Pool],
    ['ENGLISH_NAMES', ENGLISH_NAMES as Pool],
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
  const norwegianLast = new Set(flatten(NORWEGIAN_NAMES.last));
  const englishLast = new Set(flatten(ENGLISH_NAMES.last));

  // Sample enough names that a wrong mapping is overwhelmingly likely to be caught.
  function lastNames(country: CountryKey): string[] {
    return new NameGenerator('all', country).generateNames(40).map(lastNameOf);
  }

  it.each<CountryKey>(['norway', 'sweden', 'denmark'])(
    'given %s then surnames are drawn from the Norwegian pool',
    (country) => {
      expect(lastNames(country).every(n => norwegianLast.has(n))).toBe(true);
    },
  );

  it.each<CountryKey>(['england', 'germany', 'france', 'spain', 'italy'])(
    'given %s then surnames are drawn from the English pool',
    (country) => {
      expect(lastNames(country).every(n => englishLast.has(n))).toBe(true);
    },
  );

  it('given the all pool then surnames may come from either Norwegian or English pools', () => {
    const names = new NameGenerator('all', 'all').generateNames(60).map(lastNameOf);
    expect(names.every(n => norwegianLast.has(n) || englishLast.has(n))).toBe(true);
  });
});
