import type { InjurySeverity } from '@fm2k/match';

/** Staffing posture for a built wing — describes the staffing situation, not an abstract tier. */
export type OperatingMode = 'full_staff' | 'core_staff' | 'skeleton_crew'

export type FacilityGroupId = 'medical' | 'training' | 'academy'

/** Group-scoped wing identifier — see facility-catalogue.ts for the full set per group. */
export type WingId = string

export interface WingInstance {
  mothballed: boolean
  /** True when the maintenance system (not the player) mothballed this wing. */
  forcedMothball: boolean
  mode: OperatingMode
  staffTier: 1 | 2 | 3
}

export interface FacilityGroupState {
  /** Absent key = not built. */
  wings: Partial<Record<WingId, WingInstance>>
}

export type ClubFacilities = Record<FacilityGroupId, FacilityGroupState>

/** A brand-new club: every group present, nothing built yet. */
export function createEmptyFacilities(): ClubFacilities {
  return {
    medical: { wings: {} },
    training: { wings: {} },
    academy: { wings: {} },
  };
}

export interface MedicalAxes {
  /** Prevention multiplier per severity band (1 = unfacilitated). Banded because a physio room
   *  that makes most dead legs a non-event should do nothing at all about a broken leg. The
   *  per-injury `maxAvertChance` clamp caps whatever this composes to. */
  injuryChanceMult: Record<InjurySeverity, number>
  /** Multiplier on a rolled injury's layoff in days (1 = unfacilitated), per severity band,
   *  floored per injury by its `minDurationFraction`. Proportional rather than a flat number of
   *  days, and banded for the same reason prevention is: a surgical theatre should shorten a
   *  ligament tear without also curing dead legs. */
  injuryDurationMult: Record<InjurySeverity, number>
  /** Multiplier on the *daily* passive recovery rate (1 = unfacilitated). */
  recoveryMult: number
  /** Flat fitness points added per elapsed day, outside the stamina multiplier — equal
   *  absolute help to every player, so it's worth relatively most to a weak squad. */
  recoveryFlat: number
  /** Multiplier on the fitness a match costs (1 = unfacilitated). Worth double in a
   *  two-game week, which is where it earns its keep. */
  matchDrainMult: number
  /** One-off flat fitness restored immediately after each match played. Scales with
   *  fixture congestion rather than with the calendar. */
  postMatchRecovery: number
}

export interface TrainingAxes {
  growthBonus: number
  ceilingBonus: number
}

export interface YouthBias {
  overallBonus: number
  potentialRangeBonus: [number, number]
  nationalityPool: string[]
  gkOverallBonus: number
  gkPotentialRangeBonus: [number, number]
}

export interface AcademyIntakeQualityBonus {
  overallBonus: number
  potentialRangeBonus: [number, number]
}

export type WingEffects = Partial<{
  knockChanceMult: number
  moderateChanceMult: number
  seriousChanceMult: number
  knockDurationMult: number
  moderateDurationMult: number
  seriousDurationMult: number
  recoveryMult: number
  recoveryFlat: number
  matchDrainMult: number
  postMatchRecovery: number
  growthBonus: number
  ceilingBonus: number
  gkGrowthBonus: number
  overallBonus: number
  potentialRangeBonus: [number, number]
  nationalityPool: string[]
  gkOverallBonus: number
  gkPotentialRangeBonus: [number, number]
  youthGrowthBonus: number
  /** Under-22s only. Applies to the knock and moderate bands — youth conditioning science
   *  prevents the breakdowns young bodies are prone to, not catastrophic contact injuries. */
  youthInjuryChanceMult: number
  youthRecoveryFlat: number
  intakeOverallBonus: number
  intakePotentialRangeBonus: [number, number]
}>

export interface WingDefinition {
  name: string
  description: string
  costTier: 'basic' | 'standard' | 'premium'
  buildCost: number
  /** Weekly upkeep at full_staff, indexed by staffTier - 1. */
  tierUpkeep: [number, number, number]
  effects: WingEffects
}

export type MaintenanceEvent =
  { type: 'forced_mothball'; group: FacilityGroupId; wingId: WingId }

export interface MaintenanceTickResult {
  facilities: ClubFacilities
  /** Total upkeep owed this tick, summed across all groups. */
  totalUpkeep: number
  /** Consecutive weekly ticks the club's post-billing budget has ended negative; resets to 0
   *  once non-negative, or once it triggers a club-wide forced mothball. */
  deficitStreak: number
  events: MaintenanceEvent[]
}
