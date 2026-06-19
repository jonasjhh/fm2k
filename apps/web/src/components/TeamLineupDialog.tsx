'use client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CloseIcon from '@mui/icons-material/Close';
import { FORMATION_LINES, buildXISlotAssignments, buildSlotAssignments, getTeamOVR } from '@fm2k/engine';
import type { Player } from '@fm2k/engine';
import { getContrastColor } from '@fm2k/design-system';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, findTeamById } from '../store/game-store';
import { FormationGrid } from './ui/FormationGrid';

interface Props {
  teamId: string | null;
  onClose: () => void;
}

export default function TeamLineupDialog({ teamId, onClose }: Props) {
  const { editableCountries, clubState, playerTeamId } = useGameStore(useShallow(s => ({
    editableCountries: s.editableCountries,
    clubState: s.clubState,
    playerTeamId: s.playerTeamId,
  })));
  const team = teamId ? findTeamById(editableCountries, teamId) : null;

  return (
    <Dialog open={team !== null} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      {team && (() => {
        // For the player's own club show their selected formation + starting XI;
        // for everyone else show the auto-selected best XI.
        const isPlayerTeam = teamId === playerTeamId && clubState !== null;
        const squad: Player[] = isPlayerTeam ? clubState.squad : team.squad;
        const formation = isPlayerTeam ? clubState.formation : team.formation;
        const lines = FORMATION_LINES[formation];
        const slotAssignments = isPlayerTeam
          ? buildSlotAssignments(clubState.startingXI, clubState.benchPlayers, clubState.squad, clubState.formation)
          : buildXISlotAssignments(squad, formation);

        const xi = slotAssignments.slice(0, 11)
          .map(id => (id ? squad.find(p => p.id === id) : undefined))
          .filter((p): p is Player => p !== undefined);

        return (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: team.colors.primary, border: '2px solid', borderColor: team.colors.secondary, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>{team.name}</Typography>
                <Typography variant="caption" color="text.secondary">Starting XI</Typography>
              </Box>
              <Chip
                size="small"
                label={formation}
                sx={{ bgcolor: team.colors.primary, color: getContrastColor(team.colors.primary), fontWeight: 700 }}
              />
              <Chip size="small" variant="outlined" label={`OVR ${getTeamOVR(xi)}`} />
              <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 3 }}>
              <FormationGrid lines={lines} slotAssignments={slotAssignments} squad={squad} teamColors={team.colors} />
            </DialogContent>
          </>
        );
      })()}
    </Dialog>
  );
}
