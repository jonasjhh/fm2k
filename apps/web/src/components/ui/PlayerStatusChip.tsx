import Chip from '@mui/material/Chip';
import type { ClubPlayer } from '@fm2k/engine';

interface Props { player: Pick<ClubPlayer, 'injury' | 'suspension'> }

export default function PlayerStatusChip({ player }: Props) {
  if (player.injury)     {return <Chip label={`Injured ${player.injury.matchesRemaining}md`} size="small" color="error" />;}
  if (player.suspension) {return <Chip label={`Susp. ${player.suspension.matchesRemaining}md`} size="small" color="warning" />;}
  return <Chip label="Fit" size="small" color="success" variant="outlined" />;
}
