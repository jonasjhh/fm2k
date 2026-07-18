import Chip from '@mui/material/Chip';

/** A single win/draw/loss result chip, for recent-form strips next to fixtures and tables. */
export function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const color = result === 'W' ? 'success' : result === 'D' ? 'warning' : 'error';
  return <Chip label={result} size="small" color={color} sx={{ minWidth: 32, fontWeight: 700 }} />;
}
