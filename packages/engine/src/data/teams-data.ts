import norwayMeta from './norway/meta.json';
import norwayDivisions from './norway/divisions.json';
import norwayTeams from './norway/teams.json';
import norwayPlayers from './norway/players.json';
import englandMeta from './england/meta.json';
import englandDivisions from './england/divisions.json';
import englandTeams from './england/teams.json';
import englandPlayers from './england/players.json';
import germanyMeta from './germany/meta.json';
import germanyDivisions from './germany/divisions.json';
import germanyTeams from './germany/teams.json';
import germanyPlayers from './germany/players.json';
import franceMeta from './france/meta.json';
import franceDivisions from './france/divisions.json';
import franceTeams from './france/teams.json';
import francePlayers from './france/players.json';
import spainMeta from './spain/meta.json';
import spainDivisions from './spain/divisions.json';
import spainTeams from './spain/teams.json';
import spainPlayers from './spain/players.json';
import italyMeta from './italy/meta.json';
import italyDivisions from './italy/divisions.json';
import italyTeams from './italy/teams.json';
import italyPlayers from './italy/players.json';
import swedenMeta from './sweden/meta.json';
import swedenDivisions from './sweden/divisions.json';
import swedenTeams from './sweden/teams.json';
import swedenPlayers from './sweden/players.json';
import denmarkMeta from './denmark/meta.json';
import denmarkDivisions from './denmark/divisions.json';
import denmarkTeams from './denmark/teams.json';
import denmarkPlayers from './denmark/players.json';
import { getAllTeams, getDivisionTeams } from './country-data.ts';
import type { CountryData, CountryDivisionRow, CountryTeamRow, CountryPlayerRow } from './country-data.ts';
import type { CountryKey } from '@fm2k/names';

export { getAllTeams, getDivisionTeams };

// ── country registry ──────────────────────────────────────────────────────────
// To add a new country: import its meta/divisions/teams/players JSON above, add the
// country name here, and add it to COUNTRY_DATA below. Everything else derives from
// this registry. Each country's static data lives in its own `<country>/` folder as
// flat, id-linked files (divisions/teams/players), not nested — see country-data.ts.

export const COUNTRY_IDS: readonly CountryKey[] = [
  'norway',
  'england',
  'germany',
  'france',
  'spain',
  'italy',
  'sweden',
  'denmark',
];

function loadCountry(
  meta: { country: string; nationality: string },
  divisions: CountryDivisionRow[],
  teams: CountryTeamRow[],
  players: CountryPlayerRow[],
): CountryData {
  return { country: meta.country, nationality: meta.nationality, divisions, teams, players };
}

export const COUNTRY_DATA: Record<CountryKey, CountryData> = {
  norway: loadCountry(norwayMeta, norwayDivisions, norwayTeams, norwayPlayers as CountryPlayerRow[]),
  england: loadCountry(englandMeta, englandDivisions, englandTeams, englandPlayers as CountryPlayerRow[]),
  germany: loadCountry(germanyMeta, germanyDivisions, germanyTeams, germanyPlayers as CountryPlayerRow[]),
  france: loadCountry(franceMeta, franceDivisions, franceTeams, francePlayers as CountryPlayerRow[]),
  spain: loadCountry(spainMeta, spainDivisions, spainTeams, spainPlayers as CountryPlayerRow[]),
  italy: loadCountry(italyMeta, italyDivisions, italyTeams, italyPlayers as CountryPlayerRow[]),
  sweden: loadCountry(swedenMeta, swedenDivisions, swedenTeams, swedenPlayers as CountryPlayerRow[]),
  denmark: loadCountry(denmarkMeta, denmarkDivisions, denmarkTeams, denmarkPlayers as CountryPlayerRow[]),
};

export const ALL_COUNTRIES: CountryData[] = COUNTRY_IDS.map(id => COUNTRY_DATA[id]);

export const COUNTRY_FLAG: Record<CountryKey, string> = {
  norway:  '🇳🇴',
  england: '🇬🇧',
  germany: '🇩🇪',
  france:  '🇫🇷',
  spain:   '🇪🇸',
  italy:   '🇮🇹',
  sweden:  '🇸🇪',
  denmark: '🇩🇰',
};

export const COUNTRY_COLORS: Record<CountryKey, { primary: string; secondary: string }> = {
  norway:  { primary: '#EF2B2D', secondary: '#FFFFFF' },
  england: { primary: '#CF142B', secondary: '#FFFFFF' },
  germany: { primary: '#000000', secondary: '#DD0000' },
  france:  { primary: '#002395', secondary: '#ED2939' },
  spain:   { primary: '#AA151B', secondary: '#F1BF00' },
  italy:   { primary: '#009246', secondary: '#CE2B37' },
  sweden:  { primary: '#006AA7', secondary: '#FECC02' },
  denmark: { primary: '#C60C30', secondary: '#FFFFFF' },
};

// Legacy export used by existing tests / league bootstrap
export const DIVISION_TEAMS = getDivisionTeams(COUNTRY_DATA.norway, 1);
