import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { STATUS_COLORS, leagueRowBg } from '../../utils/colors';
import ScrollableTable from '../ui/ScrollableTable';

export default function TableTab() {
  const { leagueState, playerTeamId } = useGameStore(useShallow((s) => ({
    leagueState: s.leagueState,
    playerTeamId: s.playerTeamId,
  })));
  if (!leagueState) return null;

  const n = leagueState.standings.length;

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
        {leagueState.name} — {leagueState.season}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip size="small" sx={{ bgcolor: STATUS_COLORS.promotion }} label="Promotion" />
        <Chip size="small" sx={{ bgcolor: STATUS_COLORS.relegation }} label="Relegation" />
        <Chip size="small" sx={{ bgcolor: STATUS_COLORS.playerTeam }} label="Your club" />
      </Box>

      <ScrollableTable>
        <TableHead>
            <TableRow>
              <TableCell align="center">#</TableCell>
              <TableCell>Team</TableCell>
              <TableCell align="center">P</TableCell>
              <TableCell align="center">W</TableCell>
              <TableCell align="center">D</TableCell>
              <TableCell align="center">L</TableCell>
              <TableCell align="center">GF</TableCell>
              <TableCell align="center">GA</TableCell>
              <TableCell align="center">GD</TableCell>
              <TableCell align="center">Pts</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {leagueState.standings.map((s, i) => {
              const pos = i + 1;
              const isPlayer = s.teamId === playerTeamId;
              const bg = leagueRowBg(isPlayer, pos, n);
              const gd = s.goalDifference >= 0 ? `+${s.goalDifference}` : String(s.goalDifference);
              return (
                <TableRow key={s.teamId} sx={bg ? { bgcolor: bg } : {}}>
                  <TableCell align="center">{pos}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {s.teamName}
                      {isPlayer && <Chip label="You" size="small" color="primary" />}
                    </Box>
                  </TableCell>
                  <TableCell align="center">{s.played}</TableCell>
                  <TableCell align="center">{s.won}</TableCell>
                  <TableCell align="center">{s.drawn}</TableCell>
                  <TableCell align="center">{s.lost}</TableCell>
                  <TableCell align="center">{s.goalsFor}</TableCell>
                  <TableCell align="center">{s.goalsAgainst}</TableCell>
                  <TableCell align="center">{gd}</TableCell>
                  <TableCell align="center"><strong>{s.points}</strong></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
      </ScrollableTable>
    </Box>
  );
}
