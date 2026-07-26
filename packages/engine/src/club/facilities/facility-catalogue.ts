import type { FacilityGroupId, WingDefinition, WingId } from './facility-types.ts';

/** The single source of truth for every wing's name, cost, and effect. Costs/effects are
 *  intentionally non-uniform: cheap wings give a small, broadly affordable benefit; premium
 *  wings give a disproportionately small marginal edge for their cost — a luxury flex for rich
 *  clubs, not a power escalator. `costTier` is informational (UI grouping) only.
 *
 *  Build costs are sized so each tier gates to a division rather than all being clearable in the
 *  first two seasons: basic wings (£50k–250k) are a D3 season-one purchase, standard (£550k–2.5M)
 *  costs a D2 club a season's saving or a sold player, and premium (£2.5M–7M) competes head-on
 *  with a £1.2–4M signing on a D1 budget. The full estate totals ≈£45M — just under one
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

/**
 * Training wings, tuned so a complete estate lands a little ahead of the growth 0.30 / ceiling 15
 * that `trainingBonusesForLevel` hands every top-division AI club: broad growth 0.20, ceiling 16,
 * plus roughly 0.07 of attribute-specific growth on the average attribute and 0.08 for the field
 * line your specialist coach covers. Nothing built is the same floor an unranked AI club sits on.
 *
 * The Individual Coaching Wing sits outside that scheme: it is the only wing that targets a
 * squad's *weakest* players, developing anyone as though they had a potential of at least 65.
 *
 * The four field lines are each served by exactly one specialist wing — keepers by the Goalkeeping
 * Training Unit, midfielders by the Tactical Analysis Suite (analysis is where a midfielder's game
 * actually improves), defenders and forwards by their coaching units — so no position is orphaned
 * and none is covered twice.
 */
const TRAINING_CATALOGUE: Record<WingId, WingDefinition> = {
  outdoorTechnicalPitch: {
    name: 'Outdoor Technical Pitch',
    description: 'A no-frills pitch for everyday ball work. Develops passing and technique.',
    costTier: 'basic',
    buildCost: 250_000,
    tierUpkeep: [200, 450, 900],
    effects: { attrGrowthBonus: { passing: 0.06, technique: 0.06 } },
  },
  gym: {
    name: 'Gym (Strength & Conditioning)',
    description: 'Weights and conditioning equipment. Develops speed, strength and stamina.',
    costTier: 'standard',
    buildCost: 900_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { attrGrowthBonus: { speed: 0.06, strength: 0.06, stamina: 0.06 } },
  },
  setPiecePitch: {
    name: 'Set-Piece Pitch',
    description: 'A pitch marked out for dead-ball practice. Develops finishing and passing.',
    costTier: 'standard',
    buildCost: 1_000_000,
    tierUpkeep: [500, 1_100, 2_200],
    effects: { attrGrowthBonus: { finishing: 0.06, passing: 0.05 } },
  },
  goalkeepingTrainingUnit: {
    name: 'Goalkeeping Training Unit',
    description: 'A separate area for keeper drills. Develops goalkeeping, and goalkeepers '
      + 'across the board.',
    costTier: 'standard',
    buildCost: 800_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { positionGrowthBonus: { GK: 0.08 }, attrGrowthBonus: { goalkeeping: 0.06 } },
  },
  defensiveCoachingUnit: {
    name: 'Defensive Coaching Unit',
    description: 'A specialist defensive coach on the staff. Develops defending, and defenders '
      + 'across the board.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { positionGrowthBonus: { DEF: 0.08 }, attrGrowthBonus: { defending: 0.05 } },
  },
  attackingCoachingUnit: {
    name: 'Attacking Coaching Unit',
    description: 'A specialist attacking coach on the staff. Develops finishing, and forwards '
      + 'across the board.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { positionGrowthBonus: { ATT: 0.08 }, attrGrowthBonus: { finishing: 0.05 } },
  },
  tacticalAnalysisSuite: {
    name: 'Tactical Analysis Suite',
    description: 'A video and data room for reviewing matches. Raises the level players can '
      + 'reach, and develops midfielders.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: { ceilingBonus: 6, positionGrowthBonus: { MID: 0.08 } },
  },
  indoorPitch: {
    name: 'Indoor Pitch',
    description: 'A covered pitch so training never gets cancelled. Develops every attribute, '
      + 'and raises the level players can reach.',
    costTier: 'standard',
    buildCost: 2_500_000,
    tierUpkeep: [1_000, 2_100, 4_200],
    effects: { growthBonus: 0.06, ceilingBonus: 3 },
  },
  individualCoachingWing: {
    name: 'Individual Coaching Wing',
    description: 'One-to-one rooms for tailored programmes. Develops limited players as though '
      + 'they had more natural ability, slows the decline of players past thirty, and develops '
      + 'every attribute.',
    costTier: 'premium',
    buildCost: 4_000_000,
    tierUpkeep: [2_600, 5_200, 7_800],
    // The only wing aimed at a squad's weakest players. `potentialFloor` lifts the growth *rate*
    // as well as the ceiling, which is the whole point: a 40-potential player is not held back by
    // a cap he cannot reach, he is held back by improving too slowly to get near it. At 65 a
    // limited player tracks a good prospect closely enough to become a genuine starter, without
    // ever matching one — and it does nothing at all for a player already better than that.
    effects: { potentialFloor: 65, declineResist: 0.5, growthBonus: 0.04 },
  },
  sportsScienceAnalyticsLab: {
    name: 'Sports Science & Analytics Lab',
    description: 'A full sports-science department with its own data team. Develops every '
      + 'attribute, and raises the level players can reach.',
    costTier: 'premium',
    buildCost: 3_500_000,
    tierUpkeep: [1_800, 3_600, 5_400],
    effects: { growthBonus: 0.10, ceilingBonus: 7 },
  },
};

/**
 * Academy wings, tuned so a complete estate lands a little ahead of the overall +12 / potential
 * [+18,+24] that `academyBiasForLevel` hands every top-division AI club: overall +14 and potential
 * [+20,+29], i.e. a 40-overall prospect with potential 60–91 against the AI's 38 and 58–86. On top
 * of that sit two things no AI club gets — a younger intake age and the wonderkid tail.
 *
 * **No wing is position-scoped.** A bonus that only pays out when a random retirement happens to
 * match a position is a lottery ticket rather than a purchase decision, so every hub improves every
 * prospect. (This is why there is no goalkeeping hub: keeper prospects are generated exactly like
 * outfielders.)
 *
 * The five recruitment hubs form a ladder of *reach* — Home Nations, Regional, Continental, South
 * American — with the Academy Partnership as the one rung that buys better *method* instead: an
 * agreement with a well-run academy elsewhere that funnels its graduates to you.
 */
/** Nationalities the Continental Hub recruits from — every nation @fm2k/names can actually name a
 *  player in, so an import reads as foreign rather than as a mislabelled domestic player. */
const CONTINENTAL_NATIONALITIES = [
  'English', 'Swedish', 'Danish', 'French', 'German', 'Italian', 'Spanish',
];

const ACADEMY_CATALOGUE: Record<WingId, WingDefinition> = {
  homeNationsHub: {
    name: 'Home Nations Hub',
    description: 'Domestic scouting covering the basics reliably. Brings in slightly better '
      + 'prospects with a little more potential.',
    costTier: 'basic',
    buildCost: 150_000,
    tierUpkeep: [300, 650, 1_300],
    effects: { overallBonus: 3, potentialRangeBonus: [2, 3] },
  },
  academyPartnership: {
    name: 'Academy Partnership',
    description: 'A standing agreement with a well-run academy elsewhere, whose graduates come '
      + 'to you first. Brings in better prospects with more potential.',
    costTier: 'standard',
    buildCost: 550_000,
    tierUpkeep: [450, 950, 1_900],
    effects: { overallBonus: 3, potentialRangeBonus: [3, 4] },
  },
  regionalScoutingNetwork: {
    name: 'Regional Scouting Network',
    description: 'Scouts working every district of the country rather than the nearest few. '
      + 'Brings in notably better prospects with more potential.',
    costTier: 'standard',
    buildCost: 700_000,
    tierUpkeep: [550, 1_200, 2_400],
    effects: { overallBonus: 4, potentialRangeBonus: [4, 5] },
  },
  continentalHub: {
    name: 'Continental Hub',
    description: 'Scouting reach across the continent. Brings in better prospects with '
      + 'considerably more potential, some of them foreign.',
    costTier: 'standard',
    buildCost: 1_200_000,
    tierUpkeep: [600, 1_300, 2_600],
    effects: {
      overallBonus: 2,
      potentialRangeBonus: [5, 7],
      nationalityPool: CONTINENTAL_NATIONALITIES,
    },
  },
  southAmericanHub: {
    name: 'South American Hub',
    description: 'The rarest, highest-ceiling intakes money can scout for. Brings in prospects '
      + 'with far more potential, often foreign, and occasionally an exceptional talent.',
    costTier: 'premium',
    buildCost: 4_000_000,
    tierUpkeep: [2_000, 4_000, 6_000],
    // The wonderkid tail is what justifies the price over simply being a bigger number: the same
    // elevated-potential draw the free-agent pool already uses for its rare elite prospects.
    // Spanish, deliberately: @fm2k/names carries no South American name data, and Spanish is the
    // closest it has. Labelling these prospects 'brazilian' would give them a Norwegian or German
    // name, which reads as a bug; a Spanish-named import at least reads as an import. Revisit if
    // Brazilian/Argentinian name data is ever added.
    effects: {
      overallBonus: 1,
      potentialRangeBonus: [5, 8],
      nationalityPool: ['Spanish'],
      wonderkidChance: 0.10,
    },
  },
  youthTrainingPitchAndGym: {
    name: 'Youth Training Pitch & Gym',
    description: 'Development facilities scaled for younger players. Under-22s develop faster '
      + 'and get closer to their natural ceiling.',
    costTier: 'standard',
    buildCost: 1_500_000,
    tierUpkeep: [400, 850, 1_700],
    effects: { youthGrowthBonus: 0.10, youthCeilingBonus: 5 },
  },
  academyBoardingHouse: {
    name: 'Academy Boarding House',
    description: 'Quality-of-life housing for academy intakes. Slightly better prospects with a '
      + 'little more potential, and young enough to still be worth housing.',
    costTier: 'standard',
    buildCost: 2_500_000,
    tierUpkeep: [650, 1_400, 2_800],
    // Beds are why you can take a prospect at sixteen rather than waiting until they are grown.
    effects: { intakeOverallBonus: 1, intakePotentialRangeBonus: [1, 2], intakeAgeBias: 1 },
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
  'academyPartnership',
  'regionalScoutingNetwork',
  'continentalHub',
  'southAmericanHub',
];

export const ACADEMY_DEVELOPMENT_WING_IDS = [
  'youthTrainingPitchAndGym',
  'academyBoardingHouse',
  'youthSportsScienceUnit',
];
