import {
  COUNTRY_IDS, COUNTRY_DATA, getAllDivisions,
} from '@fm2k/engine';
import type { Team, CountryKey, StructuredDivision } from '@fm2k/engine';

/** A country whose teams can be edited pre-game (the game-setup view model). */
export interface EditableCountry {
  id: CountryKey;
  name: string;         // display name: "Norway", "England", etc.
  nationality: string;  // demonym: "norwegian", "english", etc.
  divisions: EditableDivision[];
}

export interface EditableDivision extends StructuredDivision {}

/** Build the default editable-country hierarchy from the bundled country data. */
export function buildEditableCountries(): EditableCountry[] {
  return COUNTRY_IDS.map(id => {
    const data = COUNTRY_DATA[id];
    return {
      id,
      name: data.country,
      nationality: data.nationality,
      divisions: getAllDivisions(data),
    };
  });
}

export function findTeamById(countries: EditableCountry[], teamId: string): Team | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      const t = d.teams.find(t => t.id === teamId);
      if (t) {return t;}
    }
  }
  return null;
}

export function findDivisionForTeam(countries: EditableCountry[], teamId: string): EditableDivision | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) {return d;}
    }
  }
  return null;
}

export function findCountryForTeam(countries: EditableCountry[], teamId: string): EditableCountry | null {
  for (const c of countries) {
    for (const d of c.divisions) {
      if (d.teams.some(t => t.id === teamId)) {return c;}
    }
  }
  return null;
}
