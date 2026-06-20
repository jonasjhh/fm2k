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

type PitchPattern = 'checkerboard' | 'horizontal-stripes' | 'vertical-stripes';

function isCorner(key: SectorKey) {
  return ['NE', 'SE', 'SW', 'NW'].includes(key);
}

// ─── SVG sector renderer ──────────────────────────────────────────────────────

function generateSectorSvg(key: SectorKey, sector: StadiumSectorConfig, colorA: string, colorB: string): string {
  if (sector.type === 'none') { return ''; }

  const width = key === 'N' || key === 'S' ? 440 : 160;
  const height = key === 'E' || key === 'W' ? 280 : 160;
  const isCorn = isCorner(key);
  const step = sector.densityValue;
  const isRoofed = ['covered-grandstand', 'executive-suite', 'double-tier', 'triple-tier', 'kop'].includes(sector.type);
  const roofDepth = 45;

  function gridSeats(yMin: number, yMax: number, xMin: number, xMax: number, inv = false): string {
    let dots = '', col = 0;
    for (let x = xMin + 6; x < xMax - 6; x += step) {
      let row = 0;
      for (let y = yMin + 6; y < yMax - 6; y += step) {
        const pick = (col + row) % 2 === 0;
        dots += `<circle cx="${x}" cy="${y}" r="2" fill="${inv ? (pick ? colorB : colorA) : (pick ? colorA : colorB)}" stroke="rgba(0,0,0,0.15)" stroke-width="0.3"/>`;
        row++;
      }
      col++;
    }
    return dots;
  }

  function radialSeats(rMin: number, rMax: number): string {
    let dots = '';
    const cx = key === 'NW' || key === 'SW' ? 160 : 0;
    const cy = key === 'NW' || key === 'NE' ? 160 : 0;
    let startAng = Math.PI;
    if (key === 'NE') { startAng = 1.5 * Math.PI; }
    if (key === 'SW') { startAng = 0.5 * Math.PI; }
    if (key === 'SE') { startAng = 0; }
    let ring = 0;
    for (let r = rMin + 6; r < rMax - 6; r += step) {
      const count = Math.max(4, Math.floor(((2 * Math.PI * r) / 4) / step));
      for (let s = 0; s < count; s++) {
        const ang = startAng + (s / (count - 1 || 1)) * (Math.PI / 2);
        dots += `<circle cx="${cx + r * Math.cos(ang)}" cy="${cy + r * Math.sin(ang)}" r="2" fill="${(ring + s) % 2 === 0 ? colorA : colorB}"/>`;
      }
      ring++;
    }
    return dots;
  }

  let svg = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#334155;">`;

  if (sector.type === 'double-tier') {
    if (!isCorn) {
      const mid = (key === 'N' || key === 'S') ? height / 2 : width / 2;
      if (key === 'N' || key === 'S') {
        svg += gridSeats(8, mid - 6, 0, width);
        svg += `<rect x="0" y="${mid - 4}" width="${width}" height="8" fill="#1e293b" stroke="#0f172a"/>`;
        svg += gridSeats(mid + 6, height - 8, 0, width, true);
      } else {
        svg += gridSeats(0, height, 8, mid - 6);
        svg += `<rect x="${mid - 4}" y="0" width="8" height="${height}" fill="#1e293b" stroke="#0f172a"/>`;
        svg += gridSeats(0, height, mid + 6, width - 8, true);
      }
    } else {
      svg += radialSeats(15, 85);
      const cx = key === 'NW' || key === 'SW' ? 160 : 0, cy = key === 'NW' || key === 'NE' ? 160 : 0;
      svg += `<circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="#1e293b" stroke-width="8"/>`;
      svg += radialSeats(98, 155);
    }
  } else if (sector.type === 'triple-tier') {
    if (!isCorn) {
      const chunk = (key === 'N' || key === 'S') ? height / 3 : width / 3;
      if (key === 'N' || key === 'S') {
        svg += gridSeats(6, chunk - 4, 0, width);
        svg += `<rect x="0" y="${chunk - 4}" width="${width}" height="6" fill="#0f172a"/>`;
        svg += gridSeats(chunk + 4, chunk * 2 - 4, 0, width, true);
        svg += `<rect x="0" y="${chunk * 2 - 4}" width="${width}" height="6" fill="#0f172a"/>`;
        svg += gridSeats(chunk * 2 + 4, height - 6, 0, width);
      } else {
        svg += gridSeats(0, height, 6, chunk - 4);
        svg += `<rect x="${chunk - 4}" y="0" width="6" height="${height}" fill="#0f172a"/>`;
        svg += gridSeats(0, height, chunk + 4, chunk * 2 - 4, true);
        svg += `<rect x="${chunk * 2 - 4}" y="0" width="6" height="${height}" fill="#0f172a"/>`;
        svg += gridSeats(0, height, chunk * 2 + 4, width - 6);
      }
    } else {
      svg += radialSeats(12, 60); svg += radialSeats(68, 110); svg += radialSeats(118, 155);
    }
  } else if (sector.type === 'executive-suite') {
    if (!isCorn) {
      const mid = (key === 'N' || key === 'S') ? height / 2 : width / 2;
      if (key === 'N' || key === 'S') {
        svg += gridSeats(6, mid - 12, 0, width);
        svg += `<rect x="0" y="${mid - 10}" width="${width}" height="20" fill="#1e1b4b" stroke="#eab308" stroke-width="1.5"/>`;
        for (let p = 15; p < width; p += 35) { svg += `<rect x="${p}" y="${mid - 6}" width="14" height="12" fill="#f59e0b" rx="1"/>`; }
        svg += gridSeats(mid + 12, height - 6, 0, width, true);
      } else {
        svg += gridSeats(0, height, 6, mid - 12);
        svg += `<rect x="${mid - 10}" y="0" width="20" height="${height}" fill="#1e1b4b" stroke="#eab308" stroke-width="1.5"/>`;
        for (let p = 15; p < height; p += 35) { svg += `<rect x="${mid - 6}" y="${p}" width="12" height="14" fill="#f59e0b" rx="1"/>`; }
        svg += gridSeats(0, height, mid + 12, width - 6, true);
      }
    } else {
      svg += radialSeats(15, 75);
      const cx = key === 'NW' || key === 'SW' ? 160 : 0, cy = key === 'NW' || key === 'NE' ? 160 : 0;
      svg += `<circle cx="${cx}" cy="${cy}" r="90" fill="none" stroke="#eab308" stroke-width="14"/>`;
      svg += radialSeats(102, 155);
    }
  } else {
    if (!isCorn) { svg += gridSeats(0, height, 0, width); }
    else { svg += radialSeats(10, 155); }
  }

  const ec = '#94a6b8';
  if (!isCorn) {
    if (key === 'N') { svg += `<line x1="0" y1="2" x2="${width}" y2="2" stroke="${ec}" stroke-width="4"/>`; }
    if (key === 'S') { svg += `<line x1="0" y1="${height - 2}" x2="${width}" y2="${height - 2}" stroke="${ec}" stroke-width="4"/>`; }
    if (key === 'W') { svg += `<line x1="2" y1="0" x2="2" y2="${height}" stroke="${ec}" stroke-width="4"/>`; }
    if (key === 'E') { svg += `<line x1="${width - 2}" y1="0" x2="${width - 2}" y2="${height}" stroke="${ec}" stroke-width="4"/>`; }
  } else {
    const cx = key === 'NW' || key === 'SW' ? 160 : 0, cy = key === 'NW' || key === 'NE' ? 160 : 0;
    svg += `<circle cx="${cx}" cy="${cy}" r="158" fill="none" stroke="${ec}" stroke-width="4"/>`;
  }

  if (isRoofed) {
    if (!isCorn) {
      if (key === 'N') { svg += `<rect x="0" y="0" width="${width}" height="${roofDepth}" fill="rgba(241,245,249,0.9)" stroke="#475569" stroke-width="2"/>`; }
      if (key === 'S') { svg += `<rect x="0" y="${height - roofDepth}" width="${width}" height="${roofDepth}" fill="rgba(241,245,249,0.9)" stroke="#475569" stroke-width="2"/>`; }
      if (key === 'W') { svg += `<rect x="0" y="0" width="${roofDepth}" height="${height}" fill="rgba(241,245,249,0.9)" stroke="#475569" stroke-width="2"/>`; }
      if (key === 'E') { svg += `<rect x="${width - roofDepth}" y="0" width="${roofDepth}" height="${height}" fill="rgba(241,245,249,0.9)" stroke="#475569" stroke-width="2"/>`; }
    } else {
      const cx = key === 'NW' || key === 'SW' ? 160 : 0, cy = key === 'NW' || key === 'NE' ? 160 : 0;
      svg += `<circle cx="${cx}" cy="${cy}" r="160" fill="none" stroke="rgba(241,245,249,0.9)" stroke-width="${roofDepth}"/>`;
    }
  }

  return svg + '</svg>';
}

// ─── Sector absolute positions ────────────────────────────────────────────────

const SECTOR_POS: Record<SectorKey, React.CSSProperties> = {
  N: { position: 'absolute', top: 0, left: 160, width: 440, height: 160, zIndex: 20 },
  S: { position: 'absolute', bottom: 0, left: 160, width: 440, height: 160, zIndex: 20 },
  W: { position: 'absolute', top: 160, left: 0, width: 160, height: 280, zIndex: 20 },
  E: { position: 'absolute', top: 160, right: 0, width: 160, height: 280, zIndex: 20 },
  NW: { position: 'absolute', top: 0, left: 0, width: 160, height: 160, zIndex: 10 },
  NE: { position: 'absolute', top: 0, right: 0, width: 160, height: 160, zIndex: 10 },
  SW: { position: 'absolute', bottom: 0, left: 0, width: 160, height: 160, zIndex: 10 },
  SE: { position: 'absolute', bottom: 0, right: 0, width: 160, height: 160, zIndex: 10 },
};

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [tilt, setTilt] = useState(35);
  const [rotate, setRotate] = useState(-20);
  const [zoom, setZoom] = useState(0.95);

  // ── Derived values ──────────────────────────────────────────────────────────

  const sectorSvgs = useMemo(() => {
    const svgs: Record<string, string> = {};
    SECTOR_KEYS.forEach(k => { svgs[k] = generateSectorSvg(k, plannedSectors[k] ?? { type: 'none', densityValue: 30 }, primaryColor, secondaryColor); });
    return svgs;
  }, [primaryColor, secondaryColor, plannedSectors]);

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
          <TextField fullWidth size="small" label="Arena Nameplate" value={stadiumName}
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

        <Divider />

        {/* Camera controls */}
        <Box>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 1.5 }}>
              3D Camera Orbit
            </Typography>
            <Button size="small" variant="text" onClick={() => { setTilt(35); setRotate(-20); setZoom(0.95); }}
              sx={{ fontSize: '0.7rem', py: 0, minHeight: 0 }}>Reset</Button>
          </Stack>
          <Stack sx={{ gap: 1 }}>
            {[
              { label: 'Tilt Angle (X)', val: `${tilt}°`, min: 5, max: 65, step: 1, value: tilt, set: setTilt },
              { label: 'Orbit Rotation (Z)', val: `${rotate}°`, min: -180, max: 180, step: 1, value: rotate, set: setRotate },
              { label: 'Zoom Scale', val: `${zoom.toFixed(2)}×`, min: 0.5, max: 1.5, step: 0.05, value: zoom, set: setZoom },
            ].map(({ label, val, min, max, step, value, set }) => (
              <Box key={label}>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{val}</Typography>
                </Stack>
                <Slider size="small" min={min} max={max} step={step} value={value}
                  onChange={(_, v) => set(v as number)} />
              </Box>
            ))}
          </Stack>
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
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: '1500px', overflow: 'hidden' }}>
            <Box sx={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(${tilt}deg) rotateZ(${rotate}deg) scale(${zoom})`,
              transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
            }}>
              <Box sx={{ width: 760, height: 600, position: 'relative', background: 'transparent' }}>
                <Box sx={{ width: '100%', height: '100%', borderRadius: '196px', position: 'relative', overflow: 'hidden', background: 'transparent' }}>

                  {SECTOR_KEYS.map(key => {
                    const sector = plannedSectors[key] ?? { type: 'none', densityValue: 30 };
                    const isEmpty = sector.type === 'none';
                    const isActive = key === activeSector;
                    const isPending = changedKeys.includes(key);
                    return (
                      <Box key={key}
                        onClick={() => handleSectorClick(key)}
                        dangerouslySetInnerHTML={isEmpty ? undefined : { __html: sectorSvgs[key] ?? '' }}
                        sx={{
                          ...SECTOR_POS[key],
                          cursor: 'pointer', overflow: 'hidden',
                          transition: 'outline 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease',
                          background: isEmpty ? 'transparent' : undefined,
                          border: isEmpty ? '2px dashed' : 'none',
                          borderColor: isEmpty ? (isPending ? 'warning.main' : 'divider') : undefined,
                          outline: isActive
                            ? `3px solid ${primary}`
                            : isPending ? '2px dashed #f59e0b' : 'none',
                          outlineOffset: isActive ? '-3px' : '-2px',
                          boxShadow: isActive ? `0 0 25px ${primary}60` : 'none',
                          '&:hover': {
                            filter: 'brightness(1.1) contrast(1.05)',
                            zIndex: `${(SECTOR_POS[key].zIndex as number) + 10} !important`,
                          },
                        }}
                      />
                    );
                  })}

                  {/* Pitch */}
                  <Box sx={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: '58%', height: '48%', bgcolor: '#475569', borderRadius: '12px', padding: '8px',
                    boxShadow: '0 15px 30px rgba(0,0,0,0.75), inset 0 0 25px rgba(0,0,0,0.8)',
                    zIndex: 25, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2.5px solid #334155',
                  }}>
                    <Box sx={{
                      width: '100%', height: '100%', bgcolor: '#2e7d32', position: 'relative',
                      boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3)',
                      border: '1.5px solid rgba(255,255,255,0.85)', overflow: 'hidden', borderRadius: '2px',
                      ...(pitchPattern === 'checkerboard' && { backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.05) 50%, transparent 50%), linear-gradient(rgba(255,255,255,0.05) 50%, transparent 50%)', backgroundSize: '30px 30px' }),
                      ...(pitchPattern === 'horizontal-stripes' && { backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 14px, transparent 14px, transparent 28px)' }),
                      ...(pitchPattern === 'vertical-stripes' && { backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 18px, transparent 18px, transparent 36px)' }),
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

                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
    </>
  );
}
