import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import type { ClubPlayer } from '@fm2k/engine';
import FitnessBar from './FitnessBar';

interface Props { player: Pick<ClubPlayer, 'injury' | 'suspension' | 'fitness'> }

export default function PlayerStatusChip({ player }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <FitnessBar fitness={player.fitness} />
      {player.injury && <Chip label={`Injured ${player.injury.matchesRemaining}md`} size="small" color="error" />}
      {!player.injury && player.suspension && <Chip label={`Susp. ${player.suspension.matchesRemaining}md`} size="small" color="warning" />}
    </Box>
  );
}
