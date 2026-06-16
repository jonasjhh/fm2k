import { calculateBestFormation } from '@fm2k/match';
import type { Team, Player, Position } from '@fm2k/match';

export interface CountryPlayerData {
  id: string;
  name: string;
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

export interface CountryTeamData {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  players: CountryPlayerData[];
}

export interface CountryDivisionData {
  id: string;
  name: string;
  level: number;
  teams: CountryTeamData[];
}

export interface CountryData {
  country: string;
  nationality: string;
  divisions: CountryDivisionData[];
}

function toPlayer(p: CountryPlayerData, countryNationality: string): Player {
  return {
    id: p.id,
    name: p.name,
    nationality: p.nationality ?? countryNationality,
    age: p.age ?? 25,
    position: p.position as Position,
    potential: p.potential ?? 70,
    attributes: p.attributes,
  };
}

function toTeam(t: CountryTeamData, nationality: string): Team {
  const players = t.players.map(p => toPlayer(p, nationality));
  return {
    id: t.id,
    name: t.name,
    formation: calculateBestFormation(players),
    starters: players.slice(0, 11),
    substitutes: players.slice(11),
    colors: { primary: t.primaryColor ?? '#FFFFFF', secondary: t.secondaryColor ?? '#000000' },
  };
}

export function getDivisionTeams(data: CountryData, level: number): Team[] {
  const division = data.divisions.find(d => d.level === level);
  return division ? division.teams.map(t => toTeam(t, data.nationality)) : [];
}

export function getAllTeams(data: CountryData): Team[] {
  return data.divisions.flatMap(d => d.teams.map(t => toTeam(t, data.nationality)));
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
    teams: div.teams.map(t => toTeam(t, data.nationality)),
  }));
}
