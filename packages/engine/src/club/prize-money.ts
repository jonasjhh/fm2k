// ── league placement prizes ──────────────────────────────────────────────────────
// Sized against the existing economy: default-stadium gate income ≈£1.5-1.7M/season,
// a decent signing ≈£1.2-4M+. A Division 1 title (£3.0M) is worth roughly two seasons
// of gate income; a Division 3 mid-table finish (£100k) is pocket change.

/** Base prize for finishing 7th or below — scales down sharply for lower divisions. */
const DIVISION_BASE_PRIZE: Record<number, number> = {
  1: 1_500_000,
  2: 600_000,
  3: 250_000,
};

/** Multiplier on the division base prize, by 1-indexed final position. Reduces incentive
 *  to assume the season is "over" once promotion/relegation is out of reach. */
const POSITION_MULTIPLIER: Record<number, number> = {
  1: 2.0,
  2: 1.6,
  3: 1.35,
  4: 1.2,
  5: 1.1,
  6: 1.0,
};
const DEFAULT_POSITION_MULTIPLIER = 0.4;

/** Prize money for finishing `position` in a division of level `divisionLevel`
 *  (1 = top flight). Falls back to the lowest division's base for unlisted levels. */
export function prizeMoneyFor(divisionLevel: number, position: number): number {
  const base = DIVISION_BASE_PRIZE[divisionLevel] ?? DIVISION_BASE_PRIZE[3];
  const multiplier = POSITION_MULTIPLIER[position] ?? DEFAULT_POSITION_MULTIPLIER;
  return Math.round(base * multiplier);
}

// ── cup prizes ────────────────────────────────────────────────────────────────────
// Deliberately much smaller than any league prize tier — the league is the main incentive.

export const CUP_PRIZE = {
  winner: 400_000,
  runnerUp: 250_000,
  semifinalist: 100_000,
} as const;
