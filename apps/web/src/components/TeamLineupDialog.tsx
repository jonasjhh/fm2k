'use client';
import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CloseIcon from '@mui/icons-material/Close';
import { FORMATION_LINES, buildXISlotAssignments, getTeamOVR, MAX_BENCH_SIZE } from '@fm2k/engine';
import type { Player } from '@fm2k/engine';
import { getContrastColor } from '@fm2k/design-system';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, findTeamById } from '@/store/game-store';
import { FormationGrid } from './ui/FormationGrid';
import ScoutedPlayerModal from './ui/ScoutedPlayerModal';
import TeamSquadDialog from './TeamSquadDialog';

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
  const [clickedPlayerId, setClickedPlayerId] = useState<string | null>(null);
  const [showFullSquad, setShowFullSquad] = useState(false);

  // Reset transient view state whenever the dialog is closed/reassigned to a different team.
  useEffect(() => {
    if (!teamId) { setClickedPlayerId(null); setShowFullSquad(false); }
  }, [teamId]);

  // For the player's own club show their selected formation + starting XI;
  // for everyone else show the auto-selected best XI.
  const ownClub = team && teamId === playerTeamId ? clubState : null;
  const isPlayerTeam = ownClub !== null;
  const squad: Player[] = ownClub ? ownClub.squad : team?.squad ?? [];
  const formation = ownClub ? ownClub.formation : team?.formation ?? '4-4-2';
  const lines = FORMATION_LINES[formation];
  // ownClub.startingXI is itself slot-ordered (and hole-preserving) — no need to re-derive it.
  const slotAssignments = ownClub
    ? [...ownClub.startingXI, ...ownClub.benchPlayers.slice(0, MAX_BENCH_SIZE)]
    : buildXISlotAssignments(squad, formation);

  const xi = slotAssignments.slice(0, 11)
    .map(id => (id ? squad.find(p => p.id === id) : undefined))
    .filter((p): p is Player => p !== undefined);

  return (
    <>
      <Dialog open={team !== null && !showFullSquad} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
        {team && (
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
              <FormationGrid
                lines={lines}
                slotAssignments={slotAssignments}
                squad={squad}
                teamColors={team.colors}
                shape={ownClub?.shapes?.defending ?? null}
                onPlayerClick={setClickedPlayerId}
              />
              {!isPlayerTeam && (
                <Button size="small" sx={{ mt: 2 }} onClick={() => setShowFullSquad(true)}>
                  View full squad
                </Button>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      {team && (
        <ScoutedPlayerModal
          squad={squad}
          playerId={clickedPlayerId}
          onClose={() => setClickedPlayerId(null)}
          teamId={team.id}
          isOwnTeam={isPlayerTeam}
        />
      )}

      {team && !isPlayerTeam && (
        <TeamSquadDialog teamId={showFullSquad ? team.id : null} onClose={() => setShowFullSquad(false)} />
      )}
    </>
  );
}
