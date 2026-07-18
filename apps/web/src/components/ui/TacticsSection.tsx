import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Grid from '@mui/material/Grid';
import type { TacticalStyleId, TacticalSliders } from '@fm2k/engine';
import { STYLE_TENDENCIES, TACTICAL_STYLE_IDS } from '@fm2k/engine';

const SLIDER_DEFS: { key: keyof TacticalSliders; label: string; left: string; right: string }[] = [
  { key: 'tempo', label: 'Tempo', left: 'Slow', right: 'Frantic' },
  { key: 'risk', label: 'Passing risk', left: 'Safe', right: 'Ambitious' },
  { key: 'defensiveLine', label: 'Defensive line', left: 'Deep', right: 'High' },
  { key: 'pressIntensity', label: 'Press intensity', left: 'Passive', right: 'Aggressive' },
];

export default function TacticsSection({
  style, sliders, onStyle, onSliders, disabled = false,
}: {
  style: TacticalStyleId;
  sliders: TacticalSliders;
  onStyle: (s: TacticalStyleId) => void;
  onSliders: (s: Partial<TacticalSliders>) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(sliders);
  useEffect(() => { setLocal(sliders); }, [sliders]);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5, mb: 2, opacity: disabled ? 0.6 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          Style
        </Typography>
        {disabled && (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            locked during match
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
        {TACTICAL_STYLE_IDS.map((id) => {
          const t = STYLE_TENDENCIES[id];
          return (
            <Tooltip key={id} title={`${t.blurb} — Weakness: ${t.weakness}`} arrow>
              <span>
                <Button
                  variant={style === id ? 'contained' : 'outlined'}
                  onClick={() => onStyle(id)}
                  disabled={disabled}
                  sx={{ px: 1.5, py: 0.5, fontSize: 12, fontWeight: 700, textTransform: 'none' }}
                >
                  {t.label}
                </Button>
              </span>
            </Tooltip>
          );
        })}
      </Box>

      <Grid container spacing={2}>
        {SLIDER_DEFS.map(({ key, label, left, right }) => (
          <Grid size={{ xs: 12, sm: 4 }} key={key}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{label}</Typography>
            <Slider
              value={local[key]}
              min={0}
              max={100}
              size="small"
              valueLabelDisplay="auto"
              disabled={disabled}
              onChange={(_, v) => setLocal((p) => ({ ...p, [key]: v as number }))}
              onChangeCommitted={(_, v) => onSliders({ [key]: v as number })}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">{left}</Typography>
              <Typography variant="caption" color="text.secondary">{right}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
