import { calculateBestFormation } from '@fm2k/lineup';
import type { Team, Player, PlayerPosition, PlayerAttributes } from '@fm2k/match';

/** On-disk shape of a player's attributes — short keys purely to cut down file size.
 *  `ATTR_KEY_MAP` is the single source of truth mapping these back to `PlayerAttributes`'
 *  full names; nothing outside this file deals with the short keys. */
export interface PlayerAttributesJson {
  spd: number;
  str: number;
  sta: number;
  pas: number;
  tec: number;
  fin: number;
  def: number;
  kee: number;
}

const ATTR_KEY_MAP: Record<keyof PlayerAttributes, keyof PlayerAttributesJson> = {
  speed: 'spd',
  strength: 'str',
  stamina: 'sta',
  passing: 'pas',
  technique: 'tec',
  finishing: 'fin',
  defending: 'def',
  keeping: 'kee',
};

/** Maps a short-key on-disk row to the runtime `PlayerAttributes` shape. */
export function attrFromJson(a: PlayerAttributesJson): PlayerAttributes {
  const result = {} as PlayerAttributes;
  for (const fullKey of Object.keys(ATTR_KEY_MAP) as (keyof PlayerAttributes)[]) {
    result[fullKey] = a[ATTR_KEY_MAP[fullKey]];
  }
  return result;
}

/** Maps runtime `PlayerAttributes` to the short-key on-disk shape. */
export function attrToJson(a: PlayerAttributes): PlayerAttributesJson {
  const result = {} as PlayerAttributesJson;
  for (const fullKey of Object.keys(ATTR_KEY_MAP) as (keyof PlayerAttributes)[]) {
    result[ATTR_KEY_MAP[fullKey]] = a[fullKey];
  }
  return result;
}

export interface CountryPlayerRow {
  id: string;
  name: string;
  clubId: string;
  nationality?: string;
  age?: number;
  pos: string;
  pot?: number;
  attr: PlayerAttributesJson;
}

export interface CountryTeamRow {
  id: string;
  name: string;
  divisionId: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface CountryDivisionRow {
  id: string;
  name: string;
  level: number;
}

/** Flat, id-linked country data: divisions/teams/players are independent arrays,
 *  joined by `teams[].divisionId` and `players[].clubId` — not nested. */
export interface CountryData {
  country: string;
  nationality: string;
  divisions: CountryDivisionRow[];
  teams: CountryTeamRow[];
  players: CountryPlayerRow[];
}

function toPlayer(p: CountryPlayerRow, countryNationality: string): Player {
  return {
    id: p.id,
    name: p.name,
    nationality: p.nationality ?? countryNationality,
    age: p.age ?? 25,
    position: p.pos as PlayerPosition,
    potential: p.pot ?? 70,
    attributes: attrFromJson(p.attr),
  };
}

function toTeam(t: CountryTeamRow, players: CountryPlayerRow[], nationality: string): Team {
  const squad = players.filter(p => p.clubId === t.id).map(p => toPlayer(p, nationality));
  return {
    id: t.id,
    name: t.name,
    formation: calculateBestFormation(squad),
    squad,
    colors: { primary: t.primaryColor ?? '#FFFFFF', secondary: t.secondaryColor ?? '#000000' },
  };
}

export function getDivisionTeams(data: CountryData, level: number): Team[] {
  const division = data.divisions.find(d => d.level === level);
  if (!division) { return []; }
  return data.teams
    .filter(t => t.divisionId === division.id)
    .map(t => toTeam(t, data.players, data.nationality));
}

export function getAllTeams(data: CountryData): Team[] {
  return data.teams.map(t => toTeam(t, data.players, data.nationality));
}

export interface StructuredDivision {
  id: string;
  name: string;
  level: number;
  teams: Team[];
}

export function getAllDivisions(data: CountryData): StructuredDivision[] {
  return data.divisions.map(div => ({
    id: div.id,
    name: div.name,
    level: div.level,
    teams: data.teams
      .filter(t => t.divisionId === div.id)
      .map(t => toTeam(t, data.players, data.nationality)),
  }));
}
