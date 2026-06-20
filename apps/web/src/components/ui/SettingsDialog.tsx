import { useContext } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import { useTheme } from '@mui/material/styles';
import { useShallow } from 'zustand/react/shallow';
import { ColorModeContext } from '../../App';
import { useGameStore, SIM_DELAY_MIN, SIM_DELAY_MAX } from '@/store/game-store';

interface Props { open: boolean; onClose: () => void; }

const SPEED_MARKS = [
  { value: SIM_DELAY_MIN, label: 'Fast' },
  { value: SIM_DELAY_MAX, label: 'Slow' },
];

export default function SettingsDialog({ open, onClose }: Props) {
  const theme = useTheme();
  const { toggle } = useContext(ColorModeContext);
  const { simDelayMs, setSimDelay } = useGameStore(useShallow((s) => ({
    simDelayMs: s.simDelayMs,
    setSimDelay: s.setSimDelay,
  })));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <FormControlLabel
          control={<Switch checked={theme.palette.mode === 'dark'} onChange={toggle} />}
          label="Dark mode"
        />

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Match tick delay</Typography>
            <Typography variant="body2" color="text.secondary">{simDelayMs} ms</Typography>
          </Box>
          <Box sx={{ px: 2 }}>
            <Slider
              value={simDelayMs}
              min={SIM_DELAY_MIN}
              max={SIM_DELAY_MAX}
              step={10}
              marks={SPEED_MARKS}
              track="inverted"
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} ms`}
              onChange={(_, v) => setSimDelay(v as number)}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Delay between match events while watching — lower is faster.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
