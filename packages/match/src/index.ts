// @fm2k/match — the simulation core: domain types, position rules, ratings, the
// tactics pipeline, lineup selection, and the match simulator itself.

// Domain model
export type {
  Formation, Player, PlayerAttributes, PlayerPosition, FormationPosition, Team, TeamColors,
  TeamTactics, FieldedPositions, MatchOutcomeDecidedBy, PlayerGeometry, Band,
} from './shared/types.ts';
export { PLAYER_POSITION_LABELS, ALL_PLAYER_POSITIONS } from './shared/types.ts';
export { getEffectiveAttributes, getPositionModifier, SECONDARY_POSITIONS } from './shared/position-rules.ts';

// Ratings
export { calculateOverall, getTeamOVR, OVERALL_WEIGHTS } from './ratings.ts';

// Tactics pipeline (intent → params → squad influence → resolve)
export * from './tactics/index.ts';

// Formation layout (pure data — no selection/choice logic; that lives in @fm2k/engine)
export {
  FORMATION_LINES, buildSlotAssignments, deriveFieldedPositions,
  deriveCustomFieldedPositions, canonicalGeometry, seedGeometryFromFormation, effectiveFormationLabel,
  effectiveRole, effectiveDisplayOrder, emptySlotKey,
} from './lineup/lineup.ts';
export {
  BAND_OF_ROLE, BAND_TO_FIELD_LINE, flankOfLateral, ROLE_OPTIONS_BY_BAND,
  ROLE_FAMILY_OF_BAND, MAX_BAND_SIZE, BAND_ORDER, rankInBand, eligibleRoles, preferredRole,
} from './match/action-selector.ts';
export type { RoleFamily, BandRank } from './match/action-selector.ts';

// Position attribute importance (derived from the simulator's own formulas)
export { positionAttributeImportance } from './match/position-importance.ts';
export { SKILL_WEIGHTS, type Skill } from './match/action-generators.ts';
export { ACTION_TYPE_SKILL, type ActionType } from './match/action-selector.ts';

// Match simulation
export { MatchSimulator, isTerminalPhase } from './match/match-simulator.ts';
export type { MatchConfig } from './match/match-simulator.ts';
export { MatchOccurrence } from './match/match-occurrence.ts';
export type { MatchOccurrenceConfig } from './match/match-occurrence.ts';
export { simulateShootout } from './match/penalty-shootout.ts';
export type { ShootoutResult } from './match/penalty-shootout.ts';
export type { EventType, MatchEvent, MatchResult, MatchStatistics, MatchState, BallPosition, PassTally } from './match/types.ts';
export { StatsAccumulator, CONTESTED_ACTION_TYPES } from './match/stats.ts';
export type { ActionBreakdown, ActionTally, ContestedActionType } from './match/stats.ts';

// Standalone simulation contract
export { simulateMatch } from './match/simulate.ts';
export type {
  SimulateMatchInput, SimulateMatchResult, SideInput, PlayerMatchUpdate,
} from './match/simulate.ts';
export { generateInjuries, injuryChance, INJURY_TYPES } from './match/injury.ts';
export type { InjuryReport } from './match/injury.ts';

// Distribution harness (black-box calibration + the /test sandbox)
export { runDistribution, mulberry32 } from './match/distribution.ts';
export type { DistributionInput, DistributionResult } from './match/distribution.ts';
