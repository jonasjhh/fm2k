import React, { useState, useMemo, useCallback } from 'react';
import type { StadiumSectorConfig } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Alert from '@mui/material/Alert';
import { useTheme } from '@mui/material/styles';
import {
  type SectorKey,
  SECTOR_KEYS,
  SECTOR_LABELS,
  SECTOR_NAMES,
  STAND_TYPES,
  LOCATION_MULT,
  getSectorCapacity,
  calculateTotalCapacity,
  calculateSectorChangeCost,
  calculateTotalChangeCost,
  hasSectorChanged,
} from '../utils/stadium';
import { fmt } from '../utils/formatting';
import StadiumScene from './stadium/StadiumScene';
import type { PitchPattern } from './stadium/Pitch';

function isCorner(key: SectorKey) {
  return ['NE', 'SE', 'SW', 'NW'].includes(key);
}

interface Props {
  clubName: string
  committedSectors: Record<string, StadiumSectorConfig>
  budget: number
  onApply: (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number) => boolean
}

export default function StadiumPlanner({ clubName, committedSectors, budget, onApply }: Props) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  // Planning state — starts as copy of committed; discarded on reset
  const [plannedSectors, setPlannedSectors] = useState<Record<string, StadiumSectorConfig>>(
    () => Object.fromEntries(Object.entries(committedSectors).map(([k, v]) => [k, { ...v }])),
  );

  // Cosmetic state (not persisted — local only)
  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [stadiumName, setStadiumName] = useState(`${clubName} Stadium`);
  const [activeSector, setActiveSector] = useState<SectorKey>('N');
  const [pitchPattern, setPitchPattern] = useState<PitchPattern>('checkerboard');

  // ── Derived values ──────────────────────────────────────────────────────────

  const changedKeys = useMemo(
    () => SECTOR_KEYS.filter(k => hasSectorChanged(committedSectors[k] ?? { type: 'none', densityValue: 30 }, plannedSectors[k] ?? { type: 'none', densityValue: 30 })),
    [committedSectors, plannedSectors],
  );

  const totalCost = useMemo(
    () => calculateTotalChangeCost(committedSectors, plannedSectors),
    [committedSectors, plannedSectors],
  );

  const plannedCapacity = useMemo(() => calculateTotalCapacity(plannedSectors), [plannedSectors]);
  const committedCapacity = useMemo(() => calculateTotalCapacity(committedSectors), [committedSectors]);

  const hasChanges = changedKeys.length > 0;
  const canAfford = budget >= totalCost;
  const canApply = hasChanges && canAfford;

  const activeSectorData = useMemo(
    () => plannedSectors[activeSector] ?? { type: 'none', densityValue: 30 },
    [plannedSectors, activeSector],
  );
  const uiDensity = 60 - activeSectorData.densityValue;
  const activeCap = getSectorCapacity(activeSector, activeSectorData);
  const densityLabel = activeSectorData.type === 'none' ? 'N/A'
    : uiDensity > 35 ? 'High Density' : uiDensity > 20 ? 'Standard Rows' : 'Sparse Bleachers';

  // Per-sector cost for the currently active sector (shown in detail panel)
  const activeSectorCost = useMemo(() => {
    const from = committedSectors[activeSector] ?? { type: 'none', densityValue: 30 };
    return calculateSectorChangeCost(activeSector, from, activeSectorData);
  }, [committedSectors, activeSector, activeSectorData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSectorSelect = useCallback((e: SelectChangeEvent) => setActiveSector(e.target.value as SectorKey), []);
  const handleSectorClick = useCallback((key: SectorKey) => setActiveSector(key), []);

  const handleStandType = useCallback((e: SelectChangeEvent) => {
    setPlannedSectors(prev => ({
      ...prev,
      [activeSector]: { ...(prev[activeSector] ?? { type: 'none', densityValue: 30 }), type: e.target.value },
    }));
  }, [activeSector]);

  const handleDensity = useCallback((_: Event, val: number | number[]) => {
    setPlannedSectors(prev => ({
      ...prev,
      [activeSector]: { ...(prev[activeSector] ?? { type: 'none', densityValue: 30 }), densityValue: 60 - (val as number) },
    }));
  }, [activeSector]);

  const handleApply = useCallback(() => {
    if (!canApply) { return; }
    const ok = onApply(plannedSectors, totalCost, plannedCapacity);
    if (!ok) { alert('Insufficient budget.'); }
  }, [canApply, onApply, plannedSectors, totalCost, plannedCapacity]);

  const handleDiscard = useCallback(() => {
    setPlannedSectors(Object.fromEntries(Object.entries(committedSectors).map(([k, v]) => [k, { ...v }])));
  }, [committedSectors]);

  // ── Colours ─────────────────────────────────────────────────────────────────

  const panelBg = isDark ? 'rgba(15,23,42,0.6)' : 'rgba(248,250,252,0.6)';
  const subPanelBg = isDark ? 'rgba(15,23,42,0.5)' : 'rgba(241,245,249,0.8)';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {hasChanges ? (
        <Box sx={{
          bgcolor: canAfford ? 'success.main' : 'error.main',
          borderRadius: 2, px: 2.5, py: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2 }}>
              Renovation Cost — {changedKeys.length} sector{changedKeys.length > 1 ? 's' : ''} changed
            </Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>
              £{fmt(totalCost)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
              Budget after: £{fmt(budget - totalCost)}
              {' · '}Capacity: {committedCapacity.toLocaleString()} → {plannedCapacity.toLocaleString()}
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
            <Button variant="outlined" size="small" onClick={handleDiscard}
              sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
              Discard
            </Button>
            <Button variant="contained" size="small" disabled={!canApply} onClick={handleApply}
              sx={{
                bgcolor: '#fff', color: canAfford ? 'success.dark' : 'error.dark',
                fontWeight: 700,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.5)' },
              }}>
              {canAfford ? 'Apply Design' : 'Cannot Afford'}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
          Capacity: <strong>{committedCapacity.toLocaleString()} seats</strong>
          {' · '}Edit any sector to design a renovation.
        </Alert>
      )}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, minHeight: 500 }}>

        {/* ── Controls Panel ── */}
        <Box sx={{
          flex: { xs: '0 0 auto', lg: '0 0 340px' },
          bgcolor: panelBg,
          border: '1px solid', borderColor: 'divider',
          borderRadius: 2, p: 2.5,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>

          {/* Sector selector */}
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1.5 }}>
              Stand Selector
            </Typography>
            <FormControl fullWidth size="small" sx={{ mt: 0.5 }}>
              <Select value={activeSector} onChange={handleSectorSelect}>
                {SECTOR_KEYS.map(k => (
                  <MenuItem key={k} value={k}>
                    {SECTOR_LABELS[k]}
                    {changedKeys.includes(k) && (
                      <Chip label="edited" size="small" color="warning" variant="outlined"
                        sx={{ ml: 1, height: 16, fontSize: '0.6rem' }} />
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Active sector detail */}
          <Box sx={{ bgcolor: subPanelBg, borderRadius: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                {SECTOR_NAMES[activeSector]}
              </Typography>
              <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
                {changedKeys.includes(activeSector) && (
                  <Chip label={`£${fmt(activeSectorCost)}`} size="small" color="warning" variant="outlined"
                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
                )}
                <Chip
                  label={activeSectorData.type === 'none' ? '0 seats' : `${activeCap.toLocaleString()} seats`}
                  size="small" color={activeSectorData.type === 'none' ? 'default' : 'primary'} variant="outlined"
                  sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                />
              </Stack>
            </Stack>

            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', mb: 1, display: 'block' }}>
              Location multiplier: ×{LOCATION_MULT[activeSector]}
              {isCorner(activeSector) ? ' (corner — cheapest)' : LOCATION_MULT[activeSector] < 1.5 ? ' (short side)' : ' (long side — most expensive)'}
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <InputLabel sx={{ fontSize: '0.7rem' }}>Structural Tier Template</InputLabel>
              <Select label="Structural Tier Template" value={activeSectorData.type} onChange={handleStandType}>
                {Object.entries(STAND_TYPES).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Seating Density</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{densityLabel}</Typography>
              </Stack>
              <Slider size="small" min={10} max={50} value={uiDensity}
                onChange={handleDensity} disabled={activeSectorData.type === 'none'} />
            </Box>
          </Box>

          <Divider />

          {/* Checkerboard colors */}
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1.5 }}>
              Seat Palette
            </Typography>
            <Stack direction="row" sx={{ gap: 2, mt: 1, bgcolor: subPanelBg, borderRadius: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider' }}>
              {[
                { label: 'Seat Color A', value: primaryColor, set: setPrimaryColor },
                { label: 'Seat Color B', value: secondaryColor, set: setSecondaryColor },
              ].map(({ label, value, set }) => (
                <Box key={label} sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{label}</Typography>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Box component="input" type="color" value={value}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)}
                      sx={{ width: 32, height: 32, border: '2px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer', p: 0, background: 'none' }} />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{value.toUpperCase()}</Typography>
                  </Stack>
                </Box>
              ))}
            </Stack>
            <TextField fullWidth size="small" label="Arena Name" value={stadiumName}
              onChange={e => setStadiumName(e.target.value)} sx={{ mt: 1.5 }} />
          </Box>

          <Divider />

          {/* Pitch pattern */}
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1.5 }}>
              Pitch Turf Pattern
            </Typography>
            <ToggleButtonGroup value={pitchPattern} exclusive
              onChange={(_, v) => v && setPitchPattern(v)} size="small" fullWidth sx={{ mt: 0.5 }}>
              <ToggleButton value="checkerboard" sx={{ fontSize: '0.7rem', textTransform: 'none' }}>Checkerboard</ToggleButton>
              <ToggleButton value="horizontal-stripes" sx={{ fontSize: '0.7rem', textTransform: 'none' }}>H. Stripes</ToggleButton>
              <ToggleButton value="vertical-stripes" sx={{ fontSize: '0.7rem', textTransform: 'none' }}>V. Stripes</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {/* ── Viewport + Cost Panel ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Stadium visual */}
          <Box sx={{
            flex: 1,
            bgcolor: isDark ? 'rgba(15,23,42,0.4)' : 'rgba(241,245,249,0.4)',
            border: '1px solid', borderColor: 'divider',
            borderRadius: 2, p: 2.5,
            display: 'flex', flexDirection: 'column', minHeight: 460, overflow: 'hidden',
          }}>
            {/* Header */}
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                  {stadiumName.toUpperCase()}
                </Typography>
              </Box>
              <Box sx={{
                textAlign: 'right', bgcolor: subPanelBg, borderRadius: 1.5, px: 2, py: 1,
                border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${primary}`,
              }}>
                <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary', letterSpacing: 1.5, display: 'block' }}>
                  {hasChanges ? 'Planned Capacity' : 'Total Capacity'}
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 900, color: 'success.main' }}>
                  {plannedCapacity.toLocaleString()}
                </Typography>
              </Box>
            </Stack>

            {/* 3D viewport */}
            <StadiumScene
              sectors={plannedSectors}
              activeSector={activeSector}
              pendingKeys={changedKeys}
              colorA={primaryColor}
              colorB={secondaryColor}
              pitchPattern={pitchPattern}
              onSelectSector={handleSectorClick}
            />
          </Box>
        </Box>
      </Box>
    </>
  );
}
