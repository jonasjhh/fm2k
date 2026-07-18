import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

function tier(fitness: number): 'success' | 'warning' | 'error' {
  return fitness >= 85 ? 'success' : fitness >= 60 ? 'warning' : 'error';
}

/** A fixed-width bar that fills/drains with a value from 0–100, colored by how low
 *  it is (green ≥85, amber ≥60, red below), with the value written on top. */
export function FitnessBar({ fitness }: { fitness: number }) {
  return (
    <Box sx={{ position: 'relative', width: 56, height: 18 }}>
      <LinearProgress
        variant="determinate"
        value={fitness}
        color={tier(fitness)}
        sx={{ height: 18, borderRadius: 1 }}
      />
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
