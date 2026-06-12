// Design tokens/utilities are re-exported from the design system so existing
// imports of '../utils/colors' keep working. The promotion/relegation *rule*
// below is football-domain knowledge and stays in the app.
import { STATUS_COLORS } from '@fm2k/design-system';
import type { StatusColors } from '@fm2k/design-system';
import { leagueZone } from '@fm2k/engine';

export { STATUS_COLORS, STATUS_COLORS_DARK, getContrastColor, useStatusColors } from '@fm2k/design-system';
export type { StatusColors, StatusVariant } from '@fm2k/design-system';

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
