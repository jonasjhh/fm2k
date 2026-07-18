import {
  getDivisionTeams,
  getAllTeams,
  getAllDivisions,
  attrFromJson,
  attrToJson,
  CountryData,
  CountryPlayerRow,
} from './country-data.ts';

function playerData(id: string, clubId: string, overrides: Partial<CountryPlayerRow> = {}): CountryPlayerRow {
  return {
    id,
    name: id,
    clubId,
    pos: 'CM',
    attr: {
      spd: 50, str: 50, sta: 50, pas: 50, tec: 50,
      fin: 50, def: 50, kee: 50,
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
    country.players = [playerData('q0', 't2', { nationality: 'elsewhere', age: 31, pot: 88 })];
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

describe('attrFromJson / attrToJson:', () => {
  it('given a short-key row when converting to runtime attributes then every key maps to its full name', () => {
    const json = { spd: 1, str: 2, sta: 3, pas: 4, tec: 5, fin: 6, def: 7, kee: 8 };
    expect(attrFromJson(json)).toEqual({
      speed: 1, strength: 2, stamina: 3, passing: 4, technique: 5,
      finishing: 6, defending: 7, keeping: 8,
    });
  });

  it('given runtime attributes when converting to JSON then every key maps to its short name', () => {
    const attrs = {
      speed: 1, strength: 2, stamina: 3, passing: 4, technique: 5,
      finishing: 6, defending: 7, keeping: 8,
    };
    expect(attrToJson(attrs)).toEqual({ spd: 1, str: 2, sta: 3, pas: 4, tec: 5, fin: 6, def: 7, kee: 8 });
  });

  it('round-trips through both directions without loss', () => {
    const attrs = {
      speed: 11, strength: 22, stamina: 33, passing: 44, technique: 55,
      finishing: 66, defending: 77, keeping: 88,
    };
    expect(attrFromJson(attrToJson(attrs))).toEqual(attrs);
  });
});
