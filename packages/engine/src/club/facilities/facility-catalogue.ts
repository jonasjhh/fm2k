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
    description: 'A plunge-pool setup the whole squad uses daily. On its own it will not get a '
      + 'tired side through to Saturday — paired with the massage room, it just about will.',
    costTier: 'basic',
    buildCost: 60_000,
    tierUpkeep: [150, 350, 700],
    effects: { recoveryFlat: 2.5 },
  },
  massageTherapySuite: {
    name: 'Massage Therapy Suite',
    description: 'Hands-on sports massage: eases strain before it becomes an injury, and adds a '
      + 'daily trickle of recovery on top of the ice baths.',
    costTier: 'basic',
    buildCost: 50_000,
    tierUpkeep: [150, 350, 700],
    effects: { injuryChanceMult: 0.95, recoveryFlat: 1.5 },
  },
  pitchSidePhysioUnit: {
    name: 'Pitch-side Physio Unit',
    description: 'Immediate physio attention the moment a knock happens.',
    costTier: 'basic',
    buildCost: 90_000,
    tierUpkeep: [200, 450, 900],
    effects: { injuryDurationReduction: 0.5 },
  },
  hydrotherapyPool: {
    name: 'Hydrotherapy Pool',
    description: 'Low-impact water-based rehab. Scales up the squad\'s whole daily recovery rate '
      + 'rather than adding a fixed amount — the fitter the player, the more it returns.',
    costTier: 'standard',
    buildCost: 800_000,
    tierUpkeep: [500, 1_100, 2_200],
    effects: { recoveryMult: 0.12 },
  },
  rehabGym: {
    name: 'Rehab Gym',
    description: 'A dedicated strength-rehab space to get injured players back faster.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { injuryDurationReduction: 1.0 },
  },
  nutritionSportsScienceUnit: {
    name: 'Nutrition & Sports Science Unit',
    description: 'Diet and conditioning science: fewer soft-tissue injuries, and players finish '
      + 'matches less spent. Worth double in a two-game week, since it is charged per match.',
    costTier: 'standard',
    buildCost: 600_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { injuryChanceMult: 0.88, matchDrainMult: 0.93 },
  },
  playerWelfareCentre: {
    name: 'Player Welfare Centre',
    description: 'Sports psychology and concussion protocol, keeping players match-ready. Fewer '
      + 'injuries, plus a steady daily top-up to the squad\'s recovery.',
    costTier: 'standard',
    buildCost: 900_000,
    tierUpkeep: [700, 1_500, 3_000],
    effects: { injuryChanceMult: 0.90, recoveryFlat: 3 },
  },
  cryotherapyChamber: {
    name: 'Cryotherapy Chamber',
    description: 'Whole-body cold therapy in the hours after a game — a large one-off bounce-back '
      + 'per match played. Near-worthless on one game a week; it is what lets a squad play twice.',
    costTier: 'premium',
    buildCost: 2_500_000,
    tierUpkeep: [1_800, 3_600, 5_400],
    effects: { postMatchRecovery: 45 },
  },
  mriDiagnosticImagingSuite: {
    name: 'MRI & Diagnostic Imaging Suite',
    description: 'In-house scanning for faster, more accurate injury diagnosis.',
    costTier: 'premium',
    buildCost: 4_000_000,
    tierUpkeep: [2_200, 4_200, 6_200],
    effects: { injuryDurationReduction: 0.6 },
  },
  surgicalTheatre: {
    name: 'Surgical Theatre',
    description: 'A club-owned surgical theatre.',
    costTier: 'premium',
    buildCost: 7_000_000,
    tierUpkeep: [3_000, 5_500, 8_000],
    effects: { injuryDurationReduction: 0.8, injuryChanceMult: 0.95 },
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
    description: 'Recovery and injury-prevention science tailored to younger bodies. Under-22s '
      + 'only, but for them it is the single largest daily recovery source in the game.',
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
