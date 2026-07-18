/** Division par values (average attribute score for a typical player at that level).
 *  Based on 25-season calibration: D1 ~60, D2 ~45, D3 ~35. */
export const DIVISION_PAR: Record<number, number> = { 1: 60, 2: 45, 3: 35 };

/** Extract division level (1/2/3) from a division id like "nor-d2" or "eng-d1". */
export function divisionLevel(divisionId: string): number {
  const m = divisionId.match(/d(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}

/** Color stops from dark burgundy (far below par) to bright green (well above par).
 *  Each stop is [delta, hex] where delta = attribute - par, clamped to [-30, +30]. */
const STOPS: [number, [number, number, number]][] = [
  [-30, [0x4a, 0x00, 0x10]], // dark burgundy
  [-15, [0xcc, 0x22, 0x00]], // red
  [0, [0xdd, 0x88, 0x00]], // amber (at par)
  [15, [0x88, 0xbb, 0x00]], // yellow-green
  [30, [0x00, 0xcc, 0x44]], // bright green
];

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** Returns a hex color string for an attribute value relative to the division par. */
export function attrColor(value: number, par: number): string {
  const delta = Math.max(-30, Math.min(30, value - par));
  for (let i = 1; i < STOPS.length; i++) {
    const [d0, c0] = STOPS[i - 1];
    const [d1, c1] = STOPS[i];
    if (delta <= d1) {
      const t = (delta - d0) / (d1 - d0);
      const r = lerp(c0[0], c1[0], t);
      const g = lerp(c0[1], c1[1], t);
      const b = lerp(c0[2], c1[2], t);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(0,204,68)'; // bright green fallback
}
