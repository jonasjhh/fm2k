import {
  buildEditableCountries,
  findTeamById,
  findDivisionForTeam,
  findCountryForTeam,
} from './editable-country.ts';

describe('editable-country:', () => {
  describe('buildEditableCountries', () => {
    test('builds a non-empty hierarchy of countries with named divisions and teams', () => {
      const countries = buildEditableCountries();
      expect(countries.length).toBeGreaterThan(0);

      const first = countries[0];
      expect(first.name).toBeTruthy();
      expect(first.nationality).toBeTruthy();
      expect(first.divisions.length).toBeGreaterThan(0);
      expect(first.divisions[0].teams.length).toBeGreaterThan(0);
    });
  });

  describe('findTeamById', () => {
    test('given an existing team id then returns that team', () => {
      const countries = buildEditableCountries();
      const sample = countries[0].divisions[0].teams[0];
      expect(findTeamById(countries, sample.id)).toBe(sample);
    });

    test('given an unknown team id then returns null', () => {
      const countries = buildEditableCountries();
      expect(findTeamById(countries, 'no-such-team')).toBeNull();
    });
  });

  describe('findDivisionForTeam', () => {
    test('given an existing team id then returns the division containing it', () => {
      const countries = buildEditableCountries();
      const division = countries[0].divisions[0];
      const sample = division.teams[0];
      expect(findDivisionForTeam(countries, sample.id)).toBe(division);
    });

    test('given an unknown team id then returns null', () => {
      const countries = buildEditableCountries();
      expect(findDivisionForTeam(countries, 'no-such-team')).toBeNull();
    });
  });

  describe('findCountryForTeam', () => {
    test('given an existing team id then returns the country containing it', () => {
      const countries = buildEditableCountries();
      const country = countries[0];
      const sample = country.divisions[0].teams[0];
      expect(findCountryForTeam(countries, sample.id)).toBe(country);
    });

    test('given an unknown team id then returns null', () => {
      const countries = buildEditableCountries();
      expect(findCountryForTeam(countries, 'no-such-team')).toBeNull();
    });
  });
});
