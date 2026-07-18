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
  injuryDurationReduction: number
  injuryChanceMult: number
  recoveryMult: number
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
  injuryDurationReduction: number
  injuryChanceMult: number
  recoveryMult: number
  growthBonus: number
  ceilingBonus: number
  gkGrowthBonus: number
  overallBonus: number
  potentialRangeBonus: [number, number]
  nationalityPool: string[]
  gkOverallBonus: number
  gkPotentialRangeBonus: [number, number]
  youthGrowthBonus: number
  youthInjuryChanceMult: number
  youthRecoveryMult: number
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
