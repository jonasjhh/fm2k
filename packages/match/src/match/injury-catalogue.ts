/**
 * The single source of truth for injuries: what can happen, how likely it is, how long it keeps a
 * player out, and how much of that medicine can undo. Everything tunable lives here — `injury.ts`
 * holds only the machinery that rolls against these numbers.
 *
 * Two ideas drive the shape:
 *
 *  • **Each severity has its own exposure.** A situation carries three separate chances — knock,
 *    moderate, serious — and one roll is laid against them end to end, so each band's frequency is
 *    exactly the number written here. Under the old model a single chance decided *whether*
 *    something happened and weights then decided *what*, which made the severities shares of a
 *    fixed whole: raising knock frequency stole from serious injuries instead of adding to the
 *    total. These three are genuinely separate knobs, which is what lets a club with no medical
 *    wings suffer more knocks without also suffering more broken legs.
 *
 *  • **Injuries declare their situations, not the other way round.** Each definition lists the
 *    triggers that can produce it and its weight within that trigger's severity slot; the lookup
 *    tables are derived by inverting that map. Adding an injury is one entry, and the same injury
 *    can appear under several situations at different odds — which is how a tackler ends up
 *    twisting an ankle where the player they hit gets a dead leg.
 */

export type InjurySeverity = 'knock' | 'moderate' | 'serious';

/**
 * What the player was doing. These are deliberately fine-grained: a tackler and the player they
 * tackle are different situations with different outcomes, and so is a foul that draws a card.
 * Splitting them lets the exposure table carry what used to be hard-coded multipliers.
 */
export type InjuryTrigger =
  | 'tackled' | 'tackling'
  | 'foul' | 'yellow_foul' | 'red_foul'
  | 'sprint' | 'through_run' | 'aerial' | 'save';

export const INJURY_TRIGGERS: readonly InjuryTrigger[] = [
  'tackled', 'tackling', 'foul', 'yellow_foul', 'red_foul',
  'sprint', 'through_run', 'aerial', 'save',
];

export const INJURY_SEVERITIES: readonly InjurySeverity[] = ['knock', 'moderate', 'serious'];

/** Layoff bounds in *days* each band must stay inside — a guard against misclassification,
 *  asserted in the catalogue tests rather than enforced at runtime.
 *
 *  Days, not matches. An injury is a fixed period of calendar time: how many fixtures it costs
 *  you depends on how congested your run is, which is the whole point — the same hamstring pull
 *  costs one match in a quiet February and three over Christmas. */
export const SEVERITY_DURATION_BOUNDS: Record<InjurySeverity, [number, number]> = {
  knock: [3, 10],
  moderate: [14, 35],
  serious: [60, 120],
};

export interface InjuryDefinition {
  id: string
  /** Display label. The UI reads this rather than de-underscoring the id. */
  name: string
  severity: InjurySeverity
  /** [min, max] days out, inclusive, before any medical mitigation. */
  duration: [number, number]
  /** Ceiling on prevention: the most that even a complete medical estate can ever avert.
   *  This is the clamp that stops facilities becoming an injury off-switch — you can physio
   *  away most dead legs, but nobody prevents a broken leg. */
  maxAvertChance: number
  /** Floor on treated duration, as a fraction of the rolled base. 1.0 means treatment cannot
   *  shorten it at all — head injuries are governed by return-to-play protocol, not by how
   *  much the club spent. */
  minDurationFraction: number
  /** Situations that can cause this, and its weight within that situation's severity slot.
   *  Weights in each slot sum to 100 (asserted in the catalogue tests). */
  triggers: Partial<Record<InjuryTrigger, number>>
}

/**
 * Every injury in the game.
 *
 * The weight columns are where situational character lives. A tackler plants and twists (ankle 60)
 * where the player they hit takes it in the thigh (dead leg 75). A flat-out through-run tears a
 * hamstring (55) where a dribble is likelier to go calf (44) or groin (32). Broken legs are
 * reachable only through carded fouls, and dominate the straight-red slot — not by a special case
 * in the roller, but simply by being absent from every other row.
 */
export const INJURY_DEFINITIONS: InjuryDefinition[] = [
  // ── knocks: frequent, cheap, the texture of a congested fixture list ──────────
  {
    id: 'dead_leg', name: 'dead leg', severity: 'knock', duration: [3, 6],
    maxAvertChance: 0.85, minDurationFraction: 0,
    triggers: { tackled: 75, tackling: 40, foul: 80, yellow_foul: 85, red_foul: 100 },
  },
  {
    id: 'ankle_twist', name: 'twisted ankle', severity: 'knock', duration: [4, 8],
    maxAvertChance: 0.75, minDurationFraction: 0,
    triggers: { tackled: 25, tackling: 60, foul: 20, yellow_foul: 15 },
  },
  {
    id: 'muscle_strain', name: 'muscle strain', severity: 'knock', duration: [4, 9],
    maxAvertChance: 0.80, minDurationFraction: 0.50,
    triggers: { sprint: 100, through_run: 100 },
  },
  {
    // Protocol, not treatment, decides when a head knock clears — hence the immovable floor.
    id: 'head_knock', name: 'head knock', severity: 'knock', duration: [6, 10],
    maxAvertChance: 0.40, minDurationFraction: 1.0,
    triggers: { aerial: 65 },
  },
  {
    id: 'bruised_ribs', name: 'bruised ribs', severity: 'knock', duration: [5, 10],
    maxAvertChance: 0.60, minDurationFraction: 0.50,
    triggers: { aerial: 35, save: 45 },
  },
  {
    id: 'finger_injury', name: 'finger injury', severity: 'knock', duration: [3, 7],
    maxAvertChance: 0.60, minDurationFraction: 0.50,
    triggers: { save: 55 },
  },

  // ── moderate: you lose the player, but prevention and rehab both bite ─────────
  {
    id: 'ankle_sprain', name: 'ankle sprain', severity: 'moderate', duration: [14, 25],
    maxAvertChance: 0.45, minDurationFraction: 0.35,
    triggers: { tackled: 55, tackling: 70, foul: 60, yellow_foul: 50, red_foul: 45 },
  },
  {
    id: 'knee_injury', name: 'knee injury', severity: 'moderate', duration: [21, 35],
    maxAvertChance: 0.35, minDurationFraction: 0.50,
    triggers: { tackled: 45, tackling: 30, foul: 40, yellow_foul: 50, red_foul: 55 },
  },
  {
    id: 'calf_strain', name: 'calf strain', severity: 'moderate', duration: [14, 24],
    maxAvertChance: 0.50, minDurationFraction: 0.40,
    triggers: { sprint: 44, through_run: 30 },
  },
  {
    id: 'groin_strain', name: 'groin strain', severity: 'moderate', duration: [14, 21],
    maxAvertChance: 0.50, minDurationFraction: 0.40,
    triggers: { sprint: 32, through_run: 15 },
  },
  {
    id: 'hamstring_pull', name: 'hamstring pull', severity: 'moderate', duration: [18, 30],
    maxAvertChance: 0.45, minDurationFraction: 0.45,
    triggers: { sprint: 24, through_run: 55 },
  },
  {
    id: 'shoulder_injury', name: 'shoulder injury', severity: 'moderate', duration: [16, 28],
    maxAvertChance: 0.30, minDurationFraction: 0.55,
    triggers: { aerial: 70 },
  },
  {
    id: 'neck_strain', name: 'neck strain', severity: 'moderate', duration: [14, 24],
    maxAvertChance: 0.30, minDurationFraction: 0.55,
    triggers: { aerial: 30 },
  },
  {
    id: 'wrist_sprain', name: 'wrist sprain', severity: 'moderate', duration: [14, 21],
    maxAvertChance: 0.30, minDurationFraction: 0.55,
    triggers: { save: 100 },
  },

  // ── serious: rare, and very nearly beyond the reach of money ──────────────────
  {
    id: 'knee_ligament_tear', name: 'knee ligament tear', severity: 'serious', duration: [90, 120],
    maxAvertChance: 0.05, minDurationFraction: 0.70,
    triggers: { tackled: 100, tackling: 100, foul: 100, yellow_foul: 60, red_foul: 35 },
  },
  {
    // A surgeon shaves weeks off the recovery. Nothing prevents it happening.
    id: 'broken_leg', name: 'broken leg', severity: 'serious', duration: [100, 120],
    maxAvertChance: 0.02, minDurationFraction: 0.75,
    triggers: { yellow_foul: 40, red_foul: 65 },
  },
  {
    id: 'torn_hamstring', name: 'torn hamstring', severity: 'serious', duration: [60, 84],
    maxAvertChance: 0.08, minDurationFraction: 0.65,
    triggers: { sprint: 100, through_run: 100 },
  },
  {
    id: 'concussion', name: 'concussion', severity: 'serious', duration: [60, 75],
    maxAvertChance: 0.05, minDurationFraction: 1.0,
    triggers: { aerial: 100 },
  },
];

/**
 * Per-involvement injury chance at full fitness, by situation and severity;
 * `fatigueRiskFactor()` scales it at roll time.
 *
 * These rows absorb what used to be separate multipliers (a tackler at half the carrier's risk, a
 * yellow-card foul at 2×, a red at 6×) — each is now just its own line you can tune directly.
 *
 * Calibrated so an unfacilitated side loses roughly 11% of its starter-matches across a 30-game
 * season, which is where real football sits and, more to the point, is what leaves the medical
 * wings something worth buying. Knocks dominate the count and moderate injuries dominate the time
 * lost; serious injuries stay rare enough to read as events rather than attrition.
 */
export const TRIGGER_EXPOSURE: Record<InjuryTrigger, Record<InjurySeverity, number>> = {
  tackled:     { knock: 0.0192, moderate: 0.0072, serious: 0.00025 },
  tackling:    { knock: 0.0096, moderate: 0.0036, serious: 0.00012 },
  foul:        { knock: 0.0328, moderate: 0.0117, serious: 0.00040 },
  yellow_foul: { knock: 0.0656, moderate: 0.0234, serious: 0.00080 },
  red_foul:    { knock: 0.1970, moderate: 0.0711, serious: 0.00235 },
  sprint:      { knock: 0.0112, moderate: 0.0040, serious: 0.00013 },
  through_run: { knock: 0.0112, moderate: 0.0040, serious: 0.00013 },
  aerial:      { knock: 0.0080, moderate: 0.0031, serious: 0.00010 },
  save:        { knock: 0.0027, moderate: 0.0011, serious: 0 },
};

// ── derived lookups ────────────────────────────────────────────────────────────

export interface WeightedInjury {
  def: InjuryDefinition
  weight: number
}

function buildTable(): Record<InjuryTrigger, Record<InjurySeverity, WeightedInjury[]>> {
  const table = {} as Record<InjuryTrigger, Record<InjurySeverity, WeightedInjury[]>>;
  for (const trigger of INJURY_TRIGGERS) {
    table[trigger] = { knock: [], moderate: [], serious: [] };
  }
  for (const def of INJURY_DEFINITIONS) {
    for (const [trigger, weight] of Object.entries(def.triggers) as [InjuryTrigger, number][]) {
      table[trigger][def.severity].push({ def, weight });
    }
  }
  return table;
}

/** situation → severity → weighted candidates, inverted from the definitions above. */
export const INJURY_TABLE = buildTable();

export const INJURY_BY_ID: Record<string, InjuryDefinition> =
  Object.fromEntries(INJURY_DEFINITIONS.map(d => [d.id, d]));

/** Every type this engine can produce (UI labels, tests). */
export const INJURY_TYPES: readonly string[] = INJURY_DEFINITIONS.map(d => d.id);
