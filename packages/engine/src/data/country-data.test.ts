import {
  getDivisionTeams,
  getAllTeams,
  getAllDivisions,
  CountryData,
  CountryPlayerRow,
} from './country-data.ts';

function playerData(id: string, clubId: string, overrides: Partial<CountryPlayerRow> = {}): CountryPlayerRow {
  return {
    id,
    name: id,
    clubId,
    position: 'CM',
    attributes: {
      speed: 50, strength: 50, agility: 50, passing: 50, finishing: 50,
      technique: 50, defending: 50, stamina: 50, awareness: 50, composure: 50,
    },
    ...overrides,
  };
}

// One team with 13 players (so 11 starters + 2 subs), in a 2-division country.
function sampleCountry(): CountryData {
  const players = Array.from({ length: 13 }, (_, i) => playerData(`p${i}`, 't1'));
  return {
    country: 'Testland',
    nationality: 'testish',
    divisions: [
      { id: 'd1', name: 'First Division', level: 1 },
      { id: 'd2', name: 'Second Division', level: 2 },
    ],
    teams: [
      { id: 't1', name: 'Team One', divisionId: 'd1', primaryColor: '#123456', secondaryColor: '#654321' },
      { id: 't2', name: 'Team Two', divisionId: 'd2' },
    ],
    players: [...players, playerData('q0', 't2')],
  };
}

describe('getDivisionTeams:', () => {
  it('given a level that exists when getting teams then that division\'s teams are returned', () => {
    const teams = getDivisionTeams(sampleCountry(), 2);
    expect(teams.map(t => t.id)).toEqual(['t2']);
  });

  it('given a level that does not exist when getting teams then an empty list is returned', () => {
    expect(getDivisionTeams(sampleCountry(), 99)).toEqual([]);
  });

  it('given a 13-player team when converting then the whole squad is preserved', () => {
    const [team] = getDivisionTeams(sampleCountry(), 1);
    expect(team.squad).toHaveLength(13);
  });

  it('given explicit colours when converting then they are preserved', () => {
    const [team] = getDivisionTeams(sampleCountry(), 1);
    expect(team.colors).toEqual({ primary: '#123456', secondary: '#654321' });
  });

  it('given missing colours when converting then defaults are applied', () => {
    const [team] = getDivisionTeams(sampleCountry(), 2);
    expect(team.colors).toEqual({ primary: '#FFFFFF', secondary: '#000000' });
  });
});

describe('player conversion defaults:', () => {
  it('given a player without nationality/age/potential then country defaults fill in', () => {
    const [team] = getDivisionTeams(sampleCountry(), 2);
    const p = team.squad[0];
    expect(p.nationality).toBe('testish');
    expect(p.age).toBe(25);
    expect(p.potential).toBe(70);
  });

  it('given a player with explicit nationality then it overrides the country default', () => {
    const country = sampleCountry();
    country.players = [playerData('q0', 't2', { nationality: 'elsewhere', age: 31, potential: 88 })];
    const [team] = getDivisionTeams(country, 2);
    expect(team.squad[0]).toMatchObject({ nationality: 'elsewhere', age: 31, potential: 88 });
  });
});

describe('getAllTeams:', () => {
  it('given a multi-division country when getting all teams then every team is flattened', () => {
    expect(getAllTeams(sampleCountry()).map(t => t.id).sort()).toEqual(['t1', 't2']);
  });
});

describe('getAllDivisions:', () => {
  it('given a country when getting all divisions then structure and order are preserved', () => {
    const divisions = getAllDivisions(sampleCountry());
    expect(divisions.map(d => ({ id: d.id, name: d.name, level: d.level }))).toEqual([
      { id: 'd1', name: 'First Division', level: 1 },
      { id: 'd2', name: 'Second Division', level: 2 },
    ]);
    expect(divisions[0].teams[0].id).toBe('t1');
  });
});
