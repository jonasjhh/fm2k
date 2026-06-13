import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { TOTAL_MATCHDAYS } from '../constants';
import { sfx, fmtDate } from '../utils/formatting';

interface StatsBarProps {
  clubColors?: { primary: string; secondary: string };
  textColor?: string;
}

export default function StatsBar({ clubColors, textColor }: StatsBarProps) {
  const { clubState, leagueState, playerTeamId, seasonComplete } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    leagueState: s.leagueState,
    playerTeamId: s.playerTeamId,
    seasonComplete: s.seasonComplete,
  })));

  if (!clubState || !leagueState) {return null;}

  const standings = leagueState.standings;
  const pos = standings.findIndex((s) => s.teamId === playerTeamId) + 1;
  const entry = standings.find((s) => s.teamId === playerTeamId);

  const nextFixture = leagueState.fixtures.find(
    (f) => f.status === 'scheduled' && (f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId),
  );

  // Total league rounds = double round-robin over the teams in this division.
  const totalRounds = standings.length > 1 ? (standings.length - 1) * 2 : TOTAL_MATCHDAYS;
  // Show the matchday currently being played (the next scheduled fixture), or the
  // final round once the season is over.
  const displayMatchday = nextFixture?.matchday ?? totalRounds;

  const bg = clubColors?.primary ?? 'primary.dark';
  const fg = textColor ?? 'primary.contrastText';

  return (
    <Box
      sx={{
        bgcolor: bg,
        color: fg,
        px: 2,
        py: 0.75,
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        alignItems: 'center',
        borderBottom: clubColors ? `1px solid ${clubColors.secondary}30` : undefined,
        opacity: 0.9,
      }}
    >
      {[
        { label: 'Budget', value: `£${Math.round(clubState.budget).toLocaleString()}` },
        { label: 'Position', value: `${pos}${sfx(pos)}` },
        { label: 'Points', value: String(entry?.points ?? 0) },
        { label: 'Matchday', value: `${displayMatchday}/${totalRounds}` },
      ].map(({ label, value }) => (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" sx={{ opacity: 0.65, color: 'inherit' }}>{label}:</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>{value}</Typography>
        </Box>
      ))}
      <Box sx={{ ml: 'auto' }}>
        {seasonComplete ? (
          <Chip label="Season Over" size="small" color="warning" />
        ) : nextFixture ? (
          <Typography variant="caption" sx={{ opacity: 0.75, color: 'inherit' }}>
            Next: {fmtDate(nextFixture.scheduledTime)}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
