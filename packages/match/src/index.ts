// @fm2k/match — the simulation core: domain types, ratings, the tactics pipeline,
// formation layout helpers, and the match simulator itself.
//
// FROZEN v2 CONTRACT (REWORK_01.md §9): external consumers get the domain model,
// `MatchOccurrence` + its config, and the event/result/statistics shapes below.
// Simulator internals (action generation/selection, skill checks, engagement,
// stats plumbing) are NOT exported — the v2 duel engine replaces them behind
// this same surface.

// Domain model
export type {
  Formation, Player, PlayerAttributes, PlayerPosition, FormationPosition, Team, TeamColors,
  TeamTactics, FieldedPositions, MatchOutcomeDecidedBy, PlayerGeometry, TeamShapes, Band,
} from './shared/types.ts';
export { PLAYER_POSITION_LABELS, ALL_PLAYER_POSITIONS } from './shared/types.ts';
export { SECONDARY_POSITIONS } from './shared/position-rules.ts';

// Ratings
export { calculateOverall, getTeamOVR } from './ratings.ts';

// Tactics pipeline — only the entry points the backend/UI actually consume
export type { TacticalStyleId, TacticalSliders, TeamTacticsIntent } from './tactics/intent-types.ts';
export { TACTICAL_STYLE_IDS, defaultIntent } from './tactics/intent-types.ts';
export { NEUTRAL_PARAMS } from './tactics/match-parameters.ts';
export { STYLE_TENDENCIES } from './tactics/style-tendencies.ts';
export { formationToStyle, aiIntent } from './tactics/ai-style.ts';
export { resolveMatchParameters } from './tactics/resolve.ts';
export type { MatchInsight, InsightCategory } from './tactics/feedback.ts';
export { buildMatchInsights } from './tactics/feedback.ts';

// Formation layout (pure data — no selection/choice logic; that lives in @fm2k/engine)
export {
  FORMATION_LINES, buildSlotAssignments, deriveFieldedPositions,
  canonicalGeometry, seedGeometryFromFormation, seedShapesFromFormation, ROLE_CANONICAL_LATERAL,
  deriveRolesForShape, effectiveFormationLabel,
  effectiveDisplayOrder, emptySlotKey,
} from './lineup/lineup.ts';
export { BAND_OF_ROLE, MAX_BAND_SIZE, BAND_ORDER } from './lineup/bands.ts';

// Position attribute importance (derived from the simulator's own formulas).
// Consumed by player generation and the tactics UI; replaced by duel-exposure
// derivation in the v2 rework (REWORK_01.md, Step 5).
export { positionAttributeImportance } from './match/position-importance.ts';

// Match simulation — the boundary the backend drives
export { MatchOccurrence } from './match/match-occurrence.ts';
export type { MatchOccurrenceConfig } from './match/match-occurrence.ts';
export type { EventType, MatchEvent, MatchResult, MatchStatistics, DuelTally } from './match/types.ts';
export type { DuelType } from './match/duel/duels.ts';
export type { InjuryReport } from './match/injury.ts';

// Standalone simulation contract (the /test sandbox + calibration)
export { simulateMatch } from './match/simulate.ts';
export type {
  SimulateMatchInput, SimulateMatchResult, SideInput, PlayerMatchUpdate,
} from './match/simulate.ts';

// Distribution harness (black-box calibration + the /test sandbox)
export { runDistribution, mulberry32 } from './match/distribution.ts';
export type { DistributionInput, DistributionResult } from './match/distribution.ts';
