import { describe, expect, it } from 'vitest';
import type { Player } from '@fm2k/match';
import { FacilityManager } from './facility-manager.ts';
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
    id: 'p1', name: 'Test Player', nationality: 'norwegian', age: 25, position: 'CM', potential: 70,
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
      injuryDurationReduction: 0, injuryChanceMult: 1, recoveryMult: 1,
    });
  });

  it('sums duration reduction and recovery bonuses across built wings at full staff', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'pitchSidePhysioUnit'); // -0.5 matches
    build(facilities, 'medical', 'rehabGym'); // -1.0 matches
    build(facilities, 'medical', 'hydrotherapyPool'); // +0.15 recovery
    const axes = FacilityManager.medicalAxes(facilities);
    expect(axes.injuryDurationReduction).toBeCloseTo(1.5);
    expect(axes.recoveryMult).toBeCloseTo(1.15);
  });

  it('combines injury-chance multipliers multiplicatively, not additively', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'massageTherapySuite'); // x0.95
    build(facilities, 'medical', 'nutritionSportsScienceUnit'); // x0.88
    const axes = FacilityManager.medicalAxes(facilities);
    expect(axes.injuryChanceMult).toBeCloseTo(0.95 * 0.88);
  });

  it('contributes nothing from a mothballed wing', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'rehabGym', { mothballed: true });
    expect(FacilityManager.medicalAxes(facilities).injuryDurationReduction).toBe(0);
  });

  it('applies the core_staff effect multiplier (40%)', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'rehabGym', { mode: 'core_staff' }); // base -1.0
    expect(FacilityManager.medicalAxes(facilities).injuryDurationReduction).toBeCloseTo(0.4);
  });

  it('applies the skeleton_crew structural floor (5%) instead of zero', () => {
    const facilities = emptyFacilities();
    build(facilities, 'medical', 'rehabGym', { mode: 'skeleton_crew' }); // base -1.0
    expect(FacilityManager.medicalAxes(facilities).injuryDurationReduction).toBeCloseTo(0.05);
  });
});

describe('FacilityManager.trainingAxes', () => {
  it('sums growthBonus and ceilingBonus across built training wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'training', 'gym'); // +0.08 growth
    build(facilities, 'training', 'tacticalAnalysisSuite'); // +2 ceiling
    const axes = FacilityManager.trainingAxes(facilities, makePlayer());
    expect(axes.growthBonus).toBeCloseTo(0.08);
    expect(axes.ceilingBonus).toBe(2);
  });

  it('only applies the goalkeeping unit bonus to goalkeepers', () => {
    const facilities = emptyFacilities();
    build(facilities, 'training', 'goalkeepingTrainingUnit'); // +0.10 gk-only
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ position: 'CM' })).growthBonus).toBe(0);
    expect(FacilityManager.trainingAxes(facilities, makePlayer({ position: 'GK' })).growthBonus).toBeCloseTo(0.10);
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
  it('sums overall/potential bonuses across hub wings only, ignoring development wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'homeNationsHub'); // overall +2, potential +[2,2]
    build(facilities, 'academy', 'defensiveAcademyHub'); // overall +3, potential +[2,4]
    build(facilities, 'academy', 'youthTrainingPitchAndGym'); // development wing, no recruitment effect
    const bias = FacilityManager.academyRecruitmentBias(facilities);
    expect(bias.overallBonus).toBeCloseTo(5);
    expect(bias.potentialRangeBonus).toEqual([4, 6]);
  });

  it('tracks goalkeeper-specific bonuses separately from outfield bonuses', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'goalkeepingAcademyHub'); // gkOverall +4, gkPotential +[3,5]
    const bias = FacilityManager.academyRecruitmentBias(facilities);
    expect(bias.overallBonus).toBe(0);
    expect(bias.gkOverallBonus).toBeCloseTo(4);
    expect(bias.gkPotentialRangeBonus).toEqual([3, 5]);
  });
});

describe('FacilityManager.academyIntakeQualityBonus', () => {
  it('sums intake bonuses across development wings only, ignoring hub wings', () => {
    const facilities = emptyFacilities();
    build(facilities, 'academy', 'academyBoardingHouse'); // overall +1, potential +[1,2]
    build(facilities, 'academy', 'homeNationsHub'); // hub wing, no intake-quality effect
    const bonus = FacilityManager.academyIntakeQualityBonus(facilities);
    expect(bonus.overallBonus).toBeCloseTo(1);
    expect(bonus.potentialRangeBonus).toEqual([1, 2]);
  });
});

describe('FacilityManager.wingCost', () => {
  it('previews tier-1 upkeep for an unbuilt wing', () => {
    const cost = FacilityManager.wingCost('medical', 'rehabGym', emptyFacilities());
    expect(cost.buildCost).toBe(90_000);
    expect(cost.weeklyUpkeep).toBe(600);
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
