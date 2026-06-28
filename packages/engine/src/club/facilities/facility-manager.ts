import type { Player } from '@fm2k/match'
import {
  ACADEMY_DEVELOPMENT_WING_IDS,
  ACADEMY_HUB_WING_IDS,
  FACILITY_CATALOGUE,
} from './facility-catalogue.ts'
import {
  DEFICIT_WEEKS_BEFORE_MOTHBALL,
  MODE_COST_MULT,
  MODE_EFFECT_MULT,
  MOTHBALLED_COST_MULT,
  SKELETON_STRUCTURAL_FLOOR,
  YOUTH_AGE_CUTOFF,
} from './facility-weights.ts'
import type {
  AcademyIntakeQualityBonus,
  ClubFacilities,
  FacilityGroupId,
  MaintenanceEvent,
  MaintenanceTickResult,
  MedicalAxes,
  TrainingAxes,
  WingDefinition,
  WingId,
  WingInstance,
  YouthBias,
} from './facility-types.ts'

function effectMult(wing: WingInstance): number {
  if (wing.mothballed) { return 0 }
  const base = MODE_EFFECT_MULT[wing.mode]
  return wing.mode === 'skeleton_crew' ? base + SKELETON_STRUCTURAL_FLOOR : base
}

function costMult(wing: WingInstance): number {
  return wing.mothballed ? MOTHBALLED_COST_MULT : MODE_COST_MULT[wing.mode]
}

function wingWeeklyUpkeep(def: WingDefinition, wing: WingInstance): number {
  return def.tierUpkeep[wing.staffTier - 1] * costMult(wing)
}

function builtWings(
  group: FacilityGroupId,
  facilities: ClubFacilities,
): Array<{ id: WingId; def: WingDefinition; instance: WingInstance }> {
  const catalogue = FACILITY_CATALOGUE[group]
  const groupState = facilities[group]
  const result: Array<{ id: WingId; def: WingDefinition; instance: WingInstance }> = []
  for (const id of Object.keys(catalogue)) {
    const instance = groupState.wings[id]
    if (instance) { result.push({ id, def: catalogue[id], instance }) }
  }
  return result
}

export class FacilityManager {
  /** `player`, if given, additionally folds in the Youth Sports Science Unit's injury-chance
   *  and recovery contributions when the player is at or under the youth age cutoff — a
   *  Youth Academy development wing, not a Medical one, so it's only applied per-player here
   *  rather than being part of the unconditional medical wing sum above. */
  static medicalAxes(facilities: ClubFacilities, player?: Player): MedicalAxes {
    let injuryDurationReduction = 0
    let injuryChanceMult = 1
    let recoveryMult = 1
    for (const { def, instance } of builtWings('medical', facilities)) {
      const mult = effectMult(instance)
      injuryDurationReduction += (def.effects.injuryDurationReduction ?? 0) * mult
      if (def.effects.injuryChanceMult !== undefined) {
        injuryChanceMult *= 1 - (1 - def.effects.injuryChanceMult) * mult
      }
      recoveryMult += (def.effects.recoveryMult ?? 0) * mult
    }
    if (player && player.age <= YOUTH_AGE_CUTOFF) {
      for (const { id, def, instance } of builtWings('academy', facilities)) {
        if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue }
        const mult = effectMult(instance)
        if (def.effects.youthInjuryChanceMult !== undefined) {
          injuryChanceMult *= 1 - (1 - def.effects.youthInjuryChanceMult) * mult
        }
        recoveryMult += (def.effects.youthRecoveryMult ?? 0) * mult
      }
    }
    return { injuryDurationReduction, injuryChanceMult, recoveryMult }
  }

  static trainingAxes(facilities: ClubFacilities, player: Player): TrainingAxes {
    let growthBonus = 0
    let ceilingBonus = 0
    for (const { def, instance } of builtWings('training', facilities)) {
      const mult = effectMult(instance)
      growthBonus += (def.effects.growthBonus ?? 0) * mult
      ceilingBonus += (def.effects.ceilingBonus ?? 0) * mult
      if (player.position === 'GK') {
        growthBonus += (def.effects.gkGrowthBonus ?? 0) * mult
      }
    }
    if (player.age <= YOUTH_AGE_CUTOFF) {
      for (const { id, def, instance } of builtWings('academy', facilities)) {
        if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue }
        growthBonus += (def.effects.youthGrowthBonus ?? 0) * effectMult(instance)
      }
    }
    return { growthBonus, ceilingBonus }
  }

  static academyRecruitmentBias(facilities: ClubFacilities): YouthBias {
    let overallBonus = 0
    let potentialLow = 0
    let potentialHigh = 0
    const nationalityPool: string[] = []
    let gkOverallBonus = 0
    let gkPotentialLow = 0
    let gkPotentialHigh = 0
    for (const { id, def, instance } of builtWings('academy', facilities)) {
      if (!ACADEMY_HUB_WING_IDS.includes(id)) { continue }
      const mult = effectMult(instance)
      overallBonus += (def.effects.overallBonus ?? 0) * mult
      const [lo, hi] = def.effects.potentialRangeBonus ?? [0, 0]
      potentialLow += lo * mult
      potentialHigh += hi * mult
      if (def.effects.nationalityPool) { nationalityPool.push(...def.effects.nationalityPool) }
      gkOverallBonus += (def.effects.gkOverallBonus ?? 0) * mult
      const [gkLo, gkHi] = def.effects.gkPotentialRangeBonus ?? [0, 0]
      gkPotentialLow += gkLo * mult
      gkPotentialHigh += gkHi * mult
    }
    return {
      overallBonus,
      potentialRangeBonus: [potentialLow, potentialHigh],
      nationalityPool,
      gkOverallBonus,
      gkPotentialRangeBonus: [gkPotentialLow, gkPotentialHigh],
    }
  }

  static academyIntakeQualityBonus(facilities: ClubFacilities): AcademyIntakeQualityBonus {
    let overallBonus = 0
    let potentialLow = 0
    let potentialHigh = 0
    for (const { id, def, instance } of builtWings('academy', facilities)) {
      if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue }
      const mult = effectMult(instance)
      overallBonus += (def.effects.intakeOverallBonus ?? 0) * mult
      const [lo, hi] = def.effects.intakePotentialRangeBonus ?? [0, 0]
      potentialLow += lo * mult
      potentialHigh += hi * mult
    }
    return { overallBonus, potentialRangeBonus: [potentialLow, potentialHigh] }
  }

  /** The full bias fed to makeYouth: Regional Scouting Hubs' recruitment bias, plus the
   *  Academy Boarding House's intake-quality bonus layered on top of the outfield bonus
   *  (the Boarding House isn't goalkeeper-specific, so it doesn't touch the gk fields). */
  static academyBias(facilities: ClubFacilities): YouthBias {
    const recruitment = FacilityManager.academyRecruitmentBias(facilities)
    const intake = FacilityManager.academyIntakeQualityBonus(facilities)
    return {
      ...recruitment,
      overallBonus: recruitment.overallBonus + intake.overallBonus,
      potentialRangeBonus: [
        recruitment.potentialRangeBonus[0] + intake.potentialRangeBonus[0],
        recruitment.potentialRangeBonus[1] + intake.potentialRangeBonus[1],
      ],
    }
  }

  static wingCost(
    group: FacilityGroupId,
    wingId: WingId,
    facilities: ClubFacilities,
  ): { buildCost: number; weeklyUpkeep: number } {
    const def = FACILITY_CATALOGUE[group][wingId]
    const instance = facilities[group].wings[wingId]
    return {
      buildCost: def.buildCost,
      weeklyUpkeep: instance ? wingWeeklyUpkeep(def, instance) : def.tierUpkeep[0],
    }
  }

  static maintenanceSummary(
    facilities: ClubFacilities,
  ): Record<FacilityGroupId, { upkeep: number }> {
    const groups: FacilityGroupId[] = ['medical', 'training', 'academy']
    const result = {} as Record<FacilityGroupId, { upkeep: number }>
    for (const group of groups) {
      result[group] = { upkeep: totalWeeklyUpkeep(group, facilities) }
    }
    return result
  }

  /** Bills the club's normal weekly upkeep with no cap — `budget` is allowed to go negative.
   *  If the post-billing budget is negative for `DEFICIT_WEEKS_BEFORE_MOTHBALL` consecutive
   *  calls, every built, non-mothballed wing club-wide is force-mothballed in this same tick and
   *  the streak resets; a non-negative budget resets the streak with no other effect. */
  static tickMaintenance(
    facilities: ClubFacilities,
    budget: number,
    deficitStreak: number,
  ): MaintenanceTickResult {
    const next: ClubFacilities = structuredClone(facilities)
    const events: MaintenanceEvent[] = []
    const groups: FacilityGroupId[] = ['medical', 'training', 'academy']

    // A wing the player manually un-mothballed since the last tick is no longer "forced".
    for (const group of groups) {
      for (const wingId of Object.keys(next[group].wings)) {
        const instance = next[group].wings[wingId]!
        if (!instance.mothballed && instance.forcedMothball) {
          instance.forcedMothball = false
        }
      }
    }

    const totalUpkeep = groups.reduce((sum, group) => sum + totalWeeklyUpkeep(group, next), 0)
    let nextStreak = deficitStreak

    if (budget - totalUpkeep < 0) {
      nextStreak += 1
      if (nextStreak >= DEFICIT_WEEKS_BEFORE_MOTHBALL) {
        for (const group of groups) {
          for (const wingId of Object.keys(next[group].wings)) {
            const instance = next[group].wings[wingId]!
            if (instance.mothballed) { continue }
            instance.mothballed = true
            instance.forcedMothball = true
            events.push({ type: 'forced_mothball', group, wingId })
          }
        }
        nextStreak = 0
      }
    } else {
      nextStreak = 0
    }

    return { facilities: next, totalUpkeep, deficitStreak: nextStreak, events }
  }
}

function totalWeeklyUpkeep(group: FacilityGroupId, facilities: ClubFacilities): number {
  return builtWings(group, facilities)
    .filter(({ instance }) => !instance.mothballed)
    .reduce((sum, { def, instance }) => sum + wingWeeklyUpkeep(def, instance), 0)
}
