import type { Team } from '../shared/types.ts';
import type { BracketSlot, BracketState, KnockoutFormatConfig } from './competition-types.ts';

/** In-place Fisher–Yates shuffle using the injected rng (deterministic in tests). */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tieId(round: number, index: number): string {
  return `r${round}-t${index}`;
}

/** Per-round tie counts for the fixed bracket, e.g. [16, 16, 8, 4, 2, 1]. */
export function roundTieCounts(prelimCount: number, byeCount: number): number[] {
  if (prelimCount !== byeCount * 2) {
    throw new Error(`knockout draw expects prelimCount (${prelimCount}) == 2 × byeCount (${byeCount})`);
  }
  const counts = [byeCount, byeCount]; // round 1 (prelim ties) and round 2 (bye teams enter)
  while (counts[counts.length - 1] > 1) {
    counts.push(counts[counts.length - 1] / 2);
  }
  return counts;
}

/**
 * Draw the fixed single-elimination bracket once. Round 1 pairs the preliminary
 * teams; round 2 introduces the bye (top-flight) teams — each drawn against a
 * round-1 winner and (per config) playing away. From round 3 the lower-indexed
 * feeder slot hosts, which the winner routing encodes implicitly.
 */
export function drawBracket(
  cfg: KnockoutFormatConfig,
  teamsByLevel: Map<number, Team[]>,
  rng: () => number,
): BracketState {
  const prelim = shuffle(
    cfg.preliminaryLevels.flatMap(level => teamsByLevel.get(level) ?? []),
    rng,
  );
  const byes = shuffle(teamsByLevel.get(cfg.byeLevel) ?? [], rng);

  const counts = roundTieCounts(prelim.length, byes.length);
  const rounds = counts.length;
  const slots: BracketSlot[] = [];

  const nextWiring = (round: number, index: number): Pick<BracketSlot, 'nextTieId' | 'nextSlot'> => {
    if (round >= rounds) { return { nextTieId: null, nextSlot: null }; }
    if (round === 1) {
      // 1:1 into round 2 (winner becomes the home side against a bye team).
      return { nextTieId: tieId(2, index), nextSlot: 'home' };
    }
    return { nextTieId: tieId(round + 1, Math.floor(index / 2)), nextSlot: index % 2 === 0 ? 'home' : 'away' };
  };

  // Round 1 — preliminary ties (both teams known).
  for (let i = 0; i < counts[0]; i++) {
    const home = prelim[2 * i];
    const away = prelim[2 * i + 1];
    slots.push({
      tieId: tieId(1, i), round: 1,
      homeTeamId: home.id, awayTeamId: away.id,
      homeTeamName: home.name, awayTeamName: away.name,
      fixtureId: null, winnerTeamId: null,
      ...nextWiring(1, i),
    });
  }

  // Round 2 — bye teams enter; home is the (yet unknown) round-1 winner.
  for (let i = 0; i < counts[1]; i++) {
    const bye = byes[i];
    const byeHome = !cfg.byeTeamPlaysAway;
    slots.push({
      tieId: tieId(2, i), round: 2,
      homeTeamId: byeHome ? bye.id : null,
      awayTeamId: byeHome ? null : bye.id,
      homeTeamName: byeHome ? bye.name : null,
      awayTeamName: byeHome ? null : bye.name,
      fixtureId: null, winnerTeamId: null,
      ...nextWiring(2, i),
    });
  }

  // Rounds 3+ — empty ties filled as predecessors resolve.
  for (let round = 3; round <= rounds; round++) {
    for (let i = 0; i < counts[round - 1]; i++) {
      slots.push({
        tieId: tieId(round, i), round,
        homeTeamId: null, awayTeamId: null, homeTeamName: null, awayTeamName: null,
        fixtureId: null, winnerTeamId: null,
        ...nextWiring(round, i),
      });
    }
  }

  return {
    rounds,
    roundNames: cfg.roundNames.length >= rounds
      ? cfg.roundNames.slice(0, rounds)
      : Array.from({ length: rounds }, (_, i) => cfg.roundNames[i] ?? `Round ${i + 1}`),
    slots,
    championTeamId: null,
  };
}

export function slotById(bracket: BracketState, id: string): BracketSlot | undefined {
  return bracket.slots.find(s => s.tieId === id);
}

export function slotsInRound(bracket: BracketState, round: number): BracketSlot[] {
  return bracket.slots.filter(s => s.round === round);
}

/** True once every tie in a round has a winner. */
export function roundComplete(bracket: BracketState, round: number): boolean {
  return slotsInRound(bracket, round).every(s => s.winnerTeamId !== null);
}

/**
 * Record a tie's winner and advance it into its next slot (or crown the champion
 * for the final). Returns the next tie id touched, if any.
 */
export function recordWinner(
  bracket: BracketState,
  id: string,
  winnerTeamId: string,
  winnerTeamName: string,
): { nextTieId: string | null } {
  const slot = slotById(bracket, id);
  if (!slot) { throw new Error(`unknown bracket tie '${id}'`); }
  slot.winnerTeamId = winnerTeamId;

  if (slot.nextTieId === null) {
    bracket.championTeamId = winnerTeamId;
    return { nextTieId: null };
  }

  const next = slotById(bracket, slot.nextTieId)!;
  if (slot.nextSlot === 'home') {
    next.homeTeamId = winnerTeamId; next.homeTeamName = winnerTeamName;
  } else {
    next.awayTeamId = winnerTeamId; next.awayTeamName = winnerTeamName;
  }
  return { nextTieId: slot.nextTieId };
}
