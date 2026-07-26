import type { FacilityGroupId, WingDefinition, WingId } from './facility-types.ts';

/** The single source of truth for every wing's name, cost, and effect. Costs/effects are
 *  intentionally non-uniform: cheap wings give a small, broadly affordable benefit; premium
 *  wings give a disproportionately small marginal edge for their cost — a luxury flex for rich
 *  clubs, not a power escalator. `costTier` is informational (UI grouping) only.
 *
 *  Build costs are sized so each tier gates to a division rather than all being clearable in the
 *  first two seasons: basic wings (£50k–250k) are a D3 season-one purchase, standard (£550k–2.5M)
 *  costs a D2 club a season's saving or a sold player, and premium (£2.5M–7M) competes head-on
 *  with a £1.2–4M signing on a D1 budget. The full estate totals ≈£40M — just under one
 *  executive-suite stadium sector — and its ≈£4M/yr full-staff tier-3 upkeep is ~10% of that
 *  capital, the ratio a real building runs at. */

const MEDICAL_CATALOGUE: Record<WingId, WingDefinition> = {
  iceBathRecoverySuite: {
    name: 'Ice Bath Recovery Suite',
    description: 'A plunge pool for post-training recovery. Increases daily fitness recovery.',
    costTier: 'basic',
    buildCost: 60_000,
    tierUpkeep: [150, 350, 700],
    effects: { recoveryFlat: 2.5 },
  },
  massageTherapySuite: {
    name: 'Massage Therapy Suite',
    description: 'A treatment room for sports massage. Prevents knocks and strains, and '
      + 'increases daily fitness recovery. No use against tears and breaks.',
    costTier: 'basic',
    buildCost: 50_000,
    tierUpkeep: [150, 350, 700],
    effects: { knockChanceMult: 0.86, moderateChanceMult: 0.97, recoveryFlat: 1.5 },
  },
  pitchSidePhysioUnit: {
    name: 'Pitch-side Physio Unit',
    description: 'A treatment station at the side of the pitch. Prevents knocks and strains, '
      + 'and shortens the ones it does not prevent.',
    costTier: 'basic',
    buildCost: 90_000,
    tierUpkeep: [200, 450, 900],
    // Touchline treatment is a knock intervention: it turns dead legs around fast and barely
    // touches anything that needed a scan.
    effects: {
      knockChanceMult: 0.90, moderateChanceMult: 0.96,
      knockDurationMult: 0.90, moderateDurationMult: 0.97,
    },
  },
  hydrotherapyPool: {
    name: 'Hydrotherapy Pool',
    description: 'A rehabilitation pool for low-impact work. Multiplies daily fitness recovery '
      + 'rather than adding to it, so higher-stamina players gain more.',
    costTier: 'standard',
    buildCost: 800_000,
    tierUpkeep: [500, 1_100, 2_200],
    effects: { recoveryMult: 0.12 },
  },
  rehabGym: {
    name: 'Rehab Gym',
    description: 'An injury rehabilitation gym. Shortens recovery time for injuries.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [600, 1_300, 2_600],
    // The one wing that shortens all three bands — that breadth, not its depth in any single
    // band, is what makes it the strongest lever on total time lost.
    effects: { knockDurationMult: 0.88, moderateDurationMult: 0.85, seriousDurationMult: 0.90 },
  },
  nutritionSportsScienceUnit: {
    name: 'Nutrition & Sports Science Unit',
    description: 'A kitchen and conditioning lab. Players finish matches less spent, and pick '
      + 'up fewer knocks and strains.',
    costTier: 'standard',
    buildCost: 600_000,
    tierUpkeep: [550, 1_200, 2_400],
    // Primarily a fitness wing. Keeping players fresher already lowers injury risk indirectly
    // (match energy feeds the fatigue term on every injury roll), so the declared injury effect
    // stays small — otherwise the same benefit is paid for twice.
    effects: { knockChanceMult: 0.96, moderateChanceMult: 0.96, matchDrainMult: 0.93 },
  },
  playerWelfareCentre: {
    name: 'Player Welfare Centre',
    description: 'A player-care suite covering psychology and concussion protocol. Prevents '
      + 'everything from dead legs to broken bones, and increases daily fitness recovery.',
    costTier: 'standard',
    buildCost: 900_000,
    tierUpkeep: [700, 1_500, 3_000],
    // The serious band is what this wing is actually for and is left alone; the knock and
    // moderate bands are trimmed because the daily recovery top-up is already a real benefit.
    effects: { knockChanceMult: 0.97, moderateChanceMult: 0.97, seriousChanceMult: 0.95, recoveryFlat: 3 },
  },
  cryotherapyChamber: {
    name: 'Cryotherapy Chamber',
    description: 'A whole-body cold chamber. Restores fitness after each match played rather '
      + 'than each day, so it counts for more the more often you play.',
    costTier: 'premium',
    buildCost: 2_500_000,
    tierUpkeep: [1_800, 3_600, 5_400],
    effects: { postMatchRecovery: 45 },
  },
  mriDiagnosticImagingSuite: {
    name: 'MRI & Diagnostic Imaging Suite',
    description: 'An in-house scanner and diagnostics room. Catches strains, tears and breaks '
      + 'early, so fewer take hold and those that do clear up sooner. Nobody scans a dead leg.',
    costTier: 'premium',
    buildCost: 4_000_000,
    tierUpkeep: [2_200, 4_200, 6_200],
    // No knock band at all: nobody scans a dead leg, so nothing here applies to one.
    effects: {
      moderateChanceMult: 0.96, seriousChanceMult: 0.96,
      moderateDurationMult: 0.90, seriousDurationMult: 0.90,
    },
  },
  surgicalTheatre: {
    name: 'Surgical Theatre',
    description: 'An operating theatre with a surgeon on retainer. Gets players back sooner '
      + 'from strains, tears and breaks, and prevents a few of them. No help with a dead leg.',
    costTier: 'premium',
    buildCost: 7_000_000,
    tierUpkeep: [3_000, 5_500, 8_000],
    // The deepest single cut to serious layoffs in the game, and nothing whatsoever below it.
    effects: {
      moderateChanceMult: 0.97, seriousChanceMult: 0.92,
      moderateDurationMult: 0.94, seriousDurationMult: 0.82,
    },
  },
};

const TRAINING_CATALOGUE: Record<WingId, WingDefinition> = {
  outdoorTechnicalPitch: {
    name: 'Outdoor Technical Pitch',
    description: 'A no-frills pitch for everyday technical work.',
    costTier: 'basic',
    buildCost: 250_000,
    tierUpkeep: [200, 450, 900],
    effects: { growthBonus: 0.05 },
  },
  gym: {
    name: 'Gym (Strength & Conditioning)',
    description: 'Weights and conditioning equipment for physical development.',
    costTier: 'standard',
    buildCost: 900_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { growthBonus: 0.08 },
  },
  indoorPitch: {
    name: 'Indoor Pitch',
    description: 'A covered pitch so training never gets cancelled.',
    costTier: 'standard',
    buildCost: 2_500_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { growthBonus: 0.07 },
  },
  tacticalAnalysisSuite: {
    name: 'Tactical Analysis Suite',
    description: 'Video and data analysis raising what players can ultimately learn.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { ceilingBonus: 2 },
  },
  goalkeepingTrainingUnit: {
    name: 'Goalkeeping Training Unit',
    description: 'Specialist goalkeeping coaching — benefits keepers only.',
    costTier: 'standard',
    buildCost: 800_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { gkGrowthBonus: 0.10 },
  },
  setPiecePitch: {
    name: 'Set-Piece Pitch',
    description: 'A pitch marked out for dead-ball practice.',
    costTier: 'standard',
    buildCost: 1_000_000,
    tierUpkeep: [1_200, 2_400, 4_800],
    effects: { ceilingBonus: 2 },
  },
  sportsScienceAnalyticsLab: {
    name: 'Sports Science & Analytics Lab',
    description: 'Top-end data science — a small edge despite the price tag.',
    costTier: 'premium',
    buildCost: 3_500_000,
    tierUpkeep: [1_800, 3_600, 5_400],
    effects: { growthBonus: 0.04 },
  },
};

const ACADEMY_CATALOGUE: Record<WingId, WingDefinition> = {
  homeNationsHub: {
    name: 'Home Nations Hub',
    description: 'Domestic scouting covering the basics reliably.',
    costTier: 'basic',
    buildCost: 150_000,
    tierUpkeep: [300, 650, 1_300],
    effects: { overallBonus: 2, potentialRangeBonus: [2, 2] },
  },
  defensiveAcademyHub: {
    name: 'Defensive Academy Hub',
    description: 'A scouting focus on defensively reliable youngsters.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { overallBonus: 3, potentialRangeBonus: [2, 4] },
  },
  goalkeepingAcademyHub: {
    name: 'Goalkeeping Academy Hub',
    description: 'Dedicated goalkeeper scouting — affects keeper intake only.',
    costTier: 'standard',
    buildCost: 550_000,
    tierUpkeep: [450, 950, 1_900],
    effects: { gkOverallBonus: 4, gkPotentialRangeBonus: [3, 5] },
  },
  continentalHub: {
    name: 'Continental Hub',
    description: 'Wider scouting reach into foreign markets.',
    costTier: 'standard',
    buildCost: 1_200_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { potentialRangeBonus: [4, 6] },
  },
  southAmericanHub: {
    name: 'South American Hub',
    description: 'The rarest, highest-ceiling intakes money can scout for.',
    costTier: 'premium',
    buildCost: 4_000_000,
    tierUpkeep: [2_000, 4_000, 6_000],
    effects: { potentialRangeBonus: [6, 10] },
  },
  youthTrainingPitchAndGym: {
    name: 'Youth Training Pitch & Gym',
    description: 'Development facilities scaled for younger players.',
    costTier: 'standard',
    buildCost: 1_500_000,
    tierUpkeep: [400, 850, 1_700],
    effects: { youthGrowthBonus: 0.10 },
  },
  academyBoardingHouse: {
    name: 'Academy Boarding House',
    description: 'Quality-of-life housing for academy intakes.',
    costTier: 'standard',
    buildCost: 2_500_000,
    tierUpkeep: [650, 1_400, 2_800],
    effects: { intakeOverallBonus: 1, intakePotentialRangeBonus: [1, 2] },
  },
  youthSportsScienceUnit: {
    name: 'Youth Sports Science Unit',
    description: 'A conditioning unit for academy players. Under-22s only: fewer knocks and '
      + 'strains, and quicker daily recovery. No use against tears and breaks.',
    costTier: 'premium',
    buildCost: 2_800_000,
    tierUpkeep: [1_300, 2_600, 5_200],
    effects: { youthInjuryChanceMult: 0.90, youthRecoveryFlat: 3 },
  },
};

export const FACILITY_CATALOGUE: Record<FacilityGroupId, Record<WingId, WingDefinition>> = {
  medical: MEDICAL_CATALOGUE,
  training: TRAINING_CATALOGUE,
  academy: ACADEMY_CATALOGUE,
};

export const MEDICAL_WING_IDS = Object.keys(MEDICAL_CATALOGUE);
export const TRAINING_WING_IDS = Object.keys(TRAINING_CATALOGUE);
export const ACADEMY_WING_IDS = Object.keys(ACADEMY_CATALOGUE);

/** Hub wings within the academy catalogue that drive recruitment bias (vs. the youth
 *  development wings, which drive growth/welfare of players already at the club). */
export const ACADEMY_HUB_WING_IDS = [
  'homeNationsHub',
  'defensiveAcademyHub',
  'goalkeepingAcademyHub',
  'continentalHub',
  'southAmericanHub',
];

export const ACADEMY_DEVELOPMENT_WING_IDS = [
  'youthTrainingPitchAndGym',
  'academyBoardingHouse',
  'youthSportsScienceUnit',
];
