// @fm2k/match — the simulation core: domain types, position rules, ratings, the
// tactics pipeline, lineup selection, and the match simulator itself.

// Domain model
export type { Formation, Player, PlayerAttributes, Position, Team, TeamColors, TeamTactics } from './shared/types.ts';
export { getEffectiveAttributes, getPositionModifier } from './shared/position-rules.ts';

// Ratings
export { calculateOverall, getTeamOVR, OVERALL_WEIGHTS } from './ratings.ts';

// Tactics pipeline (intent → params → squad influence → resolve)
export * from './tactics/index.ts';

// Lineup selection
export { FORMATION_LINES, buildSlotAssignments } from './lineup/lineup.ts';
export { positionFit, selectStartingXI, calculateBestFormation, buildXISlotAssignments } from './lineup/selection.ts';
export type { SelectionOptions } from './lineup/selection.ts';

// Match simulation
export { MatchSimulator, isTerminalPhase } from './match/match-simulator.ts';
export type { MatchConfig } from './match/match-simulator.ts';
export { MatchOccurrence } from './match/match-occurrence.ts';
export type { MatchOccurrenceConfig } from './match/match-occurrence.ts';
export { simulateShootout } from './match/penalty-shootout.ts';
export type { ShootoutResult } from './match/penalty-shootout.ts';
export type { EventType, MatchEvent, MatchResult, MatchStatistics, MatchState, BallPosition } from './match/types.ts';

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
