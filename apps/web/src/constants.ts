export const TOTAL_MATCHDAYS = 22;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
