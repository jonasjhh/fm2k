export interface StadiumSectorConfig {
  type: string         // stand type key e.g. 'double-tier', 'open-bleacher'
  densityValue: number // seat spacing; lower = more seats (range 10–50)
}

export type SectorKey = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export const SECTOR_KEYS: SectorKey[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Capacity multiplier per stand type (visual + game)
export const STAND_TYPES: Record<string, { name: string; capacityMultiplier: number }> = {
  none:               { name: 'Empty Slot (No Stand)',             capacityMultiplier: 0 },
  'open-bleacher':    { name: '1-Tier Open Seated Stand',          capacityMultiplier: 1 },
  'covered-grandstand': { name: '1-Tier Roofed Grandstand',        capacityMultiplier: 1.2 },
  kop:                { name: '1-Tier Steep Supporters Kop',        capacityMultiplier: 1.5 },
  'double-tier':      { name: '2-Tier Modern Floating Roof',        capacityMultiplier: 2.2 },
  'executive-suite':  { name: '2-Tier Embedded Executive Suites',   capacityMultiplier: 1.8 },
  'triple-tier':      { name: '3-Tier Colosseum Grandstand',        capacityMultiplier: 3.5 },
};

// Build cost to erect a stand from scratch (per base sector, × location multiplier).
// Calibrated so all 8 sectors at triple-tier ≈ £1.84B total.
export const STAND_BUILD_COSTS: Record<string, number> = {
  none:                 0,
  'open-bleacher':      2_000_000,
  'covered-grandstand': 5_000_000,
  kop:                  3_500_000,
  'double-tier':        15_000_000,
  'executive-suite':    45_000_000,
  'triple-tier':        200_000_000,
};

// Cost to demolish an existing stand (≈25–30% of build cost).
export const STAND_DEMOLITION_COSTS: Record<string, number> = {
  none:                 0,
  'open-bleacher':      500_000,
  'covered-grandstand': 1_500_000,
  kop:                  1_000_000,
  'double-tier':        4_500_000,
  'executive-suite':    14_000_000,
  'triple-tier':        60_000_000,
};

// Location multiplier: corners cheapest → short sides → long sides most expensive
export const LOCATION_MULT: Record<SectorKey, number> = {
  NW: 0.8, NE: 0.8, SW: 0.8, SE: 0.8,
  W: 1.2,  E: 1.2,
  N: 1.8,  S: 1.8,
};

// Per-seat costs for density adjustments — kept small so stand structure dominates.
export const COST_PER_SEAT_ADDED   = 20;
export const COST_PER_SEAT_REMOVED = 5;

// Initial stadium: 4 open side stands, no corners — produces ~8k seats
export const DEFAULT_STADIUM_SECTORS: Record<string, StadiumSectorConfig> = {
  N:  { type: 'open-bleacher', densityValue: 36 },
  S:  { type: 'open-bleacher', densityValue: 36 },
  E:  { type: 'open-bleacher', densityValue: 36 },
  W:  { type: 'open-bleacher', densityValue: 36 },
  NE: { type: 'none', densityValue: 36 },
  SE: { type: 'none', densityValue: 36 },
  SW: { type: 'none', densityValue: 36 },
  NW: { type: 'none', densityValue: 36 },
};

export function getSectorCapacity(key: SectorKey, sector: StadiumSectorConfig): number {
  if (sector.type === 'none') {return 0;}
  const baseCount = Math.floor((60 - sector.densityValue) * 85);
  return Math.floor(baseCount * STAND_TYPES[sector.type].capacityMultiplier);
}

export function calculateTotalCapacity(sectors: Record<string, StadiumSectorConfig>): number {
  return SECTOR_KEYS.reduce((sum, k) => sum + getSectorCapacity(k, sectors[k] ?? { type: 'none', densityValue: 30 }), 0);
}

/**
 * Cost to go from sector state `from` to `to`.
 * Two independent components:
 *   1. Structure: demolish the old stand + build the new one (both × location multiplier).
 *      Going to/from 'none' naturally costs £0 for that half.
 *   2. Seating density: each seat added/removed has a small per-seat cost (× location multiplier).
 */
export function calculateSectorChangeCost(
  key: SectorKey,
  from: StadiumSectorConfig,
  to: StadiumSectorConfig,
): number {
  const loc = LOCATION_MULT[key];
  let cost = 0;

  if (from.type !== to.type) {
    const demolish = STAND_DEMOLITION_COSTS[from.type] ?? 0;
    const build    = STAND_BUILD_COSTS[to.type]        ?? 0;
    cost += (demolish + build) * loc;
  }

  const fromCap = getSectorCapacity(key, from);
  const toCap   = getSectorCapacity(key, to);
  const delta   = toCap - fromCap;
  if (delta > 0) {
    cost += delta * COST_PER_SEAT_ADDED   * loc;
  } else if (delta < 0) {
    cost += Math.abs(delta) * COST_PER_SEAT_REMOVED * loc;
  }

  return Math.round(cost);
}

export function calculateTotalChangeCost(
  committed: Record<string, StadiumSectorConfig>,
  planned: Record<string, StadiumSectorConfig>,
): number {
  return SECTOR_KEYS.reduce((sum, k) => {
    const from = committed[k] ?? { type: 'none', densityValue: 30 };
    const to   = planned[k]   ?? { type: 'none', densityValue: 30 };
    return sum + calculateSectorChangeCost(k, from, to);
  }, 0);
}

export function hasSectorChanged(
  from: StadiumSectorConfig,
  to: StadiumSectorConfig,
): boolean {
  return from.type !== to.type || from.densityValue !== to.densityValue;
}
