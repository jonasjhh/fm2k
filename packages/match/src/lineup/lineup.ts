import type { Formation, Player, FormationPosition, FieldedPositions, PlayerGeometry, TeamShapes, Band } from '../shared/types.ts';
import { BAND_OF_ROLE, BAND_TO_FIELD_LINE, BAND_ORDER, flankOfLateral, type FieldedGeometry } from './bands.ts';

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

/** The FormationPosition label a shape member's geometry implies, given their lateral
 *  index `i` among `n` sorted band-mates. Reproduces every predefined formation's slot
 *  names exactly when applied to its canonical geometry: a 4-or-5-wide back line gets
 *  wide defenders on its ends (5-wide = wing-backs), a 4+-wide midfield gets LM/RM, a
 *  3+-wide front line gets wingers; everything else is the band's central role. */
function roleForBandSlot(band: Exclude<Band, 'GK'>, i: number, n: number): FormationPosition {
  const edge = n > 1 && i === 0 ? 'L' : n > 1 && i === n - 1 ? 'R' : null;
  switch (band) {
    case 'DEF':
      if (n >= 4 && edge) { return n >= 5 ? (edge === 'L' ? 'LWB' : 'RWB') : (edge === 'L' ? 'LB' : 'RB'); }
      return 'CB';
    case 'DM': return 'DM';
    case 'MID': return n >= 4 && edge ? (edge === 'L' ? 'LM' : 'RM') : 'CM';
    case 'AM': return 'AM';
    case 'ATT': return n >= 3 && edge ? (edge === 'L' ? 'LW' : 'RW') : 'ST';
  }
}

/** Derive every member's effective FormationPosition from a shape's geometry alone —
 *  behavioral roles no longer exist as stored state (REWORK_01.md ruling: dual shapes
 *  replace them), so this is the single source of "what position is this player playing":
 *  the v1 sim's fielded positions and every UI label resolve through it. Ties in lateral
 *  are broken by id, so the result is deterministic. */
export function deriveRolesForShape(shape: Record<string, PlayerGeometry>): Record<string, FormationPosition> {
  const out: Record<string, FormationPosition> = {};
  for (const band of BAND_ORDER) {
    const members = Object.entries(shape)
      .filter(([, g]) => g.band === band)
      .sort((a, b) => a[1].lateral - b[1].lateral || a[0].localeCompare(b[0]));
    members.forEach(([id], i) => { out[id] = roleForBandSlot(band, i, members.length); });
  }
  return out;
}

/** Build FieldedPositions (derived role labels) and FieldedGeometry (zone-weighting
 *  line/flank) straight from one shape's manager-chosen anchors — the free-positioning
 *  counterpart to deriveFieldedPositions. The v1 sim feeds this the defending shape. */
export function deriveCustomFieldedPositions(
  geometry: Record<string, PlayerGeometry>,
): { fieldedPositions: FieldedPositions; fieldedGeometry: FieldedGeometry } {
  const fieldedPositions = deriveRolesForShape(geometry);
  const fieldedGeometry: FieldedGeometry = {};
  for (const [playerId, g] of Object.entries(geometry)) {
    fieldedGeometry[playerId] = { line: BAND_TO_FIELD_LINE[g.band], flank: flankOfLateral(g.lateral) };
  }
  return { fieldedPositions, fieldedGeometry };
}

/** The canonical PlayerGeometry for every outfield slot of a predefined formation (the GK
 *  slot is excluded — always fixed, never custom), in the same order as
 *  `FORMATION_LINES[formation].flat()` minus its leading GK entry. Derived from
 *  FORMATION_LINES + BAND_OF_ROLE rather than hand-authored, so it can't drift from the
 *  formation table: each row's band comes from its first slot's role, and each slot's
 *  lateral position is evenly spaced across its row by index. Used both to seed a team's
 *  shapes the first time a manager drags a circle off a predefined template, and to
 *  detect whether an edited layout still matches one (for UI highlighting). */
export function canonicalGeometry(formation: Formation): PlayerGeometry[] {
  const lines = FORMATION_LINES[formation] ?? FORMATION_LINES['4-4-2'];
  const out: PlayerGeometry[] = [];
  for (const row of lines) {
    if (row[0] === 'GK') { continue; }
    const band = BAND_OF_ROLE[row[0] as FormationPosition] as Exclude<Band, 'GK'>;
    const n = row.length;
    row.forEach((_slotRole, i) => {
      const lateral = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
      out.push({ band, lateral });
    });
  }
  return out;
}

/** A predefined formation's canonical geometry, keyed by player id instead of slot index —
 *  zips `canonicalGeometry(formation)` against the starting XI's outfielders (slot 0 is
 *  always GK, per the trust contract above). Used both to seed a team's shapes the first
 *  time a manager edits a predefined layout, and by the UI to render one before any
 *  customization has happened. */
export function seedGeometryFromFormation(
  formation: Formation, startingXI: readonly (string | null)[],
): Record<string, PlayerGeometry> {
  const canon = canonicalGeometry(formation);
  const outfielders = startingXI.slice(1);
  const out: Record<string, PlayerGeometry> = {};
  outfielders.forEach((id, i) => { if (id && canon[i]) { out[id] = { ...canon[i] }; } });
  return out;
}

/** Seed both shapes of a TeamShapes identically from a predefined formation — the preset
 *  starting point; arrows appear only once the manager edits one shape away from the
 *  other. The two records are independent copies, never shared references. */
export function seedShapesFromFormation(
  formation: Formation, startingXI: readonly (string | null)[],
): TeamShapes {
  return {
    attacking: seedGeometryFromFormation(formation, startingXI),
    defending: seedGeometryFromFormation(formation, startingXI),
  };
}

/** Synthetic key for "this slot, when empty", distinct from any real player id — used both to
 *  key a placeholder's role-picker expansion state (TacticsPitch) and, here, as the lookup key
 *  for an empty slot's rank in effectiveDisplayOrder's id-keyed map. */
export function emptySlotKey(slotIndex: number): string {
  return `__empty-${slotIndex}`;
}

/** Display rank for ordering a fielded squad's pills/rows, paired with deriveRolesForShape
 *  for the label: when a custom shape is set, ranks the GK first, then groups by band
 *  back-to-front (the reverse of BAND_ORDER, to preserve the table's existing defense-first
 *  reading and only reorder when a player's band actually changes), sorted by lateral within
 *  a band — mirroring how TacticsPitch lays the same data out. An empty slot is ranked too,
 *  keyed by `emptySlotKey` rather than a player id, at the formation's canonical geometry
 *  for that slot. Falls back to natural slot-index order when `shape` is null, so the
 *  common, non-customized case is unchanged. `shape` is whichever single shape the caller
 *  is displaying (the defending shape, for list views). `slotAssignments` is the 15-length
 *  (11 starters incl. GK at index 0, then 4 bench) array from buildSlotAssignments/the
 *  lineup-editing UI's local state. */
export function effectiveDisplayOrder(
  slotAssignments: readonly (string | null)[],
  shape: Record<string, PlayerGeometry> | null,
  formation: Formation,
): Map<string, number> {
  const order = new Map<string, number>();
  if (!shape) {
    slotAssignments.forEach((id, i) => { if (id) { order.set(id, i); } });
    return order;
  }
  const canon = canonicalGeometry(formation);
  const geometryOf = (i: number): PlayerGeometry | undefined => {
    const id = slotAssignments[i];
    return id ? (shape[id] ?? canon[i - 1]) : canon[i - 1];
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

function sameGeometry(a: PlayerGeometry | undefined, b: PlayerGeometry | undefined): boolean {
  if (!a || !b) { return a === b; }
  return a.band === b.band && Math.abs(a.lateral - b.lateral) < LATERAL_MATCH_TOLERANCE;
}

/** Which predefined Formation (if any) a club's current layout matches — `shapes` if set,
 *  else `formation` as-is. A team whose two shapes differ anywhere (i.e. any arrow exists)
 *  is always 'custom'; otherwise the (identical) defending shape is reverse-mapped against
 *  every preset's canonical geometry. Display-only (drives UI pill highlighting); never
 *  affects how a match is actually built. */
export function effectiveFormationLabel(
  formation: Formation,
  startingXI: readonly (string | null)[],
  shapes: TeamShapes | null,
): Formation | 'custom' {
  if (!shapes) { return formation; }

  const ids = startingXI.slice(1).filter((id): id is string => id !== null);
  if (ids.some(id => !sameGeometry(shapes.attacking[id], shapes.defending[id]))) { return 'custom'; }

  const ordered = ids
    .map(id => shapes.defending[id])
    .filter((g): g is PlayerGeometry => !!g);
  for (const candidate of Object.keys(FORMATION_LINES) as Formation[]) {
    const canon = canonicalGeometry(candidate);
    if (canon.length !== ordered.length) { continue; }
    const matches = canon.every((g, i) => sameGeometry(g, ordered[i]));
    if (matches) { return candidate; }
  }
  return 'custom';
}
