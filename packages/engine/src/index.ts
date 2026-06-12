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
export { v4, EventBus, StateManager } from '@fm2k/state';
export type { GameEvents } from './game-events.ts';

export { EventLog, addDays, createGameDateTime, TickEngine } from '@fm2k/timeline';
export type { GameDateTime, Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';

export { calculateOverall, TransferManager } from './transfer/transfer-manager.ts';
export { sellPrice, getTeamOVR } from './valuation/valuation.ts';
export {
  SECTOR_KEYS, STAND_TYPES, STAND_CONSTRUCTION_COSTS, LOCATION_MULT,
  COST_PER_SEAT_ADDED, COST_PER_SEAT_REMOVED, DEFAULT_STADIUM_SECTORS,
  getSectorCapacity, calculateTotalCapacity, calculateSectorChangeCost,
  calculateTotalChangeCost, hasSectorChanged,
} from './stadium/stadium.ts';
export type { SectorKey } from './stadium/stadium.ts';
export { FORMATION_LINES, buildSlotAssignments } from './lineup/lineup.ts';
export {
  positionFit, selectStartingXI, calculateBestFormation, buildXISlotAssignments,
} from './lineup/selection.ts';
export type { SelectionOptions } from './lineup/selection.ts';
export { recentForm, leagueZone } from './league/form.ts';
export { computeLadderMovements } from './season/promotion.ts';
export type { LadderDivision } from './season/promotion.ts';
export type { FormResult } from './league/form.ts';
export type { TransferManagerConfig } from './transfer/transfer-manager.ts';
export type { TransferListing, TransferState } from './transfer/transfer-types.ts';
