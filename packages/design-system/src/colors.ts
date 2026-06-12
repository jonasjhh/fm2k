import { useTheme } from '@mui/material/styles';

/** Semantic status background tokens (light mode). */
export const STATUS_COLORS = {
  playerTeam: '#BBDEFB',
  promotion:  '#C8E6C9',
  relegation: '#FFCDD2',
  caution:    '#FFF9C4',
} as const;

/** Semantic status background tokens (dark mode). */
export const STATUS_COLORS_DARK = {
  playerTeam: 'rgba(33, 150, 243, 0.25)',
  promotion:  'rgba(76, 175, 80, 0.25)',
  relegation: 'rgba(244, 67, 54, 0.25)',
  caution:    'rgba(255, 193, 7, 0.25)',
} as const;

export type StatusVariant = keyof typeof STATUS_COLORS;
export type StatusColors = Record<StatusVariant, string>;

/** Choose readable text colour (black/white) for a hex background. */
export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#FFFFFF';
}

/** Mode-aware status colour tokens. */
export function useStatusColors(): StatusColors {
  const theme = useTheme();
  return theme.palette.mode === 'dark' ? STATUS_COLORS_DARK : STATUS_COLORS;
}
