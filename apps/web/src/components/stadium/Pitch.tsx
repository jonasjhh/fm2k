import React from 'react';
import Box from '@mui/material/Box';

export type PitchPattern = 'checkerboard' | 'horizontal-stripes' | 'vertical-stripes';

interface Props {
  pattern: PitchPattern
}

/** Flat pitch at ground level, centered in the 760×600 world plane. */
export default function Pitch({ pattern }: Props) {
  return (
    <Box sx={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) translateZ(1px)',
      width: '58%', height: '48%', bgcolor: '#475569', borderRadius: '12px', padding: '8px',
      boxShadow: '0 15px 30px rgba(0,0,0,0.75), inset 0 0 25px rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2.5px solid #334155',
    }}>
      <Box sx={{
        width: '100%', height: '100%', bgcolor: '#2e7d32', position: 'relative',
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3)',
        border: '1.5px solid rgba(255,255,255,0.85)', overflow: 'hidden', borderRadius: '2px',
        ...(pattern === 'checkerboard' && { backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.05) 50%, transparent 50%), linear-gradient(rgba(255,255,255,0.05) 50%, transparent 50%)', backgroundSize: '30px 30px' }),
        ...(pattern === 'horizontal-stripes' && { backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 14px, transparent 14px, transparent 28px)' }),
        ...(pattern === 'vertical-stripes' && { backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 18px, transparent 18px, transparent 36px)' }),
      }}>
        <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1.5px', bgcolor: 'rgba(255,255,255,0.8)', transform: 'translateX(-50%)' }} />
        <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 70, height: 70, border: '1.5px solid rgba(255,255,255,0.8)', borderRadius: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%' }} />
        </Box>
        <Box sx={{ position: 'absolute', top: '50%', left: 0, width: 58, height: 120, border: '1.5px solid rgba(255,255,255,0.8)', borderLeft: 'none', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', right: 0, width: 58, height: 120, border: '1.5px solid rgba(255,255,255,0.8)', borderRight: 'none', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: 0, width: 20, height: 54, border: '1.5px solid rgba(255,255,255,0.8)', borderLeft: 'none', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', right: 0, width: 20, height: 54, border: '1.5px solid rgba(255,255,255,0.8)', borderRight: 'none', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: 39, width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', right: 39, width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%', transform: 'translateY(-50%)' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: 7, width: 64, height: 64, border: '1.5px solid rgba(255,255,255,0.8)', borderRadius: '50%', transform: 'translateY(-50%)', clipPath: 'inset(0 0 0 51px)' }} />
        <Box sx={{ position: 'absolute', top: '50%', right: 7, width: 64, height: 64, border: '1.5px solid rgba(255,255,255,0.8)', borderRadius: '50%', transform: 'translateY(-50%)', clipPath: 'inset(0 51px 0 0)' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: -8, width: 8, height: 32, bgcolor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', borderRight: 'none', transform: 'translateY(-50%)', zIndex: 12 }} />
        <Box sx={{ position: 'absolute', top: '50%', right: -8, width: 8, height: 32, bgcolor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', borderLeft: 'none', transform: 'translateY(-50%)', zIndex: 12 }} />
        {[{ top: -4, left: -4 }, { top: -4, right: -4 }, { bottom: -4, left: -4 }, { bottom: -4, right: -4 }].map((c, i) => (
          <Box key={i} sx={{ position: 'absolute', width: 8, height: 8, border: '1px solid rgba(255,255,255,0.8)', borderRadius: '50%', ...c }} />
        ))}
      </Box>
    </Box>
  );
}
