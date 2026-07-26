import { describe, expect, it } from 'vitest';
import type { Player } from '@fm2k/match';
import { FacilityManager } from './facility-manager.ts';
import { FACILITY_CATALOGUE, ACADEMY_HUB_WING_IDS } from './facility-catalogue.ts';
import { createEmptyFacilities as emptyFacilities } from './facility-types.ts';
import type { ClubFacilities, FacilityGroupId, WingId, WingInstance } from './facility-types.ts';
import { DEFICIT_WEEKS_BEFORE_MOTHBALL, YOUTH_AGE_CUTOFF } from './facility-weights.ts';

function wing(overrides: Partial<WingInstance> = {}): WingInstance {
  return {
    mothballed: false,
    forcedMothball: false,
    mode: 'full_staff',
    staffTier: 1,
    ...overrides,
  };
}

function build(facilities: ClubFacilities, group: FacilityGroupId, wingId: WingId, overrides: Partial<WingInstance> = {}): void {
  facilities[group].wings[wingId] = wing(overrides);
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1', name: 'Test Player', nationality: 'Norwegian', age: 25, position: 'CM', potential: 70,
    attributes: {
      speed: 10, strength: 10,
      passing: 10, finishing: 10, technique: 10,
      defending: 10, stamina: 10,
    },
    ...overrides,
  } as Player;
}

describe('FacilityManager.medicalAxes', () => {
  it('returns the no-op identity when no wings are built', () => {
    expect(FacilityManager.medicalAxes(emptyFacilities())).toEqual({
      injuryChanceMult: { knock: 1, moderate: 1, serious: 1 },
      injuryDurationMult: { knock: 1, moderate: 1, serious: 1 },
      recoveryMult: 1, recoveryFlat: 0, matchDrainMult: 1, postMatchRecovery: 0,
    });
  });

  it('compounds duration multipliers across built wings, and sums recovery bonuses', () => {
    const M = FACILITY_CATALOGUE.medical;
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'pitchSidePhysioUnit');
    build(facilities, 'medical', 'rehabGym');
    build(facilities, 'medical', 'hydrotherapyPool');
    const axes = FacilityManager.medicalAxes(facilities);
    // The moderate band is where both wings overlap, so it proves they compound rather than
    // one winning. The serious band only the rehab gym touches, so it proves the physio unit
    // does not silently leak into a band it declares nothing for.
    expect(axes.injuryDurationMult.moderate).toBeCloseTo(
      (M.pitchSidePhysioUnit.effects.moderateDurationMult ?? 1) * (M.rehabGym.effects.moderateDurationMult ?? 1),
    );
    expect(axes.injuryDurationMult.serious).toBeCloseTo(M.rehabGym.effects.seriousDurationMult ?? 1);
    expect(axes.recoveryMult).toBeCloseTo(1 + (M.hydrotherapyPool.effects.recoveryMult ?? 0));
  });

  it('sums the flat per-day recovery trickle across the basic recovery wings', () => {
    const M = FACILITY_CATALOGUE.medical;
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'iceBathRecoverySuite');
    build(facilities, 'medical', 'massageTherapySuite');
    expect(FacilityManager.medicalAxes(facilities).recoveryFlat).toBeCloseTo(
      (M.iceBathRecoverySuite.effects.recoveryFlat ?? 0) + (M.massageTherapySuite.effects.recoveryFlat ?? 0),
    );
  });

  it('combines match-drain multipliers multiplicatively and leaves the other axes untouched', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'nutritionSportsScienceUnit');
    const axes = FacilityManager.medicalAxes(facilities);
    expect(axes.matchDrainMult).toBeCloseTo(
      FACILITY_CATALOGUE.medical.nutritionSportsScienceUnit.effects.matchDrainMult ?? 1,
    );
    expect(axes.recoveryFlat).toBe(0);
    expect(axes.postMatchRecovery).toBe(0);
  });

  it('sums the per-match bounce-back from the premium recovery wing', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'cryotherapyChamber');
    expect(FacilityManager.medicalAxes(facilities).postMatchRecovery).toBeCloseTo(
      FACILITY_CATALOGUE.medical.cryotherapyChamber.effects.postMatchRecovery ?? 0,
    );
  });

  it('adds the youth sports-science flat recovery only for under-22s', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'youthSportsScienceUnit');
    const expected = FACILITY_CATALOGUE.academy.youthSportsScienceUnit.effects.youthRecoveryFlat ?? 0;
    expect(FacilityManager.medicalAxes(facilities, makePlayer({ age: 20 })).recoveryFlat).toBeCloseTo(expected);
    expect(FacilityManager.medicalAxes(facilities, makePlayer({ age: 25 })).recoveryFlat).toBe(0);
  });

  it('combines injury-chance multipliers multiplicatively, per severity band', () => {
    const M = FACILITY_CATALOGUE.medical;
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'massageTherapySuite');
    build(facilities, 'medical', 'nutritionSportsScienceUnit');
    const axes = FacilityManager.medicalAxes(facilities);
    expect(axes.injuryChanceMult.knock).toBeCloseTo(
      (M.massageTherapySuite.effects.knockChanceMult ?? 1)
      * (M.nutritionSportsScienceUnit.effects.knockChanceMult ?? 1),
    );
    expect(axes.injuryChanceMult.moderate).toBeCloseTo(
      (M.massageTherapySuite.effects.moderateChanceMult ?? 1)
      * (M.nutritionSportsScienceUnit.effects.moderateChanceMult ?? 1),
    );
  });

  it('keeps the youth injury benefit off the serious band — conditioning is not armour', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'youthSportsScienceUnit');
    const axes = FacilityManager.medicalAxes(facilities, makePlayer({ age: 20 }));
    const expected = FACILITY_CATALOGUE.academy.youthSportsScienceUnit.effects.youthInjuryChanceMult ?? 1;
    expect(axes.injuryChanceMult.knock).toBeCloseTo(expected);
    expect(axes.injuryChanceMult.moderate).toBeCloseTo(expected);
    expect(axes.injuryChanceMult.serious).toBe(1);
  });

  it('contributes nothing from a mothballed wing', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'rehabGym', { mothballed: true });
    expect(FacilityManager.medicalAxes(facilities).injuryDurationMult.moderate).toBe(1);
  });

  it('applies the core_staff effect multiplier (40%)', () => {
    const facilities = emptyFacilities();
    const base = FACILITY_CATALOGUE.medical.rehabGym.effects.moderateDurationMult ?? 1;
    build(facilities, 'medical', 'rehabGym', { mode: 'core_staff' });
    expect(FacilityManager.medicalAxes(facilities).injuryDurationMult.moderate)
      .toBeCloseTo(1 - (1 - base) * 0.4);
  });

  it('applies the skeleton_crew structural floor (5%) instead of zero', () => {
    const facilities = emptyFacilities();
    const base = FACILITY_CATALOGUE.medical.rehabGym.effects.moderateDurationMult ?? 1;
    build(facilities, 'medical', 'rehabGym', { mode: 'skeleton_crew' });
    expect(FacilityManager.medicalAxes(facilities).injuryDurationMult.moderate)
      .toBeCloseTo(1 - (1 - base) * 0.05);
  });
});

describe('FacilityManager.trainingAxes', () => {
  const TRAINING = FACILITY_CATALOGUE.training;

  it('sums growthBonus and ceilingBonus across built training wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'training', 'indoorPitch');
    build(facilities, 'training', 'sportsScienceAnalyticsLab');
    const axes = FacilityManager.trainingAxes(facilities, makePlayer());
    const expected = ['indoorPitch', 'sportsScienceAnalyticsLab']
      .map(id => TRAINING[id].effects);
    expect(axes.growthBonus).toBeCloseTo(expected.reduce((s, e) => s + (e.growthBonus ?? 0), 0));
    expect(axes.ceilingBonus).toBe(expected.reduce((s, e) => s + (e.ceilingBonus ?? 0), 0));
  });

  it('accumulates attrGrowthBonus per attribute, summing wings that overlap', () => {
    // The set-piece pitch and the technical pitch both develop passing; a player training
    // passing should get both, while an attribute only one of them covers gets only that one.
    const facilities = emptyFacilities();
    build(facilities, 'training', 'outdoorTechnicalPitch');
    build(facilities, 'training', 'setPiecePitch');
    const { attrGrowthBonus } = FacilityManager.trainingAxes(facilities, makePlayer());
    const pitch = TRAINING.outdoorTechnicalPitch.effects.attrGrowthBonus!;
    const setPiece = TRAINING.setPiecePitch.effects.attrGrowthBonus!;
    expect(attrGrowthBonus.passing).toBeCloseTo(pitch.passing! + setPiece.passing!);
    expect(attrGrowthBonus.technique).toBeCloseTo(pitch.technique!);
    expect(attrGrowthBonus.finishing).toBeCloseTo(setPiece.finishing!);
    expect(attrGrowthBonus.defending).toBeUndefined();
  });

  it('applies positionGrowthBonus only to players in the wing\'s field line', () => {
    const facilities = emptyFacilities();
    build(facilities, 'training', 'goalkeepingTrainingUnit');
    const gkBonus = TRAINING.goalkeepingTrainingUnit.effects.positionGrowthBonus!.GK!;
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ position: 'CM' })).growthBonus).toBe(0);
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ position: 'GK' })).growthBonus)
      .toBeCloseTo(gkBonus);
  });

  it('gives every field line exactly one specialist wing, so no position is orphaned', () => {
    // The four lines are each covered once. If a wing were added covering an already-served
    // line, or a line lost its wing, one part of the squad would silently develop differently
    // from the rest — the kind of imbalance that is invisible until a save is 10 seasons deep.
    const covers: Record<string, string[]> = { GK: [], DEF: [], MID: [], ATT: [] };
    for (const [id, def] of Object.entries(TRAINING)) {
      for (const line of Object.keys(def.effects.positionGrowthBonus ?? {})) {
        covers[line].push(id);
      }
    }
    expect(Object.fromEntries(Object.entries(covers).map(([l, ids]) => [l, ids.length])))
      .toEqual({ GK: 1, DEF: 1, MID: 1, ATT: 1 });
  });

  it('composes declineResist multiplicatively, and leaves it at 1 with nothing built', () => {
    const facilities = emptyFacilities();
    expect(FacilityManager.trainingAxes(facilities, makePlayer()).declineResist).toBe(1);
    build(facilities, 'training', 'individualCoachingWing');
    expect(FacilityManager.trainingAxes(facilities, makePlayer()).declineResist)
      .toBeCloseTo(TRAINING.individualCoachingWing.effects.declineResist!);
  });

  it('takes the best potentialFloor rather than summing them', () => {
    // Two wings each promising to develop anyone as a 65 still only develop them as a 65 —
    // summing would make a pair of them out-develop a genuine prospect, which is nonsense.
    const facilities = emptyFacilities();
    expect(FacilityManager.trainingAxes(facilities, makePlayer()).potentialFloor).toBe(0);
    const floors = Object.values(TRAINING)
      .map(def => def.effects.potentialFloor ?? 0)
      .filter(f => f > 0);
    expect(floors.length).toBeGreaterThan(0);
    for (const id of Object.keys(TRAINING)) { build(facilities, 'training', id); }
    expect(FacilityManager.trainingAxes(facilities, makePlayer()).potentialFloor)
      .toBe(Math.max(...floors));
  });

  it('scales every training axis by the wing\'s operating mode', () => {
    // A skeleton crew delivers a fraction of the effect. Asserted across the axes together
    // because a new axis that forgets its effectMult would otherwise slip through.
    const full = emptyFacilities();
    const skeleton = emptyFacilities();
    for (const f of [full, skeleton]) {
      for (const id of Object.keys(TRAINING)) {
        build(f, 'training', id, f === skeleton ? { mode: 'skeleton_crew' } : {});
      }
    }
    const a = FacilityManager.trainingAxes(full, makePlayer());
    const b = FacilityManager.trainingAxes(skeleton, makePlayer());
    expect(b.growthBonus).toBeLessThan(a.growthBonus);
    expect(b.ceilingBonus).toBeLessThan(a.ceilingBonus);
    expect(b.attrGrowthBonus.passing!).toBeLessThan(a.attrGrowthBonus.passing!);
    expect(b.declineResist).toBeGreaterThan(a.declineResist); // less resistance = closer to 1
    expect(b.potentialFloor).toBeLessThan(a.potentialFloor);
  });

  it('only applies youth development bonuses to players at or under the youth age cutoff', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'youthTrainingPitchAndGym'); // +0.10 youth-only growth
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ age: YOUTH_AGE_CUTOFF + 1 })).growthBonus).toBe(0);
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ age: YOUTH_AGE_CUTOFF })).growthBonus).toBeCloseTo(0.10);
  });

  it('ignores academy hub wings (no youthGrowthBonus field) for the training axis', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'homeNationsHub');
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ age: 18 })).growthBonus).toBe(0);
  });
});

describe('FacilityManager.academyRecruitmentBias', () => {
  const ACADEMY = FACILITY_CATALOGUE.academy;

  it('sums overall/potential bonuses across hub wings only, ignoring development wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'homeNationsHub');
    build(facilities, 'academy', 'regionalScoutingNetwork');
    build(facilities, 'academy', 'youthTrainingPitchAndGym'); // development wing: no recruitment effect
    const bias = FacilityManager.academyRecruitmentBias(facilities);
    const hubs = ['homeNationsHub', 'regionalScoutingNetwork'];
    const sum = (pick: (e: typeof ACADEMY[string]['effects']) => number) =>
      hubs.reduce((t, id) => t + pick(ACADEMY[id].effects), 0);
    expect(bias.overallBonus).toBeCloseTo(sum(e => e.overallBonus ?? 0));
    expect(bias.potentialRangeBonus).toEqual([
      sum(e => (e.potentialRangeBonus ?? [0, 0])[0]),
      sum(e => (e.potentialRangeBonus ?? [0, 0])[1]),
    ]);
  });

  it('treats every prospect alike — no hub is scoped to a position', () => {
    // A bonus that only pays out when a random retirement happens to match a position is a
    // lottery ticket rather than a purchase decision, so no academy wing carries one.
    for (const id of ACADEMY_HUB_WING_IDS) {
      const effects = ACADEMY[id].effects as Record<string, unknown>;
      expect(effects.gkOverallBonus).toBeUndefined();
      expect(effects.gkPotentialRangeBonus).toBeUndefined();
      expect(effects.positionGrowthBonus).toBeUndefined();
    }
  });

  it('composes wonderkid chance as independent draws, so stacking hubs can never guarantee one', () => {
    const facilities = emptyFacilities();
    const withTail = ACADEMY_HUB_WING_IDS.filter(id => (ACADEMY[id].effects.wonderkidChance ?? 0) > 0);
    expect(withTail.length).toBeGreaterThan(0); // the tail must be buyable somewhere
    for (const id of withTail) { build(facilities, 'academy', id); }
    const { wonderkidChance } = FacilityManager.academyRecruitmentBias(facilities);
    const summed = withTail.reduce((t, id) => t + (ACADEMY[id].effects.wonderkidChance ?? 0), 0);
    expect(wonderkidChance).toBeGreaterThan(0);
    expect(wonderkidChance).toBeLessThan(1);
    expect(wonderkidChance).toBeLessThanOrEqual(summed);
  });

  it('collects the nationality pools of the hubs that recruit abroad', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'continentalHub');
    const { nationalityPool } = FacilityManager.academyRecruitmentBias(facilities);
    expect(nationalityPool).toEqual(ACADEMY.continentalHub.effects.nationalityPool);
  });
});

describe('FacilityManager.academyIntakeQualityBonus', () => {
  it('sums intake bonuses across development wings only, ignoring hub wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'academyBoardingHouse');
    build(facilities, 'academy', 'homeNationsHub'); // hub wing: no intake-quality effect
    const bonus = FacilityManager.academyIntakeQualityBonus(facilities);
    const house = FACILITY_CATALOGUE.academy.academyBoardingHouse.effects;
    expect(bonus.overallBonus).toBeCloseTo(house.intakeOverallBonus ?? 0);
    expect(bonus.potentialRangeBonus).toEqual(house.intakePotentialRangeBonus);
    expect(bonus.intakeAgeBias).toBeCloseTo(house.intakeAgeBias ?? 0);
  });
});

describe('FacilityManager.wingCost', () => {
  it('previews tier-1 upkeep for an unbuilt wing', () => {
    const def = FACILITY_CATALOGUE.medical.rehabGym;
    const cost = FacilityManager.wingCost('medical', 'rehabGym', emptyFacilities());
    expect(cost.buildCost).toBe(def.buildCost);
    expect(cost.weeklyUpkeep).toBe(def.tierUpkeep[0]);
  });

  it('reflects the actual staff tier and mode for a built wing', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'rehabGym', { staffTier: 3, mode: 'core_staff' });
    const cost = FacilityManager.wingCost('medical', 'rehabGym', facilities);
    expect(cost.weeklyUpkeep).toBeCloseTo(2_600 * 0.45);
  });
});

describe('FacilityManager.maintenanceSummary', () => {
  it('reports each group\'s current weekly upkeep', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'surgicalTheatre', { staffTier: 3 }); // 8,000/wk
    const summary = FacilityManager.maintenanceSummary(facilities);
    expect(summary.medical.upkeep).toBe(8_000);
    expect(summary.training.upkeep).toBe(0);
  });
});

describe('FacilityManager.tickMaintenance', () => {
  it('bills upkeep and lets the budget go negative with no mothballing on the first deficit week', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'surgicalTheatre', { staffTier: 3 }); // 8,000/wk
    const result = FacilityManager.tickMaintenance(facilities, 5_000, 0); // 5,000 - 8,000 < 0
    expect(result.totalUpkeep).toBe(8_000);
    expect(result.deficitStreak).toBe(1);
    expect(result.events).toEqual([]);
    expect(result.facilities.medical.wings.surgicalTheatre!.mothballed).toBe(false);
  });

  it('force-mothballs every built wing club-wide on the second consecutive deficit week', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'surgicalTheatre', { staffTier: 3 });
    build(facilities, 'training', 'gym');
    const result = FacilityManager.tickMaintenance(facilities, 100, DEFICIT_WEEKS_BEFORE_MOTHBALL - 1);
    expect(result.deficitStreak).toBe(0);
    expect(result.events).toEqual(
      expect.arrayContaining([
        { type: 'forced_mothball', group: 'medical', wingId: 'surgicalTheatre' },
        { type: 'forced_mothball', group: 'training', wingId: 'gym' },
      ]),
    );
    expect(result.facilities.medical.wings.surgicalTheatre!.mothballed).toBe(true);
    expect(result.facilities.medical.wings.surgicalTheatre!.forcedMothball).toBe(true);
    expect(result.facilities.training.wings.gym!.mothballed).toBe(true);
  });

  it('does not mothball an already-mothballed wing again, and leaves groups with nothing built alone', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'iceBathRecoverySuite', { mothballed: true });
    const result = FacilityManager.tickMaintenance(facilities, -1_000, DEFICIT_WEEKS_BEFORE_MOTHBALL - 1);
    expect(result.events).toEqual([]);
  });

  it('resets the deficit streak once the budget recovers to non-negative, with no other effect', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'iceBathRecoverySuite'); // 150/wk
    const result = FacilityManager.tickMaintenance(facilities, 10_000, 1); // 10,000 - 150 >= 0
    expect(result.deficitStreak).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.facilities.medical.wings.iceBathRecoverySuite!.mothballed).toBe(false);
  });

  it('clears forcedMothball once the player voluntarily un-mothballs, regardless of budget', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'iceBathRecoverySuite', { mothballed: false, forcedMothball: true });
    const result = FacilityManager.tickMaintenance(facilities, 100_000, 0);
    const restored = result.facilities.medical.wings.iceBathRecoverySuite!;
    expect(restored.forcedMothball).toBe(false);
    expect(restored.mothballed).toBe(false);
  });
});
