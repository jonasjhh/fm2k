import type { ClubPlayer, RegimentId } from '@fm2k/engine';
import { playerValue, REGIMENT_IDS, REGIMENT_LABELS, DEFAULT_REGIMENT } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useGameStore } from '../../store/game-store';
import { fmt } from '../../utils/formatting';
import PlayerStatusChip from './PlayerStatusChip';

// ─── shared attribute config ──────────────────────────────────────────────────

export const ATTR_GROUPS = [
  {
    label: 'Physical',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'stamina', label: 'Stamina' },
    ],
  },
  {
    label: 'Technical',
    attrs: [
      { key: 'passing', label: 'Passing' },
      { key: 'finishing', label: 'Finishing' },
      { key: 'technique', label: 'Technique' },
      { key: 'defending', label: 'Defending' },
    ],
  },
  {
    label: 'Mental',
    attrs: [
      { key: 'awareness', label: 'Awareness' },
      { key: 'composure', label: 'Composure' },
    ],
  },
] as const;

export function AttrBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'success.main' : value >= 65 ? 'warning.main' : 'error.light';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ width: 76, color: 'text.secondary', flexShrink: 0 }}>
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

// ─── modal ────────────────────────────────────────────────────────────────────

interface PlayerDetailModalProps {
  player: ClubPlayer | null;
  onClose: () => void;
  showTraining?: boolean;
  actions?: React.ReactNode;
}

export default function PlayerDetailModal({ player, onClose, showTraining, actions }: PlayerDetailModalProps) {
  const setTraining = useGameStore((s) => s.setTraining);
  const value = player ? playerValue(player) : 0;

  return (
    <Dialog
      open={player !== null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      {player && (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {player.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                <Chip label={player.position} size="small" variant="outlined" />
                <Chip label={player.nationality} size="small" variant="outlined" />
                <Chip label={`Age ${player.age}`} size="small" variant="outlined" />
              </Box>
            </Box>
            <IconButton
              aria-label="close"
              onClick={onClose}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ p: 0 }}>
            {/* Stats grid */}
            <Grid container sx={{ borderBottom: 1, borderColor: 'divider' }}>
              {[
                { label: 'Fitness', value: `${player.fitness}%` },
                { label: 'Value',   value: `£${fmt(value)}` },
              ].map(({ label, value: val }) => (
                <Grid size={6} key={label} sx={{ textAlign: 'center', py: 1.5, borderRight: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                </Grid>
              ))}
            </Grid>

            {/* Status */}
            {(player.injury ?? player.suspension) && (
              <Box sx={{ px: 2.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <PlayerStatusChip player={player} />
              </Box>
            )}

            {/* Training */}
            {showTraining && (
              <Box sx={{ px: 2.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Training</Typography>
                <Select
                  size="small"
                  fullWidth
                  value={player.training ?? DEFAULT_REGIMENT}
                  onChange={(e) => setTraining(player.id, e.target.value as RegimentId)}
                  sx={{ '& .MuiSelect-select': { py: 0.5 } }}
                >
                  {REGIMENT_IDS.map((id) => (
                    <MenuItem key={id} value={id}>{REGIMENT_LABELS[id]}</MenuItem>
                  ))}
                </Select>
              </Box>
            )}

            {/* Attributes */}
            <Box sx={{ px: 2.5, py: 2 }}>
              {ATTR_GROUPS.map((group, gi) => (
                <Box key={group.label} sx={gi > 0 ? { mt: 1.5 } : {}}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                    {group.label}
                  </Typography>
                  {group.attrs.map(({ key, label }) => (
                    <AttrBar key={key} label={label} value={player.attributes[key]} />
                  ))}
                  {gi < ATTR_GROUPS.length - 1 && <Divider sx={{ mt: 1 }} />}
                </Box>
              ))}
            </Box>
          </DialogContent>

          {actions && (
            <DialogActions sx={{ p: 2 }}>
              {actions}
            </DialogActions>
          )}
        </>
      )}
    </Dialog>
  );
}
