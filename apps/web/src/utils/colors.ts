// Design tokens/utilities are re-exported from the design system so existing
// imports of '../utils/colors' keep working. The promotion/relegation *rule*
// below is football-domain knowledge and stays in the app.
import { STATUS_COLORS } from '@fm2k/design-system';
import type { StatusColors } from '@fm2k/design-system';
import { leagueZone } from '@fm2k/engine';

export { STATUS_COLORS, STATUS_COLORS_DARK, getContrastColor, useStatusColors } from '@fm2k/design-system';
export type { StatusColors, StatusVariant } from '@fm2k/design-system';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToLab(hex: string): [number, number, number] {
  // sRGB linearisation (undo gamma encoding)
  const lin = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  // RGB → XYZ (D65 illuminant, sRGB primaries)
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = (lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722) / 1.00000;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  // XYZ → Lab
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const L = 116 * f(y) - 16;
  const a = 500 * (f(x) - f(y));
  const b = 200 * (f(y) - f(z));
  return [L, a, b];
}

export function colorDistance(hexA: string, hexB: string): number {
  const [L1, a1, b1] = rgbToLab(hexA);
  const [L2, a2, b2] = rgbToLab(hexB);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export function leagueRowBg(
  isPlayer: boolean,
  pos: number,
  total: number,
  colors: StatusColors = STATUS_COLORS,
  opts?: { hasDivisionAbove?: boolean; hasDivisionBelow?: boolean },
): string | undefined {
  if (isPlayer) {return colors.playerTeam;}
  const zone = leagueZone(pos, total, opts);
  return zone ? colors[zone] : undefined;
}
