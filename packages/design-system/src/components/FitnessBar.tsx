import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function fitnessColor(fitness: number): string {
  if (fitness >= 95) {return '#00cc44';}
  if (fitness >= 85) {return '#44aa22';}
  if (fitness >= 70) {return '#e8d000';}
  if (fitness >= 55) {return '#dd8800';}
  if (fitness >= 40) {return '#cc2200';}
  return '#881030';
}

/** A fixed-width bar that fills/drains with a value from 0–100, colored by fitness level. */
export function FitnessBar({ fitness }: { fitness: number }) {
  const color = fitnessColor(fitness);
  return (
    <Box sx={{ position: 'relative', width: 56, height: 18, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, width: `${fitness}%`, bgcolor: color }} />
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          color: '#fff',
          textShadow: '0 0 2px rgba(0,0,0,0.8)',
          lineHeight: 1,
        }}
      >
        {Math.round(fitness)}
      </Typography>
    </Box>
  );
}
