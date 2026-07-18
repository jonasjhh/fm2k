import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  label: string;
  value: number;
  /** Division par (expected average attribute for this level). Defaults to 60 (D1). */
  par?: number;
}

function attrColor(value: number, par: number): string {
  const delta = value - par;
  if (delta >= 20)  return '#00cc44'; // well above par — bright green
  if (delta >= 10)  return '#44aa22'; // above par — green
  if (delta >= 0)   return '#e8d000'; // slightly above par — yellow
  if (delta >= -10) return '#dd8800'; // slightly below par — amber
  if (delta >= -20) return '#cc2200'; // below par — red
  return '#881030';                   // well below par — burgundy
}

export function AttrBar({ label, value, par = 60 }: Props) {
  const color = attrColor(value, par);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ width: 76, color: 'text.secondary', flexShrink: 0, textTransform: 'capitalize' }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${value}%`, bgcolor: color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" sx={{ width: 22, textAlign: 'right', fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
