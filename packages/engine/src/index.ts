export { ClubManager } from './club/club-manager.ts';
export type { ClubManagerConfig } from './club/club-manager.ts';
export type { ClubPlayer, ClubState, FacilityLevel, FacilityLevels, FinancialTransaction, StadiumSectorConfig } from './club/club-types.ts';

export { generateFixtures } from './league/fixture-generator.ts';
export { LeagueManager } from './league/league-manager.ts';
export type { LeagueManagerConfig, MatchCompletedPayload } from './league/league-manager.ts';
export type { Fixture, LeagueState, LeagueStanding } from './league/league-types.ts';
export { DIVISION_TEAMS, ALL_COUNTRIES, COUNTRY_IDS, COUNTRY_DATA, COUNTRY_FLAG, COUNTRY_COLORS, getAllTeams, getDivisionTeams } from './data/teams-data.ts';
export type { CountryId } from './data/teams-data.ts';
export type { CountryData, CountryDivisionData, CountryTeamData, CountryPlayerData, StructuredDivision } from './data/country-data.ts';
export { getAllDivisions } from './data/country-data.ts';

export { MatchOccurrence } from './match/match-occurrence.ts';
export { MatchSimulator } from './match/match-simulator.ts';
export type { EventType, MatchEvent, MatchResult, MatchStatistics, MatchState } from './match/types.ts';

export { NameGenerator } from '@fm2k/names';
export type { Gender, Country, NameCountry } from '@fm2k/names';
export { PlayerGenerator } from './player/player-generator.ts';

export { SeasonManager } from './season/season-manager.ts';
export type { SeasonState } from './season/season-types.ts';

export type { Formation, Player, PlayerAttributes, Position, Team, TeamTactics } from './shared/types.ts';
export { v4 } from './shared/uuid.ts';

export { StateManager } from './state/state-manager.ts';

export { EventLog, addDays, createGameDateTime, TickEngine } from '@fm2k/timeline';
export type { GameDateTime, Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';

export { calculateOverall, TransferManager } from './transfer/transfer-manager.ts';
export type { TransferManagerConfig } from './transfer/transfer-manager.ts';
export type { TransferListing, TransferState } from './transfer/transfer-types.ts';
