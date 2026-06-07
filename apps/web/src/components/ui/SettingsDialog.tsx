import { useContext } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme } from '@mui/material/styles';
import { ColorModeContext } from '../../App';

interface Props { open: boolean; onClose: () => void; }

export default function SettingsDialog({ open, onClose }: Props) {
  const theme = useTheme();
  const { toggle } = useContext(ColorModeContext);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={<Switch checked={theme.palette.mode === 'dark'} onChange={toggle} />}
          label="Dark mode"
        />
      </DialogContent>
    </Dialog>
  );
}
