import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import type { ClubPlayer } from '@fm2k/engine';
import { FitnessBar } from '@fm2k/design-system';

interface Props { player: Pick<ClubPlayer, 'injury' | 'suspension' | 'fitness'> }

export default function PlayerStatusChip({ player }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {/* ClubPlayer.fitness is 0-1000 internally (tenths of a point); FitnessBar displays 0-100. */}
      <FitnessBar fitness={player.fitness / 10} />
      {player.injury && <Chip label={`Injured ${player.injury.matchesRemaining}md`} size="small" color="error" />}
      {!player.injury && player.suspension && <Chip label={`Susp. ${player.suspension.matchesRemaining}md`} size="small" color="warning" />}
    </Box>
  );
}
