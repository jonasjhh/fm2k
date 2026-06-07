import { createGameDateTime } from '@fm2k/engine';

export const BUDGET_START = 1_000_000;
export const STADIUM_START = 8_000;
export const SEASON_START = createGameDateTime(2025, 8, 16, 15, 0);
export const TOTAL_MATCHDAYS = 22;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2', '4-5-1', '3-4-3'] as const;
export const ALL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'] as const;

export const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATK', RW: 'ATK', ST: 'ATK', CF: 'ATK',
};

export const FACILITY_NAMES: Record<string, string> = {
  medical: 'Medical Centre',
  training: 'Training Grounds',
  academy: 'Youth Academy',
};
export const FACILITY_DESCS: Record<string, string> = {
  medical: 'Reduces injury duration',
  training: 'Improves fitness recovery',
  academy: 'Better generated players',
};
export const FACILITY_COSTS: Record<number, number> = { 1: 50_000, 2: 150_000, 3: 500_000 };
export const FACILITY_LEVELS = ['', 'Amateur', 'Semi-Pro', 'Professional', 'Elite'];
