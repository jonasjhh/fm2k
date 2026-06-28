import type { ClubPlayer, Player } from '@fm2k/engine';
import { playerValue } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { fmt } from '../../utils/formatting';
import { ATTR_GROUPS } from '../../lib/attribute-labels';
import PlayerStatusChip from './PlayerStatusChip';

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

/** A scouted player from another club is a plain `Player` — fitness/injury/suspension
 *  only exist on the manager's own `ClubPlayer` squad. */
type ViewablePlayer = Player & Partial<Pick<ClubPlayer, 'fitness' | 'injury' | 'suspension'>>;

interface PlayerDetailModalProps {
  player: ViewablePlayer | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export default function PlayerDetailModal({ player, onClose, actions }: PlayerDetailModalProps) {
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
              {(player.fitness !== undefined
                ? [{ label: 'Fitness', value: `${Math.round(player.fitness / 10)}%` }, { label: 'Value', value: `£${fmt(value)}` }]
                : [{ label: 'Value', value: `£${fmt(value)}` }]
              ).map(({ label, value: val }, i, arr) => (
                <Grid size={12 / arr.length} key={label} sx={{ textAlign: 'center', py: 1.5, borderRight: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                </Grid>
              ))}
            </Grid>

            {/* Status */}
            {player.fitness !== undefined && (player.injury ?? player.suspension) && (
              <Box sx={{ px: 2.5, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <PlayerStatusChip player={{ ...player, fitness: player.fitness }} />
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
