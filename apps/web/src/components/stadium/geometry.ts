import type { SectorKey } from '../../utils/stadium';

// ─── Per-type 3D geometry ─────────────────────────────────────────────────────
//
// The stadium world is a 760×600 ground plane (XY); translateZ is "up".
// Every stand is described in a local frame: a w×depth footprint whose top edge
// (local y = 0) is the front (pitch side) and local +y runs away from the pitch.
// The wrapper's rotateZ orients that frame per sector, so all face math below
// is identical for all 8 stands.

export interface TierSpec {
  depth: number // ground-projected depth of the raked deck
  rake: number // deck slope in degrees
  riser: number // vertical wall height in front of this tier
  booth?: boolean // riser is rendered as a VIP booth facade
}

export interface RoofSpec {
  height: number // z of the roof slab
  depth: number // how far forward from the rear wall the slab reaches
}

export interface StandGeometry {
  tiers: TierSpec[]
  roof?: RoofSpec
}

export const STAND_GEOMETRY: Record<string, StandGeometry> = {
  'none': { tiers: [] },
  'open-bleacher': { tiers: [{ depth: 150, rake: 16, riser: 4 }] },
  'covered-grandstand': {
    tiers: [{ depth: 150, rake: 20, riser: 6 }],
    roof: { height: 78, depth: 140 },
  },
  'kop': {
    tiers: [{ depth: 150, rake: 30, riser: 6 }],
    roof: { height: 105, depth: 120 },
  },
  'executive-suite': {
    tiers: [
      { depth: 70, rake: 20, riser: 4 },
      { depth: 60, rake: 24, riser: 26, booth: true },
    ],
    roof: { height: 118, depth: 125 },
  },
  'double-tier': {
    tiers: [
      { depth: 85, rake: 20, riser: 5 },
      { depth: 60, rake: 28, riser: 40 },
    ],
    roof: { height: 140, depth: 110 },
  },
  'triple-tier': {
    tiers: [
      { depth: 60, rake: 18, riser: 5 },
      { depth: 50, rake: 25, riser: 35 },
      { depth: 45, rake: 32, riser: 35 },
    ],
    roof: { height: 175, depth: 105 },
  },
};

// Fixed fake sun from the north-west: baked per-face brightness, never
// recomputed while orbiting.
export const FACE_BRIGHTNESS = {
  deck: 0.92,
  riser: 0.8,
  rear: 0.65,
  sideLeft: 0.55,
  sideRight: 0.75,
  roof: 1,
  fascia: 0.85,
  booth: 1,
} as const;

export type FaceKind = 'deck' | 'riser' | 'rear' | 'side' | 'roof' | 'fascia' | 'booth';

export interface Face {
  kind: FaceKind
  left: number
  top: number
  width: number
  height: number
  transform: string
  origin: string
  brightness: number
  clipPath?: string
  tier?: number // deck tier index (drives seat SVG ids)
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface StandProfile {
  /** top-edge silhouette as [groundY, z] points, front to back */
  points: Array<[number, number]>
  totalDepth: number
  deckTopZ: number
  maxZ: number // includes roof
}

export function computeStandProfile(type: string, scale = 1): StandProfile {
  const geo = STAND_GEOMETRY[type] ?? STAND_GEOMETRY['none'];
  const points: Array<[number, number]> = [[0, 0]];
  let y = 0;
  let z = 0;
  for (const t of geo.tiers) {
    const depth = t.depth * scale;
    const riser = t.riser * scale;
    if (riser > 0) {
      z += riser;
      points.push([y, z]);
    }
    const rise = depth * Math.tan(rad(t.rake));
    y += depth;
    z += rise;
    points.push([y, z]);
  }
  const deckTopZ = z;
  const maxZ = geo.roof ? Math.max(geo.roof.height * scale, deckTopZ) : deckTopZ;
  return { points, totalDepth: y, deckTopZ, maxZ };
}

/**
 * Wedge mode for corner fan facets: the face field is clipped to the triangle
 * radiating from the stand's front-center apex, with half-angle `halfAngleDeg`
 * around the local depth axis. Used to build rounded corners as a fan of
 * narrow facets whose radial edges meet exactly.
 */
export interface WedgeSpec {
  halfAngleDeg: number
}

/**
 * Compute all 3D faces of a stand in its local frame.
 * `w` is the width along the pitch edge, `scale` shrinks depth/heights.
 * With `wedge` set, faces are clipped to the fan wedge and side walls are
 * dropped (adjacent facets/stands cover them). Roof and fascia are also
 * omitted: a corner's roof is one merged face (see computeCornerRoofFaces)
 * so no facet lines show on it.
 */
export function computeStandFaces(type: string, w: number, scale = 1, wedge?: WedgeSpec): Face[] {
  const geo = STAND_GEOMETRY[type] ?? STAND_GEOMETRY['none'];
  if (geo.tiers.length === 0) { return []; }

  // Wedge clip helpers: at plan depth g the wedge half-width is g·tan(Δ),
  // centered on the apex at (w/2, 0).
  const cx = w / 2;
  const tanD = wedge ? Math.tan(rad(wedge.halfAngleDeg)) : 0;
  const halfW = (g: number) => Math.min(cx, g * tanD);
  // vertical wall standing at ground line g
  const wallClip = (g: number, h: number) => {
    const hw = halfW(g);
    return `polygon(${r1(cx - hw)}px 0px, ${r1(cx + hw)}px 0px, ${r1(cx + hw)}px ${r1(h)}px, ${r1(cx - hw)}px ${r1(h)}px)`;
  };
  // sloped/flat plane spanning ground lines g0 (div y=0) to g1 (div y=len)
  const rampClip = (g0: number, g1: number, len: number) => {
    const hw0 = halfW(g0);
    const hw1 = halfW(g1);
    return `polygon(${r1(cx - hw0)}px 0px, ${r1(cx + hw0)}px 0px, ${r1(cx + hw1)}px ${r1(len)}px, ${r1(cx - hw1)}px ${r1(len)}px)`;
  };

  const faces: Face[] = [];
  let y = 0;
  let z = 0;

  geo.tiers.forEach((t, i) => {
    const depth = t.depth * scale;
    const riser = t.riser * scale;
    if (riser > 0 && (!wedge || y > 0)) {
      // Vertical wall standing on the ground line y, base lifted to z.
      // (a wedge's front riser at the apex has zero width — skipped)
      faces.push({
        kind: t.booth ? 'booth' : 'riser',
        left: 0,
        top: r1(y - riser),
        width: w,
        height: r1(riser),
        origin: '50% 100%',
        transform: `translateZ(${r1(z)}px) rotateX(-90deg)`,
        brightness: t.booth ? FACE_BRIGHTNESS.booth : FACE_BRIGHTNESS.riser,
        ...(wedge && { clipPath: wallClip(y, riser) }),
      });
    }
    if (riser > 0) { z += riser; }
    const rake = rad(t.rake);
    const slant = depth / Math.cos(rake);
    // Raked deck hinged at its front edge: rotateX(+rake) lifts the rear edge.
    faces.push({
      kind: 'deck',
      tier: i,
      left: 0,
      top: r1(y),
      width: w,
      height: r1(slant),
      origin: '50% 0',
      transform: `translateZ(${r1(z)}px) rotateX(${t.rake}deg)`,
      brightness: FACE_BRIGHTNESS.deck,
      ...(wedge && { clipPath: rampClip(y, y + depth, slant) }),
    });
    y += depth;
    z += depth * Math.tan(rake);
  });

  const profile = computeStandProfile(type, scale);
  const totalDepth = profile.totalDepth;
  const roofZ = geo.roof ? geo.roof.height * scale : 0;
  const rearTop = Math.max(profile.deckTopZ, roofZ);

  // Rear wall from ground to the top of the stand (or roof line). For a wedge
  // this is the chord across the fan's outer edge — the full div width.
  faces.push({
    kind: 'rear',
    left: 0,
    top: r1(totalDepth - rearTop),
    width: w,
    height: r1(rearTop),
    origin: '50% 100%',
    transform: 'translateZ(0px) rotateX(-90deg)',
    brightness: FACE_BRIGHTNESS.rear,
    ...(wedge && { clipPath: wallClip(totalDepth, rearTop) }),
  });

  // Side walls: div x-axis maps to world z via rotateY(-90) about the left
  // edge; clip-path follows the raked silhouette in (x = z, y = depth)
  // coordinates. Wedge facets have none — neighbours cover their radial edges.
  if (!wedge) {
    const silhouette = [
      '0px 0px',
      ...profile.points.slice(1).map(([py, pz]) => `${r1(pz)}px ${r1(py)}px`),
      `${r1(rearTop)}px ${r1(totalDepth)}px`,
      `0px ${r1(totalDepth)}px`,
    ].join(', ');
    for (const side of ['left', 'right'] as const) {
      faces.push({
        kind: 'side',
        left: side === 'left' ? 0 : w,
        top: 0,
        width: r1(rearTop),
        height: r1(totalDepth),
        origin: '0 50%',
        transform: 'rotateY(-90deg)',
        clipPath: `polygon(${silhouette})`,
        brightness: side === 'left' ? FACE_BRIGHTNESS.sideLeft : FACE_BRIGHTNESS.sideRight,
      });
    }
  }

  if (geo.roof && !wedge) {
    const roofDepth = geo.roof.depth * scale;
    const roofFrontY = totalDepth - roofDepth;
    const overhang = 4;
    faces.push({
      kind: 'roof',
      left: -overhang,
      top: r1(roofFrontY),
      width: w + overhang * 2,
      height: r1(roofDepth),
      origin: '50% 50%',
      transform: `translateZ(${r1(roofZ)}px)`,
      brightness: FACE_BRIGHTNESS.roof,
    });
    // Thin fascia hanging from the roof's front edge.
    const fasciaH = 10 * scale;
    faces.push({
      kind: 'fascia',
      left: -overhang,
      top: r1(roofFrontY - fasciaH),
      width: w + overhang * 2,
      height: r1(fasciaH),
      origin: '50% 100%',
      transform: `translateZ(${r1(roofZ - fasciaH)}px) rotateX(-90deg)`,
      brightness: FACE_BRIGHTNESS.fascia,
    });
  }

  return faces;
}

// ─── Sector placement on the 760×600 ground plane ────────────────────────────

export const WORLD_W = 760;
export const WORLD_H = 600;
export const CORNER_SIZE = 160;

export interface StandPlacement {
  cx: number
  cy: number
  w: number // width along the pitch edge
  depth: number // footprint depth (matches total tier depth at scale 1)
  rotZ: number // orients local "front = top edge" toward the pitch
  scale: number
}

const SIDE_DEPTH = 160;

// Corner wrappers are unrotated squares; orientation lives in CORNER_FANS.
export const STAND_PLACEMENTS: Record<SectorKey, StandPlacement> = {
  N: { cx: 380, cy: 80, w: 440, depth: SIDE_DEPTH, rotZ: 180, scale: 1 },
  S: { cx: 380, cy: 520, w: 440, depth: SIDE_DEPTH, rotZ: 0, scale: 1 },
  W: { cx: 80, cy: 300, w: 280, depth: SIDE_DEPTH, rotZ: 90, scale: 1 },
  E: { cx: 680, cy: 300, w: 280, depth: SIDE_DEPTH, rotZ: -90, scale: 1 },
  NW: { cx: 80, cy: 80, w: CORNER_SIZE, depth: CORNER_SIZE, rotZ: 0, scale: 1 },
  NE: { cx: 680, cy: 80, w: CORNER_SIZE, depth: CORNER_SIZE, rotZ: 0, scale: 1 },
  SW: { cx: 80, cy: 520, w: CORNER_SIZE, depth: CORNER_SIZE, rotZ: 0, scale: 1 },
  SE: { cx: 680, cy: 520, w: CORNER_SIZE, depth: CORNER_SIZE, rotZ: 0, scale: 1 },
};

export type CornerKey = 'NW' | 'NE' | 'SW' | 'SE';

export const CORNER_KEYS: CornerKey[] = ['NW', 'NE', 'SW', 'SE'];

export function isCornerKey(key: SectorKey): key is CornerKey {
  return (CORNER_KEYS as string[]).includes(key);
}

// ─── Rounded corner fans ──────────────────────────────────────────────────────
//
// A corner is a fan of narrow wedge facets rotating around the pitch-side
// inner corner of its square (the apex). The fan sweeps the 90° between the
// two neighbouring side stands' orientations, so the bowl curves smoothly
// instead of two straight stands meeting at a diagonal.

export const CORNER_FACETS = 4;

/** Extra half-angle added to each wedge so adjacent facets overlap instead of
 *  abutting edge-to-edge. Two independently antialiased clip-path edges never
 *  sum to full pixel coverage, so exactly-meeting facets leak a hairline of the
 *  dark ground ring through every shared radial edge; a slight overlap leaves
 *  no gap to bleed through. */
export const FACET_BLEED_DEG = 0.75;

export interface CornerFan {
  apexX: number // apex position within the corner square (local coords)
  apexY: number
  fromDeg: number // orientation of the facet edge shared with the N/S stand
  toDeg: number // orientation of the edge shared with the E/W stand
}

export const CORNER_FANS: Record<CornerKey, CornerFan> = {
  NW: { apexX: CORNER_SIZE, apexY: CORNER_SIZE, fromDeg: 180, toDeg: 90 },
  NE: { apexX: 0, apexY: CORNER_SIZE, fromDeg: 180, toDeg: 270 },
  SW: { apexX: CORNER_SIZE, apexY: 0, fromDeg: 0, toDeg: 90 },
  SE: { apexX: 0, apexY: 0, fromDeg: 0, toDeg: -90 },
};

export interface FacetGeometry {
  rotZ: number // facet bisector orientation (rotation about the apex)
  w: number // facet div width (chord across the wedge's rear)
  depth: number // facet div height (apex to rear chord)
  scale: number // cos(halfAngle): rear chord lies on the fan radius
  halfAngleDeg: number
}

/**
 * Placement of each facet of a corner fan. All facets share the same wedge
 * shape; only the rotation about the apex differs. The facet's local frame
 * has its apex at top-center, so a wrapper places (w/2, 0) on the fan apex
 * and rotates by rotZ.
 */
export function computeCornerFacets(fan: CornerFan, type: string): FacetGeometry[] {
  // The wedge is built from a slightly widened half-angle while the rotZ
  // spacing keeps the exact step, so every facet overlaps each neighbour by
  // 2·FACET_BLEED_DEG of arc at every radius (see FACET_BLEED_DEG).
  const half = 90 / CORNER_FACETS / 2 + FACET_BLEED_DEG;
  const scale = Math.cos(rad(half));
  const radius = computeStandProfile(type).totalDepth;
  const w = 2 * radius * Math.sin(rad(half));
  const depth = radius * scale;
  const step = (fan.toDeg - fan.fromDeg) / CORNER_FACETS;
  return Array.from({ length: CORNER_FACETS }, (_, i) => ({
    rotZ: fan.fromDeg + (i + 0.5) * step,
    w: r1(w),
    depth: r1(depth),
    scale,
    halfAngleDeg: half,
  }));
}

/**
 * The merged roof of a corner: one flat quarter-annulus face spanning the
 * whole 90° fan, so the roof reads as a single surface with no facet lines.
 * Returned in the corner square's local (unrotated) coordinates.
 */
export function computeCornerRoofFaces(fan: CornerFan, type: string): Face[] {
  const geo = STAND_GEOMETRY[type] ?? STAND_GEOMETRY['none'];
  if (!geo.roof || geo.tiers.length === 0) { return []; }
  const outer = computeStandProfile(type).totalDepth;
  const inner = Math.max(0, outer - geo.roof.depth);

  // direction of a facet's depth axis at fan angle θ (unrotated axis is +y)
  const dir = (deg: number): [number, number] => [-Math.sin(rad(deg)), Math.cos(rad(deg))];
  const STEPS = 12;
  const at = (radius: number, f: number): string => {
    const [dx, dy] = dir(fan.fromDeg + (fan.toDeg - fan.fromDeg) * f);
    return `${r1(fan.apexX + radius * dx)}px ${r1(fan.apexY + radius * dy)}px`;
  };
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) { pts.push(at(outer, i / STEPS)); }
  for (let i = STEPS; i >= 0; i--) { pts.push(at(inner, i / STEPS)); }

  return [{
    kind: 'roof',
    left: 0,
    top: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    origin: '50% 50%',
    transform: `translateZ(${r1(geo.roof.height)}px)`,
    brightness: FACE_BRIGHTNESS.roof,
    clipPath: `polygon(${pts.join(', ')})`,
  }];
}

export function standMaxHeight(type: string, scale = 1): number {
  return computeStandProfile(type, scale).maxZ;
}
