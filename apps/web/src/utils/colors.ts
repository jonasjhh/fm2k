export const STATUS_COLORS = {
  playerTeam: '#BBDEFB',
  promotion:  '#C8E6C9',
  relegation: '#FFCDD2',
  caution:    '#FFF9C4',
} as const;

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#FFFFFF';
}

export function leagueRowBg(isPlayer: boolean, pos: number, total: number): string | undefined {
  if (isPlayer) return STATUS_COLORS.playerTeam;
  if (pos <= 3) return STATUS_COLORS.promotion;
  if (pos >= total - 1) return STATUS_COLORS.relegation;
  return undefined;
}
