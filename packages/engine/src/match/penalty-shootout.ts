import type { Team } from '../shared/types.ts';
import { getTeamOVR } from '../valuation/valuation.ts';

export interface ShootoutResult {
  readonly home: number;
  readonly away: number;
  readonly winner: 'home' | 'away';
}

const REGULATION_KICKS = 5;
const BASE_CONVERSION = 0.5;
const OVR_WEIGHT = 0.004; // each OVR point adds 0.4% conversion chance
const MIN_CONVERSION = 0.5;
const MAX_CONVERSION = 0.9;

/** Per-kick conversion probability for a team, derived from its starting XI quality. */
function conversionProbability(team: Team): number {
  const prob = BASE_CONVERSION + getTeamOVR(team.starters) * OVR_WEIGHT;
  return Math.min(MAX_CONVERSION, Math.max(MIN_CONVERSION, prob));
}

/**
 * Simulate a penalty shootout to a guaranteed winner: five kicks each, then
 * sudden death. Pure and deterministic given `rng`; isolated from MatchSimulator.
 */
export function simulateShootout(homeTeam: Team, awayTeam: Team, rng: () => number = Math.random): ShootoutResult {
  const homeProb = conversionProbability(homeTeam);
  const awayProb = conversionProbability(awayTeam);

  let home = 0;
  let away = 0;
  for (let i = 0; i < REGULATION_KICKS; i++) {
    if (rng() < homeProb) { home++; }
    if (rng() < awayProb) { away++; }
  }

  while (home === away) {
    const homeScored = rng() < homeProb;
    const awayScored = rng() < awayProb;
    if (homeScored) { home++; }
    if (awayScored) { away++; }
  }

  return { home, away, winner: home > away ? 'home' : 'away' };
}
