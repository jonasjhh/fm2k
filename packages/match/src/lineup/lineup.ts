import type { Formation, Player, FormationPosition, FieldedPositions, PlayerGeometry, Band } from '../shared/types.ts';
import { BAND_OF_ROLE, BAND_TO_FIELD_LINE, BAND_ORDER, flankOfLateral, type FieldedGeometry } from '../match/action-selector.ts';

/** Pitch slots (by position) for each formation, ordered back-to-front. */
export const FORMATION_LINES: Record<Formation, string[][]> = {
  // 4-back
  '4-4-2': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
  '4-3-3': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CM', 'CM', 'CM'], ['LW', 'ST', 'RW']],
  '4-5-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['ST']],
  '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['AM', 'AM', 'AM'], ['ST']],
  '4-1-4-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
  '4-4-1-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['AM'], ['ST']],
  '4-2-4': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['LW', 'ST', 'ST', 'RW']],
  // 3-back
  '3-5-2': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
  '3-4-3': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['LW', 'ST', 'RW']],
  '3-4-2-1': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['AM', 'AM'], ['ST']],
  // 5-back — wide defenders are wing-backs, not plain full-backs (LWB/RWB; see FormationPosition)
  '5-3-2': [['GK'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['CM', 'CM', 'CM'], ['ST', 'ST']],
  '5-4-1': [['GK'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['LM', 'CM', 'CM', 'RM'], ['ST']],
};

/**
 * Assign players to the 11 formation slots (by matching position first, then
 * filling leftover slots with remaining players) plus 4 bench slots.
 * Returns a 15-length array of player ids (or null for empty slots).
 */
export function buildSlotAssignments(
  xiIds: string[],
  benchIds: string[],
  squad: readonly Player[],
  formation: Formation,
): (string | null)[] {
  const slots = (FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2']).flat();
  const players = xiIds.map(id => squad.find(p => p.id === id)).filter(Boolean) as Player[];
  const result: (string | null)[] = Array(slots.length).fill(null);
  const used = new Set<string>();

  for (let i = 0; i < slots.length; i++) {
    const match = players.find(p => !used.has(p.id) && p.position === slots[i]);
    if (match) { result[i] = match.id; used.add(match.id); }
  }
  const remaining = players.filter(p => !used.has(p.id));
  for (let i = 0; i < result.length; i++) {
    if (result[i]) { continue; }
    const next = remaining.shift();
    if (next) { result[i] = next.id; }
  }

  const bench: (string | null)[] = Array(4).fill(null);
  benchIds.slice(0, 4).forEach((id, i) => { bench[i] = id; });
  return [...result, ...bench];
}

/** Zip an already-decided XI against its formation's flattened slot order. Assumes
 *  `starters` is already exactly the right players in slot order (the simulator's
 *  trust contract) — zips only the overlap if shorter/longer. */
export function deriveFieldedPositions(starters: Player[], formation: Formation): FieldedPositions {
  const slots = (FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2']).flat() as FormationPosition[];
  const out: FieldedPositions = {};
  starters.forEach((p, i) => { if (slots[i]) { out[p.id] = slots[i]; } });
  return out;
}

/** Build FieldedPositions (role) and FieldedGeometry (zone-weighting line/flank) straight
 *  from manager-chosen per-player geometry — the free-positioning counterpart to
 *  deriveFieldedPositions, used once a player's layout has departed from every predefined
 *  formation template. */
export function deriveCustomFieldedPositions(
  geometry: Record<string, PlayerGeometry>,
): { fieldedPositions: FieldedPositions; fieldedGeometry: FieldedGeometry } {
  const fieldedPositions: FieldedPositions = {};
  const fieldedGeometry: FieldedGeometry = {};
  for (const [playerId, g] of Object.entries(geometry)) {
    fieldedPositions[playerId] = g.role;
    fieldedGeometry[playerId] = { line: BAND_TO_FIELD_LINE[g.band], flank: flankOfLateral(g.lateral) };
  }
  return { fieldedPositions, fieldedGeometry };
}

/** The canonical PlayerGeometry for every outfield slot of a predefined formation (the GK
 *  slot is excluded — always fixed, never custom), in the same order as
 *  `FORMATION_LINES[formation].flat()` minus its leading GK entry. Derived from
 *  FORMATION_LINES + BAND_OF_ROLE rather than hand-authored, so it can't drift from the
 *  formation table: each row's band comes from its first slot's role, and each slot's
 *  lateral position is evenly spaced across its row by index. Used both to seed
 *  `customSlots` the first time a manager drags a circle off a predefined template, and to
 *  detect whether an edited layout still matches one (for UI highlighting). */
export function canonicalGeometry(formation: Formation): PlayerGeometry[] {
  const lines = FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2'];
  const out: PlayerGeometry[] = [];
  for (const row of lines) {
    if (row[0] === 'GK') { continue; }
    const band = BAND_OF_ROLE[row[0] as FormationPosition] as Exclude<Band, 'GK'>;
    const n = row.length;
    row.forEach((slotRole, i) => {
      const lateral = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
      out.push({ band, lateral, role: slotRole as FormationPosition });
    });
  }
  return out;
}

/** A predefined formation's canonical geometry, keyed by player id instead of slot index —
 *  zips `canonicalGeometry(formation)` against the starting XI's outfielders (slot 0 is
 *  always GK, per the trust contract above). Used both to seed `customSlots` the first
 *  time a manager edits a predefined layout, and by the UI to render one before any
 *  customization has happened. */
export function seedGeometryFromFormation(
  formation: Formation, startingXI: readonly (string | null)[],
): Record<string, PlayerGeometry> {
  const canon = canonicalGeometry(formation);
  const outfielders = startingXI.slice(1);
  const out: Record<string, PlayerGeometry> = {};
  outfielders.forEach((id, i) => { if (id && canon[i]) { out[id] = canon[i]; } });
  return out;
}

/** A fielded player's effective role: their customSlots override if free-positioned, else
 *  whatever template position they'd occupy by default. The single source of truth for "what
 *  position is this player actually playing" — every display that shows a fielded position
 *  label should resolve it through here rather than reading FORMATION_LINES/customSlots
 *  directly, so the two can never silently diverge again. */
export function effectiveRole(
  playerId: string | null,
  templateRole: FormationPosition,
  customSlots: Record<string, PlayerGeometry> | null,
  emptySlotRole?: FormationPosition | null,
): FormationPosition {
  if (!playerId) { return emptySlotRole ?? templateRole; }
  return customSlots?.[playerId]?.role ?? templateRole;
}

/** Synthetic key for "this slot, when empty", distinct from any real player id — used both to
 *  key a placeholder's role-picker expansion state (TacticsPitch) and, here, as the lookup key
 *  for an empty slot's rank in effectiveDisplayOrder's id-keyed map. */
export function emptySlotKey(slotIndex: number): string {
  return `__empty-${slotIndex}`;
}

/** Display rank for ordering a fielded squad's pills/rows, paired with effectiveRole above for
 *  the label: when customSlots is set, ranks the GK first, then groups by band back-to-front
 *  (the reverse of BAND_ORDER, to preserve the table's existing defense-first reading and only
 *  reorder when a player's band actually changes), sorted by lateral within a band — mirroring
 *  how TacticsPitch lays the same data out. An empty slot is ranked too, keyed by
 *  `emptySlotKey` rather than a player id, using its captured `emptySlotRoles` geometry (a
 *  vacated custom-banded slot) if present, else the formation's canonical geometry for that
 *  slot — so an empty slot sorts among its actual band's pills, not its template one. Falls
 *  back to natural slot-index order (today's only behavior) when customSlots is null, so the
 *  common, non-customized case is unchanged. `slotAssignments` is the 15-length (11 starters
 *  incl. GK at index 0, then 4 bench) array from buildSlotAssignments/the lineup-editing UI's
 *  local state. */
export function effectiveDisplayOrder(
  slotAssignments: readonly (string | null)[],
  customSlots: Record<string, PlayerGeometry> | null,
  formation: Formation,
  emptySlotRoles: Partial<Record<number, PlayerGeometry>> | null,
): Map<string, number> {
  const order = new Map<string, number>();
  if (!customSlots) {
    slotAssignments.forEach((id, i) => { if (id) { order.set(id, i); } });
    return order;
  }
  const canon = canonicalGeometry(formation);
  const geometryOf = (i: number): PlayerGeometry | undefined => {
    const id = slotAssignments[i];
    return id ? (customSlots[id] ?? canon[i - 1]) : (emptySlotRoles?.[i] ?? canon[i - 1]);
  };
  let rank = 0;
  const gkId = slotAssignments[0];
  order.set(gkId ?? emptySlotKey(0), rank++); // GK always first, occupied or not
  for (const band of [...BAND_ORDER].reverse()) {
    const indices = Array.from({ length: 10 }, (_, k) => k + 1)
      .filter(i => geometryOf(i)?.band === band)
      .sort((a, b) => (geometryOf(a)?.lateral ?? 0) - (geometryOf(b)?.lateral ?? 0));
    for (const i of indices) { order.set(slotAssignments[i] ?? emptySlotKey(i), rank++); }
  }
  slotAssignments.slice(11).forEach((id, i) => { if (id) { order.set(id, 11 + i); } });
  return order;
}

const LATERAL_MATCH_TOLERANCE = 0.05;

/** Which predefined Formation (if any) a club's current layout matches — `customSlots` if
 *  set, else `formation` as-is. Display-only (drives UI pill highlighting); never affects
 *  how a match is actually built. */
export function effectiveFormationLabel(
  formation: Formation,
  startingXI: readonly (string | null)[],
  customSlots: Record<string, PlayerGeometry> | null,
): Formation | 'custom' {
  if (!customSlots) { return formation; }

  const ordered = startingXI.slice(1)
    .filter((id): id is string => id !== null)
    .map(id => customSlots[id])
    .filter((g): g is PlayerGeometry => !!g);
  for (const candidate of Object.keys(FORMATION_LINES) as Formation[]) {
    const canon = canonicalGeometry(candidate);
    if (canon.length !== ordered.length) { continue; }
    const matches = canon.every((g, i) => (
      g.band === ordered[i].band && g.role === ordered[i].role
      && Math.abs(g.lateral - ordered[i].lateral) < LATERAL_MATCH_TOLERANCE
    ));
    if (matches) { return candidate; }
  }
  return 'custom';
}
