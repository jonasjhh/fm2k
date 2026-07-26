import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { daysBetween, type ClubPlayer } from '@fm2k/engine';
import { FitnessBar } from '@fm2k/design-system';
import { useGameStore } from '@/store/game-store';

interface Props { player: Pick<ClubPlayer, 'injury' | 'suspension' | 'fitness'> }

export default function PlayerStatusChip({ player }: Props) {
  // Injuries clear on a date, so what the manager needs is the countdown to it — read from
  // the clock rather than stored, because it changes on every advance without the injury
  // itself changing at all. A suspension really is a number of matches, so it just prints.
  const now = useGameStore((s) => s.now);
  // daysBetween is fractional, so round up: any part of a day still to serve is a day out,
  // and a player mid-way through their last day should read "1d", never "0d".
  const daysOut = player.injury && now
    ? Math.max(0, Math.ceil(daysBetween(now, player.injury.returnDate)))
    : null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {/* ClubPlayer.fitness is 0-1000 internally (tenths of a point); FitnessBar displays 0-100. */}
      <FitnessBar fitness={player.fitness / 10} />
      {player.injury && (
        <Chip
          label={daysOut === null ? 'Injured' : `Injured ${daysOut}d`}
          size="small"
          color="error"
        />
      )}
      {!player.injury && player.suspension && <Chip label={`Susp. ${player.suspension.matchesRemaining}md`} size="small" color="warning" />}
    </Box>
  );
}
