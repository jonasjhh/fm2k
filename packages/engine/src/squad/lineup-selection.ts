import {
  calculateOverall, FORMATION_LINES, deriveFieldedPositions,
} from '@fm2k/match';
import type {
  Formation, Player, Position, FieldedPositions,
} from '@fm2k/match';

/** Fit floor for two unrelated outfield positions. */
const FIT_FLOOR = 0.4;

/**
 * Suitability (symmetric, excluding GK and exact matches) of playing a player of
 * one position in a slot of another. Anything not listed falls back to FIT_FLOOR.
 */
const FIT_PAIRS: [Position, Position, number][] = [
  // full-backs
  ['LB', 'RB', 0.85],
  ['LB', 'CB', 0.7], ['RB', 'CB', 0.7],
  ['LB', 'LM', 0.7], ['RB', 'RM', 0.7],
  ['LB', 'LW', 0.6], ['RB', 'RW', 0.6],
  // centre-backs / holding
  ['CB', 'CDM', 0.7],
  // central midfield chain
  ['CDM', 'CM', 0.8],
  ['CM', 'CAM', 0.8],
  ['LM', 'CM', 0.7], ['RM', 'CM', 0.7],
  // wide players
  ['LM', 'RM', 0.85],
  ['LM', 'LW', 0.8], ['RM', 'RW', 0.8],
  ['LM', 'RW', 0.6], ['RM', 'LW', 0.6],
  ['LW', 'RW', 0.8],
  // attacking transitions
  ['CAM', 'LW', 0.7], ['CAM', 'RW', 0.7],
  ['CAM', 'ST', 0.75],
  ['LW', 'ST', 0.7], ['RW', 'ST', 0.7],
];

const FIT_LOOKUP: Map<string, number> = new Map(
  FIT_PAIRS.flatMap(([a, b, v]) => [[`${a}|${b}`, v], [`${b}|${a}`, v]]),
);

/** 0..1 suitability of a `playerPos` player filling a `slotPos` slot. */
export function positionFit(playerPos: Position, slotPos: Position): number {
  if (playerPos === slotPos) { return 1; }
  if (playerPos === 'GK' || slotPos === 'GK') { return 0; }
  return FIT_LOOKUP.get(`${playerPos}|${slotPos}`) ?? FIT_FLOOR;
}

export interface SelectionOptions {
  /** Players that cannot play (injured/suspended/etc.); excluded from selection. */
  readonly unavailableIds?: ReadonlySet<string>;
}

/**
 * Greedily assign available players to a formation's slots, maximising total
 * effective rating (player OVR weighted by positional fit). Returns a slot-indexed
 * array (one entry per formation slot, `null` if the squad is too short to fill it)
 * plus the total score of the chosen assignment.
 */
function assignToSlots(
  squad: Player[],
  formation: Formation,
  opts: SelectionOptions = {},
): { slots: (Player | null)[]; score: number } {
  const positions = (FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2']).flat() as Position[];
  const pool = opts.unavailableIds
    ? squad.filter(p => !opts.unavailableIds!.has(p.id))
    : squad;

  const pairs: { pi: number; si: number; score: number }[] = [];
  pool.forEach((p, pi) => {
    const ovr = calculateOverall(p.attributes);
    positions.forEach((slot, si) => {
      pairs.push({ pi, si, score: ovr * positionFit(p.position, slot) });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const slots: (Player | null)[] = Array(positions.length).fill(null);
  const usedPlayers = new Set<number>();
  const filledSlots = new Set<number>();
  let score = 0;

  for (const pair of pairs) {
    if (filledSlots.size === positions.length) { break; }
    if (usedPlayers.has(pair.pi) || filledSlots.has(pair.si)) { continue; }
    slots[pair.si] = pool[pair.pi];
    usedPlayers.add(pair.pi);
    filledSlots.add(pair.si);
    score += pair.score;
  }

  return { slots, score };
}

/**
 * Select the best available starting XI for a formation, ordered to match the
 * flattened `FORMATION_LINES[formation]` slot order. Returns up to 11 players
 * (fewer only if the available squad is short).
 */
export function selectStartingXI(
  squad: Player[],
  formation: Formation,
  opts: SelectionOptions = {},
): Player[] {
  return assignToSlots(squad, formation, opts).slots.filter((p): p is Player => p !== null);
}

/**
 * Like selectStartingXI, but also returns the slot-derived FieldedPositions for the
 * chosen XI, and the leftover squad as substitutes (squad minus the XI) — a full
 * reshuffled Team-shape, suitable for assigning directly onto a Team.
 */
export function selectStartingXIWithSlots(
  squad: Player[],
  formation: Formation,
  opts: SelectionOptions = {},
): { starters: Player[]; substitutes: Player[]; fieldedPositions: FieldedPositions } {
  const { slots } = assignToSlots(squad, formation, opts);
  const starters = slots.filter((p): p is Player => p !== null);
  const startersIds = new Set(starters.map(p => p.id));
  const substitutes = squad.filter(p => !startersIds.has(p.id));
  return { starters, substitutes, fieldedPositions: deriveFieldedPositions(starters, formation) };
}

/**
 * The formation that best suits a squad, assuming every player is fit. Scores each
 * formation by its optimal assignment and returns the highest-scoring one.
 */
export function calculateBestFormation(squad: Player[]): Formation {
  let best: Formation = '4-4-2';
  let bestScore = -Infinity;
  for (const formation of Object.keys(FORMATION_LINES) as Formation[]) {
    const { score } = assignToSlots(squad, formation);
    if (score > bestScore) {
      bestScore = score;
      best = formation;
    }
  }
  return best;
}

/**
 * Slot-indexed player ids (or `null`) for rendering a formation pitch — mirrors the
 * shape of `buildSlotAssignments` but driven by best-available selection.
 */
export function buildXISlotAssignments(
  squad: Player[],
  formation: Formation,
  opts: SelectionOptions = {},
): (string | null)[] {
  return assignToSlots(squad, formation, opts).slots.map(p => p?.id ?? null);
}
