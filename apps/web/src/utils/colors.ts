import { useTheme } from '@mui/material/styles';

export const STATUS_COLORS = {
  playerTeam: '#BBDEFB',
  promotion:  '#C8E6C9',
  relegation: '#FFCDD2',
  caution:    '#FFF9C4',
} as const;

export const STATUS_COLORS_DARK = {
  playerTeam: 'rgba(33, 150, 243, 0.25)',
  promotion:  'rgba(76, 175, 80, 0.25)',
  relegation: 'rgba(244, 67, 54, 0.25)',
  caution:    'rgba(255, 193, 7, 0.25)',
} as const;

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#FFFFFF';
}

export function useStatusColors() {
  const theme = useTheme();
  return theme.palette.mode === 'dark' ? STATUS_COLORS_DARK : STATUS_COLORS;
}

export function leagueRowBg(
  isPlayer: boolean,
  pos: number,
  total: number,
  colors: typeof STATUS_COLORS | typeof STATUS_COLORS_DARK = STATUS_COLORS,
): string | undefined {
  if (isPlayer) return colors.playerTeam;
  if (pos <= 3) return colors.promotion;
  if (pos >= total - 1) return colors.relegation;
  return undefined;
}
