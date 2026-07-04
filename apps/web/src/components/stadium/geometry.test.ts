import {
  STAND_GEOMETRY,
  STAND_PLACEMENTS,
  CORNER_FANS,
  CORNER_KEYS,
  CORNER_SIZE,
  CORNER_FACETS,
  computeCornerFacets,
  computeCornerRoofFaces,
  computeStandFaces,
  computeStandProfile,
  standMaxHeight,
  type Face,
  type StandGeometry,
} from './geometry';

const ORDERED_TYPES = [
  'none',
  'open-bleacher',
  'covered-grandstand',
  'kop',
  'executive-suite',
  'double-tier',
  'triple-tier',
];

const BUILT_TYPES = ORDERED_TYPES.filter(t => t !== 'none');

function must<T>(v: T | undefined): T {
  if (v === undefined) { throw new Error('expected a value'); }
  return v;
}

const geoOf = (type: string): StandGeometry => must(STAND_GEOMETRY[type]);

describe('computeStandProfile:', () => {
  test('max heights are strictly increasing across the type ladder', () => {
    const heights = ORDERED_TYPES.map(t => standMaxHeight(t));
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(must(heights[i - 1]));
    }
  });

  test('none has zero height and zero depth', () => {
    const p = computeStandProfile('none');
    expect(p.maxZ).toBe(0);
    expect(p.totalDepth).toBe(0);
    expect(p.points).toEqual([[0, 0]]);
  });

  test('unknown type falls back to none', () => {
    expect(computeStandProfile('does-not-exist').maxZ).toBe(0);
    expect(computeStandFaces('does-not-exist', 440)).toEqual([]);
  });

  test('deck rise follows depth·tan(rake) per tier', () => {
    for (const type of BUILT_TYPES) {
      const expected = geoOf(type).tiers.reduce(
        (z, t) => z + t.riser + t.depth * Math.tan((t.rake * Math.PI) / 180),
        0,
      );
      expect(computeStandProfile(type).deckTopZ).toBeCloseTo(expected, 6);
    }
  });

  test('silhouette points rise monotonically front to back', () => {
    for (const type of BUILT_TYPES) {
      const { points } = computeStandProfile(type);
      for (let i = 1; i < points.length; i++) {
        const [prevY, prevZ] = must(points[i - 1]);
        const [curY, curZ] = must(points[i]);
        expect(curY).toBeGreaterThanOrEqual(prevY);
        expect(curZ).toBeGreaterThanOrEqual(prevZ);
      }
    }
  });

  test('roof sits above the top deck edge', () => {
    for (const type of BUILT_TYPES) {
      const roof = geoOf(type).roof;
      if (!roof) { continue; }
      expect(roof.height).toBeGreaterThan(computeStandProfile(type).deckTopZ);
    }
  });

  test('scale shrinks depth and height proportionally', () => {
    const full = computeStandProfile('double-tier', 1);
    const scaled = computeStandProfile('double-tier', 0.7);
    expect(scaled.totalDepth).toBeCloseTo(full.totalDepth * 0.7, 6);
    expect(scaled.maxZ).toBeCloseTo(full.maxZ * 0.7, 6);
  });
});

describe('computeStandFaces:', () => {
  const byKind = (faces: Face[], kind: Face['kind']) => faces.filter(f => f.kind === kind);

  test('none produces no faces', () => {
    expect(computeStandFaces('none', 440)).toEqual([]);
  });

  test('face inventory matches the geometry table', () => {
    for (const type of BUILT_TYPES) {
      const geo = geoOf(type);
      const faces = computeStandFaces(type, 440);
      expect(byKind(faces, 'deck')).toHaveLength(geo.tiers.length);
      expect(byKind(faces, 'rear')).toHaveLength(1);
      expect(byKind(faces, 'side')).toHaveLength(2);
      expect(byKind(faces, 'roof')).toHaveLength(geo.roof ? 1 : 0);
      expect(byKind(faces, 'fascia')).toHaveLength(geo.roof ? 1 : 0);
      const boothRisers = geo.tiers.filter(t => t.booth && t.riser > 0).length;
      expect(byKind(faces, 'booth')).toHaveLength(boothRisers);
    }
  });

  test('only executive-suite has a booth facade', () => {
    for (const type of BUILT_TYPES) {
      const booths = byKind(computeStandFaces(type, 440), 'booth');
      expect(booths.length).toBe(type === 'executive-suite' ? 1 : 0);
    }
  });

  test('decks are ordered and stack: each tier starts where the previous ended', () => {
    for (const type of BUILT_TYPES) {
      const geo = geoOf(type);
      const decks = byKind(computeStandFaces(type, 440), 'deck');
      let y = 0;
      decks.forEach((deck, i) => {
        const t = must(geo.tiers[i]);
        expect(deck.tier).toBe(i);
        expect(deck.top).toBeCloseTo(y, 0);
        // css height is the slant length: depth / cos(rake)
        expect(deck.height).toBeCloseTo(t.depth / Math.cos((t.rake * Math.PI) / 180), 0);
        y += t.depth;
      });
    }
  });

  test('deck slant height exceeds its ground depth (foreshortening)', () => {
    for (const type of BUILT_TYPES) {
      const geo = geoOf(type);
      byKind(computeStandFaces(type, 440), 'deck').forEach((deck, i) => {
        expect(deck.height).toBeGreaterThan(must(geo.tiers[i]).depth);
      });
    }
  });

  test('rear wall spans ground to max height at the back edge', () => {
    for (const type of BUILT_TYPES) {
      const profile = computeStandProfile(type);
      const rear = must(byKind(computeStandFaces(type, 440), 'rear')[0]);
      expect(rear.height).toBeCloseTo(profile.maxZ, 0);
      expect(rear.top + rear.height).toBeCloseTo(profile.totalDepth, 0);
    }
  });

  test('side walls carry a silhouette clip-path and flank the stand', () => {
    const faces = computeStandFaces('triple-tier', 440);
    const [left, right] = byKind(faces, 'side');
    expect(must(left).left).toBe(0);
    expect(must(right).left).toBe(440);
    for (const side of [must(left), must(right)]) {
      expect(side.clipPath).toMatch(/^polygon\(/);
      expect(side.height).toBeCloseTo(computeStandProfile('triple-tier').totalDepth, 0);
    }
    // left side is in shadow relative to right (fixed NW sun)
    expect(must(left).brightness).toBeLessThan(must(right).brightness);
  });

  test('roof floats at its table height above the deck', () => {
    const faces = computeStandFaces('kop', 440);
    const roof = must(byKind(faces, 'roof')[0]);
    const roofHeight = must(geoOf('kop').roof).height;
    expect(roof.transform).toContain(`translateZ(${roofHeight}px)`);
  });

  test('all brightness values are within (0, 1]', () => {
    for (const type of BUILT_TYPES) {
      for (const face of computeStandFaces(type, 440)) {
        expect(face.brightness).toBeGreaterThan(0);
        expect(face.brightness).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('corner fans (rounded corners):', () => {
  const byKind = (faces: Face[], kind: Face['kind']) => faces.filter(f => f.kind === kind);
  const facetsOf = (key: keyof typeof CORNER_FANS, type = 'kop') =>
    computeCornerFacets(CORNER_FANS[key], type);

  test('each corner fan has CORNER_FACETS facets sweeping exactly 90°', () => {
    for (const key of CORNER_KEYS) {
      const fan = CORNER_FANS[key];
      const facets = facetsOf(key);
      expect(facets).toHaveLength(CORNER_FACETS);
      expect(Math.abs(fan.toDeg - fan.fromDeg)).toBe(90);
      // facet bisectors stay strictly inside the sweep, spaced evenly
      const step = (fan.toDeg - fan.fromDeg) / CORNER_FACETS;
      facets.forEach((f, i) => {
        expect(f.rotZ).toBeCloseTo(fan.fromDeg + (i + 0.5) * step, 6);
      });
    }
  });

  test('facet wedge dimensions follow the fan radius (stand depth)', () => {
    const radius = computeStandProfile('kop').totalDepth;
    const half = 90 / CORNER_FACETS / 2;
    for (const facet of facetsOf('NW')) {
      expect(facet.halfAngleDeg).toBeCloseTo(half, 6);
      expect(facet.scale).toBeCloseTo(Math.cos((half * Math.PI) / 180), 6);
      expect(facet.w).toBeCloseTo(2 * radius * Math.sin((half * Math.PI) / 180), 0);
      expect(facet.depth).toBeCloseTo(radius * facet.scale, 0);
      // the facet fits inside its corner square
      expect(facet.depth).toBeLessThanOrEqual(CORNER_SIZE);
    }
  });

  test('wedge faces are clipped and have no side walls', () => {
    const facet = must(facetsOf('NE', 'triple-tier')[0]);
    const faces = computeStandFaces('triple-tier', facet.w, facet.scale, { halfAngleDeg: facet.halfAngleDeg });
    expect(byKind(faces, 'side')).toHaveLength(0);
    for (const face of faces) {
      expect(face.clipPath).toMatch(/^polygon\(/);
    }
  });

  test('wedge deck clip converges to the apex and widens with depth', () => {
    const facet = must(facetsOf('SW', 'open-bleacher')[0]);
    const faces = computeStandFaces('open-bleacher', facet.w, facet.scale, { halfAngleDeg: facet.halfAngleDeg });
    const deck = must(byKind(faces, 'deck')[0]);
    const pts = [...must(deck.clipPath).matchAll(/([\d.]+)px ([\d.]+)px/g)]
      .map(m => [Number(m[1]), Number(m[2])] as const);
    // front edge pinches to the apex (both leading points at cx, y=0)
    const cx = facet.w / 2;
    expect(must(pts[0])[0]).toBeCloseTo(cx, 0);
    expect(must(pts[1])[0]).toBeCloseTo(cx, 0);
    expect(must(pts[0])[1]).toBe(0);
    expect(must(pts[1])[1]).toBe(0);
    // rear edge spans the full div width (the wedge chord)
    const xs = pts.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(0, 0);
    expect(Math.max(...xs)).toBeCloseTo(facet.w, 0);
  });

  test('wedge rear wall spans the full chord at the fan radius', () => {
    const facet = must(facetsOf('SE', 'kop')[0]);
    const faces = computeStandFaces('kop', facet.w, facet.scale, { halfAngleDeg: facet.halfAngleDeg });
    const rear = must(byKind(faces, 'rear')[0]);
    expect(rear.width).toBeCloseTo(facet.w, 0);
    expect(rear.top + rear.height).toBeCloseTo(facet.depth, 0);
  });

  test('wedge facets carry no roof or fascia — the corner roof is merged', () => {
    const facet = must(facetsOf('NW', 'kop')[0]);
    const faces = computeStandFaces('kop', facet.w, facet.scale, { halfAngleDeg: facet.halfAngleDeg });
    expect(byKind(faces, 'roof')).toHaveLength(0);
    expect(byKind(faces, 'fascia')).toHaveLength(0);
  });

  test('merged corner roof is a single flat quarter-annulus at roof height', () => {
    for (const key of CORNER_KEYS) {
      const fan = CORNER_FANS[key];
      const faces = computeCornerRoofFaces(fan, 'kop');
      expect(faces).toHaveLength(1);
      const roof = must(faces[0]);
      expect(roof.kind).toBe('roof');
      expect(roof.transform).toContain(`translateZ(${must(geoOf('kop').roof).height}px)`);
      // annulus vertices stay within the fan radius of the apex
      const radius = computeStandProfile('kop').totalDepth;
      const pts = [...must(roof.clipPath).matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)]
        .map(m => [Number(m[1]), Number(m[2])] as const);
      expect(pts.length).toBeGreaterThan(8);
      for (const [x, py] of pts) {
        const r = Math.hypot(x - fan.apexX, py - fan.apexY);
        expect(r).toBeLessThanOrEqual(radius + 0.5);
        expect(r).toBeGreaterThanOrEqual(radius - must(geoOf('kop').roof).depth - 0.5);
      }
    }
  });

  test('unroofed types get no merged corner roof', () => {
    expect(computeCornerRoofFaces(CORNER_FANS.NW, 'open-bleacher')).toHaveLength(0);
    expect(computeCornerRoofFaces(CORNER_FANS.NW, 'none')).toHaveLength(0);
  });

  test('fan sweeps start at the horizontal neighbour and end at the vertical one', () => {
    for (const key of CORNER_KEYS) {
      const fan = CORNER_FANS[key];
      expect([0, 180]).toContain(fan.fromDeg); // S / N orientation
      expect([90, -90, 270]).toContain(fan.toDeg); // W / E orientation
    }
  });
});

describe('STAND_PLACEMENTS:', () => {
  test('covers all 8 sectors; corners are unrotated full-scale squares', () => {
    expect(Object.keys(STAND_PLACEMENTS)).toHaveLength(8);
    for (const key of CORNER_KEYS) {
      const p = STAND_PLACEMENTS[key];
      expect(p.scale).toBe(1);
      expect(p.rotZ).toBe(0);
      expect(p.w).toBe(CORNER_SIZE);
      expect(p.depth).toBe(CORNER_SIZE);
    }
    for (const key of ['N', 'S', 'E', 'W'] as const) {
      expect(STAND_PLACEMENTS[key].scale).toBe(1);
    }
  });

  test('opposite side stands face each other (rotZ 180° apart)', () => {
    const pairs = [['N', 'S'], ['E', 'W']] as const;
    for (const [a, b] of pairs) {
      const diff = Math.abs(STAND_PLACEMENTS[a].rotZ - STAND_PLACEMENTS[b].rotZ);
      expect(diff % 360).toBe(180);
    }
  });
});
