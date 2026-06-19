export { ClubManager } from './club/club-manager.ts';
export type { ClubManagerConfig } from './club/club-manager.ts';
export type { ClubPlayer, ClubState, FacilityLevel, FacilityLevels, FinancialTransaction, StadiumSectorConfig } from './club/club-types.ts';

export { generateFixtures } from './league/fixture-generator.ts';
export { LeagueManager } from './league/league-manager.ts';
export type { LeagueManagerConfig, MatchCompletedPayload } from './league/league-manager.ts';
export type { Fixture, LeagueState, LeagueStanding } from './league/league-types.ts';

export { CompetitionManager } from './competition/competition-manager.ts';
export type { CompetitionManagerConfig } from './competition/competition-manager.ts';
export { Season } from './competition/season.ts';
export type { SeasonConfig } from './competition/season.ts';
export { LeagueFormat } from './competition/league-format.ts';
export { KnockoutFormat } from './competition/knockout-format.ts';
export type { KnockoutFormatOptions } from './competition/knockout-format.ts';
export { drawBracket, recordWinner, roundComplete, roundTieCounts } from './competition/knockout-bracket.ts';
export { cupRoundMatchdays, cupRoundDate, cupRoundDates } from './competition/cup-scheduling.ts';
export type {
  CompetitionFormat, FormatContext, MatchOutcome, ScheduledMatch,
} from './competition/competition-format.ts';
export type {
  CompetitionState, CompetitionFixture, CompetitionStanding, CompetitionKind,
  BracketState, BracketSlot, FixtureResult, LeagueFormatConfig, KnockoutFormatConfig, LiveMatch,
} from './competition/competition-types.ts';
export { TBD_TEAM_ID, TBD_TEAM_NAME } from './competition/competition-types.ts';
export { DIVISION_TEAMS, ALL_COUNTRIES, COUNTRY_IDS, COUNTRY_DATA, COUNTRY_FLAG, COUNTRY_COLORS, getAllTeams, getDivisionTeams } from './data/teams-data.ts';
export type { CountryId } from './data/teams-data.ts';
export type { CountryData, CountryDivisionData, CountryTeamData, CountryPlayerData, StructuredDivision } from './data/country-data.ts';
export { getAllDivisions } from './data/country-data.ts';

export { MatchOccurrence } from '@fm2k/match';
export { MatchSimulator, isTerminalPhase } from '@fm2k/match';
export { simulateShootout } from '@fm2k/match';
export type { ShootoutResult } from '@fm2k/match';
export type { EventType, MatchEvent, MatchResult, MatchStatistics, MatchState } from '@fm2k/match';
export { simulateMatch, generateInjuries, INJURY_TYPES, runDistribution, mulberry32 } from '@fm2k/match';
export type {
  SimulateMatchInput, SimulateMatchResult, SideInput, PlayerMatchUpdate, InjuryReport,
  DistributionInput, DistributionResult,
} from '@fm2k/match';

export { NameGenerator } from '@fm2k/names';
export type { Gender, Country, NameCountry } from '@fm2k/names';
export { PlayerGenerator } from './player/player-generator.ts';
export {
  trainOnMatch, developOverSeason, TRAINING_REGIMENTS, REGIMENT_IDS, REGIMENT_LABELS, DEFAULT_REGIMENT,
} from './player/progression.ts';
export type { RegimentId, SeasonDevelopment } from './player/progression.ts';
export {
  retirementChance, makeYouth, generatorYouthFactory, churnSquad, churnFreeAgents, runAiMarket,
  randomIntakeCap, MAX_SQUAD_SIZE,
} from './world/world-churn.ts';
export type {
  YouthFactory, PlayerDelta, SquadChurnOptions, SquadChurnResult, PoolChurnOptions, OverflowSpec,
  AiMarketTeam, AiMarketOptions, AiMarketResult,
} from './world/world-churn.ts';

export { SeasonManager } from './season/season-manager.ts';
export type { SeasonState } from './season/season-types.ts';

export type { Formation, Player, PlayerAttributes, Position, Team, TeamColors, TeamTactics } from '@fm2k/match';

export type {
  TacticalStyleId, TacticalSliders, TeamTacticsIntent,
  MatchParameters, MatchParameterSet, ParamModifiers, StyleTendency,
  MatchInsight, InsightCategory, MatchInsightInput,
} from '@fm2k/match';
export {
  TACTICAL_STYLE_IDS, DEFAULT_SLIDERS, defaultIntent,
  NEUTRAL_PARAMS, NEUTRAL_VALUE, PARAM_KEYS, clampParam, clampParams, applyDelta,
  FORMATION_TENDENCIES, STYLE_TENDENCIES, formationToStyle, aiIntent,
  combine, applySquadDistortion,
  squadSuitability, defensiveSuitability, attackEffectiveness,
  resolveMatchParameters, buildMatchInsight,
} from '@fm2k/match';
export { v4, EventBus, StateManager } from '@fm2k/state';
export type { GameEvents } from './game-events.ts';

export { EventLog, addDays, addMinutes, createGameDateTime, TickEngine, isBefore, isAfter } from '@fm2k/timeline';
export type { GameDateTime, Occurrence, OccurrenceContext, OccurrenceEvent } from '@fm2k/timeline';

export { calculateOverall, TransferManager } from './transfer/transfer-manager.ts';
export { getTeamOVR, playerValue, directTransferPrice } from './valuation/valuation.ts';
export type { LineupRole } from './valuation/valuation.ts';
export { acceptBid } from './transfer/bid.ts';
export {
  transferWindow, PRE_SEASON_WINDOW_LENGTH, MID_SEASON_WINDOW_LENGTH,
} from './transfer/transfer-window.ts';
export type { TransferWindow, TransferWindowKind } from './transfer/transfer-window.ts';
export {
  SECTOR_KEYS, STAND_TYPES, STAND_BUILD_COSTS, STAND_DEMOLITION_COSTS, LOCATION_MULT,
  COST_PER_SEAT_ADDED, COST_PER_SEAT_REMOVED, DEFAULT_STADIUM_SECTORS,
  getSectorCapacity, calculateTotalCapacity, calculateSectorChangeCost,
  calculateTotalChangeCost, hasSectorChanged,
} from './stadium/stadium.ts';
export type { SectorKey } from './stadium/stadium.ts';
export { FORMATION_LINES, buildSlotAssignments } from '@fm2k/match';
export {
  positionFit, selectStartingXI, calculateBestFormation, buildXISlotAssignments,
} from '@fm2k/match';
export type { SelectionOptions } from '@fm2k/match';
export { recentForm, leagueZone } from './league/form.ts';
export { computeLadderMovements } from './season/promotion.ts';
export type { LadderDivision } from './season/promotion.ts';
export type { FormResult } from './league/form.ts';
export type { TransferManagerConfig } from './transfer/transfer-manager.ts';
export type { TransferListing, TransferState } from './transfer/transfer-types.ts';
