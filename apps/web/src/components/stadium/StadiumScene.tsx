import React from 'react';
import type { StadiumSectorConfig } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { SECTOR_KEYS, type SectorKey } from '../../utils/stadium';
import { WORLD_W, WORLD_H } from './geometry';
import { useOrbitCamera } from './useOrbitCamera';
import Stand3D, { type StandColors } from './Stand3D';
import Pitch, { type PitchPattern } from './Pitch';

const EMPTY_SECTOR: StadiumSectorConfig = { type: 'none', densityValue: 30 };

interface Props {
  sectors: Record<string, StadiumSectorConfig>
  activeSector: SectorKey
  pendingKeys: SectorKey[]
  colorA: string
  colorB: string
  pitchPattern: PitchPattern
  onSelectSector: (key: SectorKey) => void
}

/**
 * The 3D viewport: a perspective camera over a preserve-3d world holding the
 * pitch and 8 extruded stands. Drag orbits, shift/right-drag pans, wheel zooms;
 * camera writes bypass React entirely (see useOrbitCamera).
 */
export default function StadiumScene({ sectors, activeSector, pendingKeys, colorA, colorB, pitchPattern, onSelectSector }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { viewportRef, worldRef, reset, suppressClickRef } = useOrbitCamera();

  const colors: StandColors = {
    structure: isDark ? theme.palette.grey[800] : theme.palette.grey[400],
    roof: isDark ? theme.palette.grey[400] : theme.palette.grey[100],
    trim: theme.palette.warning.main,
    primary: theme.palette.primary.main,
    pending: theme.palette.warning.main,
    emptyBorder: theme.palette.divider,
  };

  return (
    <Box
      ref={viewportRef}
      onClickCapture={e => { if (suppressClickRef.current) { e.stopPropagation(); } }}
      sx={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        userSelect: 'none',
        minHeight: 380,
      }}
    >
      <Box sx={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        perspective: '1400px', perspectiveOrigin: '50% 40%',
      }}>
        <div
          ref={worldRef}
          style={{
            width: WORLD_W,
            height: WORLD_H,
            position: 'relative',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            flex: '0 0 auto',
          }}
        >
          {/* ground shadow grounding the whole bowl */}
          <div style={{
            position: 'absolute', inset: -30,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 60%, transparent 78%)',
            transform: 'translateZ(-1px)',
            pointerEvents: 'none',
          }} />

          {SECTOR_KEYS.map(key => (
            <Stand3D
              key={key}
              sectorKey={key}
              sector={sectors[key] ?? EMPTY_SECTOR}
              colorA={colorA}
              colorB={colorB}
              isActive={key === activeSector}
              isPending={pendingKeys.includes(key)}
              colors={colors}
              onSelect={onSelectSector}
            />
          ))}

          <Pitch pattern={pitchPattern} />
        </div>
      </Box>

      {/* camera overlay */}
      <Box sx={{
        position: 'absolute', bottom: 8, right: 8,
        display: 'flex', alignItems: 'center', gap: 1.5,
        pointerEvents: 'none',
      }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
          drag to orbit · shift-drag to pan · scroll to zoom
        </Typography>
        <Button size="small" variant="outlined" onClick={reset} sx={{ pointerEvents: 'auto', fontSize: '0.7rem', py: 0, minHeight: 0 }}>
          Reset View
        </Button>
      </Box>
    </Box>
  );
}
