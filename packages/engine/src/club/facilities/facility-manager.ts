import { FIELD_LINE, type InjurySeverity, type Player, type PlayerAttributes } from '@fm2k/match';
import {
  ACADEMY_DEVELOPMENT_WING_IDS,
  ACADEMY_HUB_WING_IDS,
  FACILITY_CATALOGUE,
} from './facility-catalogue.ts';
import {
  DEFICIT_WEEKS_BEFORE_MOTHBALL,
  MODE_COST_MULT,
  MODE_EFFECT_MULT,
  MOTHBALLED_COST_MULT,
  SKELETON_STRUCTURAL_FLOOR,
  YOUTH_AGE_CUTOFF,
} from './facility-weights.ts';
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
} from './facility-types.ts';

function effectMult(wing: WingInstance): number {
  if (wing.mothballed) { return 0; }
  const base = MODE_EFFECT_MULT[wing.mode];
  return wing.mode === 'skeleton_crew' ? base + SKELETON_STRUCTURAL_FLOOR : base;
}

function costMult(wing: WingInstance): number {
  return wing.mothballed ? MOTHBALLED_COST_MULT : MODE_COST_MULT[wing.mode];
}

function wingWeeklyUpkeep(def: WingDefinition, wing: WingInstance): number {
  return def.tierUpkeep[wing.staffTier - 1] * costMult(wing);
}

function builtWings(
  group: FacilityGroupId,
  facilities: ClubFacilities,
): Array<{ id: WingId; def: WingDefinition; instance: WingInstance }> {
  const catalogue = FACILITY_CATALOGUE[group];
  const groupState = facilities[group];
  const result: Array<{ id: WingId; def: WingDefinition; instance: WingInstance }> = [];
  for (const id of Object.keys(catalogue)) {
    const instance = groupState.wings[id];
    if (instance) { result.push({ id, def: catalogue[id], instance }); }
  }
  return result;
}

export class FacilityManager {
  /** `player`, if given, additionally folds in the Youth Sports Science Unit's injury-chance
   *  and recovery contributions when the player is at or under the youth age cutoff — a
   *  Youth Academy development wing, not a Medical one, so it's only applied per-player here
   *  rather than being part of the unconditional medical wing sum above. */
  static medicalAxes(facilities: ClubFacilities, player?: Player): MedicalAxes {
    const injuryChanceMult: Record<InjurySeverity, number> = { knock: 1, moderate: 1, serious: 1 };
    const injuryDurationMult: Record<InjurySeverity, number> = { knock: 1, moderate: 1, serious: 1 };
    let recoveryMult = 1;
    let recoveryFlat = 0;
    let matchDrainMult = 1;
    let postMatchRecovery = 0;
    /** Wings compose multiplicatively, each scaled down by how the wing is staffed. */
    const compose = (current: number, effect: number | undefined, mult: number): number =>
      effect === undefined ? current : current * (1 - (1 - effect) * mult);

    for (const { def, instance } of builtWings('medical', facilities)) {
      const mult = effectMult(instance);
      injuryChanceMult.knock = compose(injuryChanceMult.knock, def.effects.knockChanceMult, mult);
      injuryChanceMult.moderate = compose(injuryChanceMult.moderate, def.effects.moderateChanceMult, mult);
      injuryChanceMult.serious = compose(injuryChanceMult.serious, def.effects.seriousChanceMult, mult);
      injuryDurationMult.knock = compose(injuryDurationMult.knock, def.effects.knockDurationMult, mult);
      injuryDurationMult.moderate = compose(injuryDurationMult.moderate, def.effects.moderateDurationMult, mult);
      injuryDurationMult.serious = compose(injuryDurationMult.serious, def.effects.seriousDurationMult, mult);
      recoveryMult += (def.effects.recoveryMult ?? 0) * mult;
      recoveryFlat += (def.effects.recoveryFlat ?? 0) * mult;
      if (def.effects.matchDrainMult !== undefined) {
        matchDrainMult *= 1 - (1 - def.effects.matchDrainMult) * mult;
      }
      postMatchRecovery += (def.effects.postMatchRecovery ?? 0) * mult;
    }
    if (player && player.age <= YOUTH_AGE_CUTOFF) {
      for (const { id, def, instance } of builtWings('academy', facilities)) {
        if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue; }
        const mult = effectMult(instance);
        const youth = def.effects.youthInjuryChanceMult;
        injuryChanceMult.knock = compose(injuryChanceMult.knock, youth, mult);
        injuryChanceMult.moderate = compose(injuryChanceMult.moderate, youth, mult);
        recoveryFlat += (def.effects.youthRecoveryFlat ?? 0) * mult;
      }
    }
    return {
      injuryChanceMult, injuryDurationMult,
      recoveryMult, recoveryFlat, matchDrainMult, postMatchRecovery,
    };
  }

  /** The training estate as it applies to *this* player: the position- and age-scoped wings are
   *  resolved here, so a keeper and a striker at the same club come out with different numbers.
   *  Attribute scoping cannot be resolved yet — which attribute is being trained isn't known
   *  until the progression layer picks one — so it travels as a map. */
  static trainingAxes(facilities: ClubFacilities, player: Player): TrainingAxes {
    let growthBonus = 0;
    let ceilingBonus = 0;
    let declineResist = 1;
    let potentialFloor = 0;
    const attrGrowthBonus: Partial<Record<keyof PlayerAttributes, number>> = {};
    const line = FIELD_LINE[player.position];
    for (const { def, instance } of builtWings('training', facilities)) {
      const mult = effectMult(instance);
      growthBonus += (def.effects.growthBonus ?? 0) * mult;
      ceilingBonus += (def.effects.ceilingBonus ?? 0) * mult;
      growthBonus += (def.effects.positionGrowthBonus?.[line] ?? 0) * mult;
      for (const [attr, bonus] of Object.entries(def.effects.attrGrowthBonus ?? {})) {
        const key = attr as keyof PlayerAttributes;
        attrGrowthBonus[key] = (attrGrowthBonus[key] ?? 0) + bonus * mult;
      }
      // Resistances compose the way the medical multipliers do: each wing removes its share of
      // what is *left*, so stacking them approaches zero without ever making decline impossible.
      const resist = def.effects.declineResist;
      if (resist !== undefined) { declineResist *= 1 - (1 - resist) * mult; }
      // A floor is the best one you have, not the sum of them — two wings that each promise to
      // develop anyone as a 65 still only develop them as a 65.
      potentialFloor = Math.max(potentialFloor, (def.effects.potentialFloor ?? 0) * mult);
    }
    if (player.age <= YOUTH_AGE_CUTOFF) {
      for (const { id, def, instance } of builtWings('academy', facilities)) {
        if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue; }
        growthBonus += (def.effects.youthGrowthBonus ?? 0) * effectMult(instance);
        ceilingBonus += (def.effects.youthCeilingBonus ?? 0) * effectMult(instance);
      }
    }
    return { growthBonus, ceilingBonus, attrGrowthBonus, declineResist, potentialFloor };
  }

  static academyRecruitmentBias(facilities: ClubFacilities): YouthBias {
    let overallBonus = 0;
    let potentialLow = 0;
    let potentialHigh = 0;
    let intakeAgeBias = 0;
    let wonderkidChance = 0;
    const nationalityPool: string[] = [];
    for (const { id, def, instance } of builtWings('academy', facilities)) {
      if (!ACADEMY_HUB_WING_IDS.includes(id)) { continue; }
      const mult = effectMult(instance);
      overallBonus += (def.effects.overallBonus ?? 0) * mult;
      const [lo, hi] = def.effects.potentialRangeBonus ?? [0, 0];
      potentialLow += lo * mult;
      potentialHigh += hi * mult;
      if (def.effects.nationalityPool) { nationalityPool.push(...def.effects.nationalityPool); }
      intakeAgeBias += (def.effects.intakeAgeBias ?? 0) * mult;
      // Chances compose as independent draws rather than summing, so stacking hubs can never
      // guarantee a wonderkid — the tail stays a tail.
      wonderkidChance = 1 - (1 - wonderkidChance) * (1 - (def.effects.wonderkidChance ?? 0) * mult);
    }
    return {
      overallBonus,
      potentialRangeBonus: [potentialLow, potentialHigh],
      nationalityPool,
      intakeAgeBias,
      wonderkidChance,
    };
  }

  static academyIntakeQualityBonus(facilities: ClubFacilities): AcademyIntakeQualityBonus {
    let overallBonus = 0;
    let potentialLow = 0;
    let potentialHigh = 0;
    let intakeAgeBias = 0;
    for (const { id, def, instance } of builtWings('academy', facilities)) {
      if (!ACADEMY_DEVELOPMENT_WING_IDS.includes(id)) { continue; }
      const mult = effectMult(instance);
      overallBonus += (def.effects.intakeOverallBonus ?? 0) * mult;
      const [lo, hi] = def.effects.intakePotentialRangeBonus ?? [0, 0];
      potentialLow += lo * mult;
      potentialHigh += hi * mult;
      intakeAgeBias += (def.effects.intakeAgeBias ?? 0) * mult;
    }
    return { overallBonus, potentialRangeBonus: [potentialLow, potentialHigh], intakeAgeBias };
  }

  /** The full bias fed to makeYouth: the recruitment hubs' bias, plus the development wings'
   *  intake-quality bonus layered on top. */
  static academyBias(facilities: ClubFacilities): YouthBias {
    const recruitment = FacilityManager.academyRecruitmentBias(facilities);
    const intake = FacilityManager.academyIntakeQualityBonus(facilities);
    return {
      ...recruitment,
      overallBonus: recruitment.overallBonus + intake.overallBonus,
      potentialRangeBonus: [
        recruitment.potentialRangeBonus[0] + intake.potentialRangeBonus[0],
        recruitment.potentialRangeBonus[1] + intake.potentialRangeBonus[1],
      ],
      intakeAgeBias: recruitment.intakeAgeBias + intake.intakeAgeBias,
    };
  }

  static wingCost(
    group: FacilityGroupId,
    wingId: WingId,
    facilities: ClubFacilities,
  ): { buildCost: number; weeklyUpkeep: number } {
    const def = FACILITY_CATALOGUE[group][wingId];
    const instance = facilities[group].wings[wingId];
    return {
      buildCost: def.buildCost,
      weeklyUpkeep: instance ? wingWeeklyUpkeep(def, instance) : def.tierUpkeep[0],
    };
  }

  static maintenanceSummary(
    facilities: ClubFacilities,
  ): Record<FacilityGroupId, { upkeep: number }> {
    const groups: FacilityGroupId[] = ['medical', 'training', 'academy'];
    const result = {} as Record<FacilityGroupId, { upkeep: number }>;
    for (const group of groups) {
      result[group] = { upkeep: totalWeeklyUpkeep(group, facilities) };
    }
    return result;
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
    const next: ClubFacilities = structuredClone(facilities);
    const events: MaintenanceEvent[] = [];
    const groups: FacilityGroupId[] = ['medical', 'training', 'academy'];

    // A wing the player manually un-mothballed since the last tick is no longer "forced".
    for (const group of groups) {
      for (const wingId of Object.keys(next[group].wings)) {
        const instance = next[group].wings[wingId]!;
        if (!instance.mothballed && instance.forcedMothball) {
          instance.forcedMothball = false;
        }
      }
    }

    const totalUpkeep = groups.reduce((sum, group) => sum + totalWeeklyUpkeep(group, next), 0);
    let nextStreak = deficitStreak;

    if (budget - totalUpkeep < 0) {
      nextStreak += 1;
      if (nextStreak >= DEFICIT_WEEKS_BEFORE_MOTHBALL) {
        for (const group of groups) {
          for (const wingId of Object.keys(next[group].wings)) {
            const instance = next[group].wings[wingId]!;
            if (instance.mothballed) { continue; }
            instance.mothballed = true;
            instance.forcedMothball = true;
            events.push({ type: 'forced_mothball', group, wingId });
          }
        }
        nextStreak = 0;
      }
    } else {
      nextStreak = 0;
    }

    return { facilities: next, totalUpkeep, deficitStreak: nextStreak, events };
  }
}

function totalWeeklyUpkeep(group: FacilityGroupId, facilities: ClubFacilities): number {
  return builtWings(group, facilities)
    .filter(({ instance }) => !instance.mothballed)
    .reduce((sum, { def, instance }) => sum + wingWeeklyUpkeep(def, instance), 0);
}
