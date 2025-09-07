import { NORWEGIAN_NAMES, ENGLISH_NAMES } from './name_data.js';

export type Gender = 'male' | 'female' | 'all';
export type Country = 'norway' | 'england' | 'all';

type NameEntry = string | string[];

interface CountryNames {
    male: NameEntry[];
    female: NameEntry[];
    last: NameEntry[];
}

export class NameGenerator {
  private readonly availableCountries: CountryNames[];

  constructor(
        private readonly gender: Gender,
        private readonly country: Country,
  ) {
    this.availableCountries = this.getAvailableCountries();
    this.validateConfiguration();
  }

  generateName(): string {
    const countryData = this.getRandomElement(this.availableCountries);
    return `${this.getRandomName(countryData, this.gender)} ${this.getRandomName(countryData, 'last')}`;
  }

  generateNames(count: number): string[] {
    return Array.from({ length: count }, () => this.generateName());
  }

  generateUniqueNames(count: number): string[] {
    const names = new Set<string>();
    const maxAttempts = count * 10;
    let attempts = 0;

    while (names.size < count && attempts < maxAttempts) {
      names.add(this.generateName());
      attempts++;
    }

    return Array.from(names);
  }

  getConfig() {
    return { country: this.country, gender: this.gender };
  }

  private getAvailableCountries(): CountryNames[] {
    const mapping: Record<Country, CountryNames[]> = {
      norway: [NORWEGIAN_NAMES as CountryNames],
      england: [ENGLISH_NAMES as CountryNames],
      all: [NORWEGIAN_NAMES as CountryNames, ENGLISH_NAMES as CountryNames],
    };

    if (!mapping[this.country]) {
      throw new Error(`Unsupported country: ${this.country}`);
    }

    return mapping[this.country];
  }

  private getRandomName(countryData: CountryNames, type: Gender | 'last'): string {
    let entries: NameEntry[];

    if (type === 'last') {
      entries = countryData.last;
    } else if (type === 'all') {
      entries = [...countryData.male, ...countryData.female];
    } else {
      entries = countryData[type];
    }

    if (!entries.length) {
      throw new Error(`No names available for type: ${type}`);
    }

    const entry = this.getRandomElement(entries);
    return Array.isArray(entry) ? this.getRandomElement(entry) : entry;
  }

  private validateConfiguration(): void {
    const valid = this.availableCountries.some(countryData => {
      const firstNames =
                this.gender === 'male' ? countryData.male
                  : this.gender === 'female' ? countryData.female
                    : [...countryData.male, ...countryData.female];

      return firstNames.length > 0 && countryData.last.length > 0;
    });

    if (!valid) {
      throw new Error(`No names available for country: ${this.country}, gender: ${this.gender}`);
    }
  }

  private getRandomElement<T>(array: T[]): T {
    if (!array.length) {throw new Error('Cannot select from empty array');}
    return array[Math.floor(Math.random() * array.length)];
  }
}
