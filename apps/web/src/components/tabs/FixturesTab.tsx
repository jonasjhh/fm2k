import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { fmtDate } from '../../utils/formatting';
import { STATUS_COLORS } from '../../utils/colors';
import SectionHeader from '../ui/SectionHeader';
import ScrollableTable from '../ui/ScrollableTable';

export default function FixturesTab() {
  const { leagueState, playerTeamId, showAllFixtures, toggleFixtureView } = useGameStore(useShallow((s) => ({
    leagueState: s.leagueState,
    playerTeamId: s.playerTeamId,
    showAllFixtures: s.showAllFixtures,
    toggleFixtureView: s.toggleFixtureView,
  })));
  if (!leagueState) return null;

  const all = leagueState.fixtures;
  const mine = all.filter((f) => f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId);
  const src = showAllFixtures ? all : mine;

  const upcoming = src.filter((f) => f.status === 'scheduled').sort((a, b) => a.matchday - b.matchday).slice(0, 20);
  const results  = src.filter((f) => f.status === 'completed').sort((a, b) => b.matchday - a.matchday).slice(0, 20);

  const isMine = (f: (typeof all)[0]) => f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId;

  return (
    <Box>
      <SectionHeader
        title="Fixtures & Results"
        action={
          <Button variant="outlined" size="small" onClick={toggleFixtureView}>
            {showAllFixtures ? 'My Fixtures Only' : 'Show All Fixtures'}
          </Button>
        }
      />

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Upcoming</Typography>
      <ScrollableTable sx={{ mb: 3 }}>
        <TableHead>
          <TableRow>
            <TableCell align="center">MD</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Home</TableCell>
            <TableCell>Away</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {upcoming.length ? upcoming.map((f) => (
            <TableRow key={f.id} sx={isMine(f) ? { bgcolor: STATUS_COLORS.playerTeam } : {}}>
              <TableCell align="center">{f.matchday}</TableCell>
              <TableCell>{fmtDate(f.scheduledTime)}</TableCell>
              <TableCell>{f.homeTeamName}</TableCell>
              <TableCell>{f.awayTeamName}</TableCell>
            </TableRow>
          )) : (
            <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>No upcoming fixtures</TableCell></TableRow>
          )}
        </TableBody>
      </ScrollableTable>

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Results</Typography>
      <ScrollableTable>
        <TableHead>
          <TableRow>
            <TableCell align="center">MD</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Home</TableCell>
            <TableCell align="center">Score</TableCell>
            <TableCell>Away</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {results.length ? results.map((f) => (
            <TableRow key={f.id} sx={isMine(f) ? { bgcolor: STATUS_COLORS.playerTeam } : {}}>
              <TableCell align="center">{f.matchday}</TableCell>
              <TableCell>{fmtDate(f.scheduledTime)}</TableCell>
              <TableCell>{f.homeTeamName}</TableCell>
              <TableCell align="center">
                <Chip label={`${f.result?.homeScore}–${f.result?.awayScore}`} size="small" />
              </TableCell>
              <TableCell>{f.awayTeamName}</TableCell>
            </TableRow>
          )) : (
            <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>No results yet</TableCell></TableRow>
          )}
        </TableBody>
      </ScrollableTable>
    </Box>
  );
}
