// The stadium cost/capacity model is football-domain logic and now lives in the
// engine. This module re-exports it so existing '../utils/stadium' imports keep
// working, and adds the UI-only display labels for each sector.
import type { SectorKey } from '@fm2k/engine';

export {
  SECTOR_KEYS, STAND_TYPES, STAND_CONSTRUCTION_COSTS, LOCATION_MULT,
  COST_PER_SEAT_ADDED, COST_PER_SEAT_REMOVED, DEFAULT_STADIUM_SECTORS,
  getSectorCapacity, calculateTotalCapacity, calculateSectorChangeCost,
  calculateTotalChangeCost, hasSectorChanged,
} from '@fm2k/engine';
export type { SectorKey } from '@fm2k/engine';

export const SECTOR_LABELS: Record<SectorKey, string> = {
  N: 'North Stand (Side)',
  NE: 'North-East Wedge (Corner)',
  E: 'East Stand (Side)',
  SE: 'South-East Wedge (Corner)',
  S: 'South Stand (Side)',
  SW: 'South-West Wedge (Corner)',
  W: 'West Stand (Side)',
  NW: 'North-West Wedge (Corner)',
};

export const SECTOR_NAMES: Record<SectorKey, string> = {
  N: 'North Stand', NE: 'North-East Corner', E: 'East Stand', SE: 'South-East Corner',
  S: 'South Stand', SW: 'South-West Corner', W: 'West Stand', NW: 'North-West Corner',
};
