import { calculateBestFormation } from '@fm2k/lineup';
import type { Team, Player, PlayerPosition } from '@fm2k/match';

export interface CountryPlayerRow {
  id: string;
  name: string;
  clubId: string;
  nationality?: string;
  age?: number;
  position: string;
  potential?: number;
  attributes: {
    speed: number;
    strength: number;
    agility: number;
    passing: number;
    finishing: number;
    technique: number;
    defending: number;
    stamina: number;
    awareness: number;
    composure: number;
  };
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
    position: p.position as PlayerPosition,
    potential: p.potential ?? 70,
    attributes: p.attributes,
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
