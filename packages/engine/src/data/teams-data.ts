import norwayData from './norway.json';
import englandData from './england.json';
import germanyData from './germany.json';
import franceData from './france.json';
import spainData from './spain.json';
import italyData from './italy.json';
import swedenData from './sweden.json';
import denmarkData from './denmark.json';
import { getAllTeams, getDivisionTeams } from './country-data.ts';
import type { CountryData } from './country-data.ts';

export { getAllTeams, getDivisionTeams };

// ── country registry ──────────────────────────────────────────────────────────
// To add a new country: import its JSON above, add the country name here,
// and add it to COUNTRY_DATA below. Everything else derives from this registry.

export const COUNTRY_IDS = [
  'norway',
  'england',
  'germany',
  'france',
  'spain',
  'italy',
  'sweden',
  'denmark',
] as const;

export type CountryId = typeof COUNTRY_IDS[number];

export const COUNTRY_DATA: Record<CountryId, CountryData> = {
  norway:   norwayData   as unknown as CountryData,
  england:  englandData  as unknown as CountryData,
  germany:  germanyData  as unknown as CountryData,
  france:   franceData   as unknown as CountryData,
  spain:    spainData    as unknown as CountryData,
  italy:    italyData    as unknown as CountryData,
  sweden:   swedenData   as unknown as CountryData,
  denmark:  denmarkData  as unknown as CountryData,
};

export const ALL_COUNTRIES: CountryData[] = COUNTRY_IDS.map(id => COUNTRY_DATA[id]);

export const COUNTRY_FLAG: Record<CountryId, string> = {
  norway:  '🇳🇴',
  england: '🇬🇧',
  germany: '🇩🇪',
  france:  '🇫🇷',
  spain:   '🇪🇸',
  italy:   '🇮🇹',
  sweden:  '🇸🇪',
  denmark: '🇩🇰',
};

export const COUNTRY_COLORS: Record<CountryId, { primary: string; secondary: string }> = {
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
