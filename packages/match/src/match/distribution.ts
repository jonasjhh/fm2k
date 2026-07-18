import { simulateMatch, type SideInput } from './simulate.ts';
import type { DuelType } from './duel/duels.ts';

// Re-exported for existing consumers; the implementation lives in rng.ts so the
// simulator can share it without an import cycle.
import { mulberry32 } from './rng.ts';
export { mulberry32 };

export interface DistributionInput {
  home: SideInput;
  away: SideInput;
  eventsPerMinute?: number;
}

export interface DistributionResult {
  n: number;
  /** Win/draw/loss from the home side's perspective, as fractions of n. */
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  goals: {
    homeMean: number;
    awayMean: number;
    totalMean: number;
    totalMedian: number;
    totalMax: number;
    /** total-goals → match count. */
    histogram: Record<number, number>;
    /** Signed (home − away) goal margin → match count. */
    marginHistogram: Record<number, number>;
  };
  /** Fraction of matches where the side conceded nothing. */
  cleanSheetHomePct: number;
  cleanSheetAwayPct: number;
  bothScoredPct: number;
  /** Per-match mean duels won by type (0s when a result predates the stat). */
  duelsWonHome: Record<DuelType, number>;
  duelsWonAway: Record<DuelType, number>;
  longThrowsPerMatch: number;
  lastManFoulsPerMatch: number;
  /** Per-match means. */
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  possessionHome: number;
  foulsPerMatch: number;
  yellowsPerMatch: number;
  redsPerMatch: number;
  penaltiesPerMatch: number;
  cornersPerMatch: number;
  injuriesPerMatch: number;
  endEnergyHome: number;
  endEnergyAway: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) { return 0; }
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Run `n` seeded matches for a fixed pair of inputs and aggregate the outcome
 * distribution — the black-box lens for calibration (and the `/test` sandbox).
 */
export function runDistribution(input: DistributionInput, n: number, seedBase = 1): DistributionResult {
  let homeWin = 0, draw = 0, awayWin = 0;
  let hG = 0, aG = 0;
  let shotsH = 0, shotsA = 0, sotH = 0, sotA = 0, possH = 0;
  let fouls = 0, yellows = 0, reds = 0, pens = 0, corners = 0, injuries = 0;
  let energyH = 0, energyA = 0;
  let cleanH = 0, cleanA = 0, bothScored = 0, longThrows = 0, lastManFouls = 0;
  const zeroTally = (): Record<DuelType, number> => ({ speed: 0, strength: 0, dribble: 0, pass: 0, shot: 0 });
  const duelsH = zeroTally();
  const duelsA = zeroTally();
  const totals: number[] = [];
  const histogram: Record<number, number> = {};
  const marginHistogram: Record<number, number> = {};

  for (let i = 0; i < n; i++) {
    const r = simulateMatch({
      home: input.home,
      away: input.away,
      eventsPerMinute: input.eventsPerMinute ?? 3,
      rng: mulberry32(seedBase + i),
    });
    const { home: h, away: a } = r.score;
    if (h > a) { homeWin++; } else if (a > h) { awayWin++; } else { draw++; }
    hG += h; aG += a;
    const total = h + a;
    totals.push(total);
    histogram[total] = (histogram[total] ?? 0) + 1;
    marginHistogram[h - a] = (marginHistogram[h - a] ?? 0) + 1;
    if (a === 0) { cleanH++; }
    if (h === 0) { cleanA++; }
    if (h > 0 && a > 0) { bothScored++; }

    const st = r.statistics;
    shotsH += st.shots.home; shotsA += st.shots.away;
    sotH += st.shotsOnTarget.home; sotA += st.shotsOnTarget.away;
    possH += st.possession.home;
    fouls += st.fouls.home + st.fouls.away;
    yellows += st.cards.yellow.home + st.cards.yellow.away;
    reds += st.cards.red.home + st.cards.red.away;
    corners += st.corners.home + st.corners.away;
    for (const e of r.events) {
      if (e.type === 'penalty') { pens++; }
      if (e.type === 'throw_in' && e.description.includes('long throw')) { longThrows++; }
      if (e.type === 'foul' && e.description.includes('the last man')) { lastManFouls++; }
    }
    if (st.duelsWon) {
      for (const t of Object.keys(duelsH) as DuelType[]) {
        duelsH[t] += st.duelsWon.home[t];
        duelsA[t] += st.duelsWon.away[t];
      }
    }
    injuries += r.playerUpdates.home.filter(u => u.injury).length + r.playerUpdates.away.filter(u => u.injury).length;
    const avg = (us: typeof r.playerUpdates.home) => us.reduce((s, u) => s + u.endEnergy, 0) / (us.length || 1);
    energyH += avg(r.playerUpdates.home); energyA += avg(r.playerUpdates.away);
  }

  return {
    n,
    homeWinPct: homeWin / n,
    drawPct: draw / n,
    awayWinPct: awayWin / n,
    goals: {
      homeMean: hG / n,
      awayMean: aG / n,
      totalMean: (hG + aG) / n,
      totalMedian: median(totals),
      totalMax: Math.max(...totals),
      histogram,
      marginHistogram,
    },
    cleanSheetHomePct: cleanH / n,
    cleanSheetAwayPct: cleanA / n,
    bothScoredPct: bothScored / n,
    duelsWonHome: Object.fromEntries(Object.entries(duelsH).map(([k, v]) => [k, v / n])) as Record<DuelType, number>,
    duelsWonAway: Object.fromEntries(Object.entries(duelsA).map(([k, v]) => [k, v / n])) as Record<DuelType, number>,
    longThrowsPerMatch: longThrows / n,
    lastManFoulsPerMatch: lastManFouls / n,
    shotsHome: shotsH / n,
    shotsAway: shotsA / n,
    shotsOnTargetHome: sotH / n,
    shotsOnTargetAway: sotA / n,
    possessionHome: possH / n,
    foulsPerMatch: fouls / n,
    yellowsPerMatch: yellows / n,
    redsPerMatch: reds / n,
    penaltiesPerMatch: pens / n,
    cornersPerMatch: corners / n,
    injuriesPerMatch: injuries / n,
    endEnergyHome: energyH / n,
    endEnergyAway: energyA / n,
  };
}
