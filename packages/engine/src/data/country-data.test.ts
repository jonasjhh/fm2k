import {
  getDivisionTeams,
  getAllTeams,
  getAllDivisions,
  CountryData,
  CountryPlayerData,
} from './country-data.ts';

function playerData(id: string, overrides: Partial<CountryPlayerData> = {}): CountryPlayerData {
  return {
    id,
    name: id,
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
  const players = Array.from({ length: 13 }, (_, i) => playerData(`p${i}`));
  return {
    country: 'Testland',
    nationality: 'testish',
    divisions: [
      {
        id: 'd1', name: 'First Division', level: 1,
        teams: [{ id: 't1', name: 'Team One', primaryColor: '#123456', secondaryColor: '#654321', players }],
      },
      {
        id: 'd2', name: 'Second Division', level: 2,
        teams: [{ id: 't2', name: 'Team Two', players: [playerData('q0')] }],
      },
    ],
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

  it('given a 13-player team when converting then exactly 11 start and the rest are subs', () => {
    const [team] = getDivisionTeams(sampleCountry(), 1);
    expect(team.starters).toHaveLength(11);
    expect(team.substitutes).toHaveLength(2);
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
    const p = team.starters[0];
    expect(p.nationality).toBe('testish');
    expect(p.age).toBe(25);
    expect(p.potential).toBe(70);
  });

  it('given a player with explicit nationality then it overrides the country default', () => {
    const country = sampleCountry();
    country.divisions[1].teams[0].players = [playerData('q0', { nationality: 'elsewhere', age: 31, potential: 88 })];
    const [team] = getDivisionTeams(country, 2);
    expect(team.starters[0]).toMatchObject({ nationality: 'elsewhere', age: 31, potential: 88 });
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
