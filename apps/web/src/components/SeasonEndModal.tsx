import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';

import { sfx } from '../utils/formatting';
import { leagueRowBg, useStatusColors } from '../utils/colors';

export default function SeasonEndModal() {
  const { seasonComplete, leagueState, playerTeamId, setScreen, startNewSeason } = useGameStore(useShallow((s) => ({
    seasonComplete: s.seasonComplete,
    leagueState: s.leagueState,
    playerTeamId: s.playerTeamId,
    setScreen: s.setScreen,
    startNewSeason: s.startNewSeason,
  })));

  const statusColors = useStatusColors();

  if (!seasonComplete || !leagueState || !playerTeamId) return null;

  const standings = leagueState.standings;
  const pos = standings.findIndex((s) => s.teamId === playerTeamId) + 1;
  const entry = standings.find((s) => s.teamId === playerTeamId);
  const n = standings.length;

  const verdict =
    pos === 1 ? '🏆 CHAMPIONS! You won the league!' :
    pos <= 3 ? `🥈 ${pos}${sfx(pos)} place — Great season!` :
    pos <= n - 3 ? `👍 ${pos}${sfx(pos)} place — Mid-table finish.` :
    `⚠️ ${pos}${sfx(pos)} place — Relegation zone!`;

  const severity = pos === 1 ? 'success' : pos <= 3 ? 'info' : pos >= n - 1 ? 'error' : 'warning';

  return (
    <Dialog open maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Season Complete!</DialogTitle>
      <DialogContent>
        <Alert severity={severity} sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{verdict}</Typography>
          {entry && (
            <Typography variant="body2">
              {entry.won}W {entry.drawn}D {entry.lost}L · {entry.goalsFor}–{entry.goalsAgainst} goals
            </Typography>
          )}
        </Alert>

        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Final Standings</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell align="center">#</TableCell>
              <TableCell>Team</TableCell>
              <TableCell align="center">P</TableCell>
              <TableCell align="center">W</TableCell>
              <TableCell align="center">D</TableCell>
              <TableCell align="center">L</TableCell>
              <TableCell align="center">GD</TableCell>
              <TableCell align="center">Pts</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {standings.map((s, i) => {
              const p = i + 1;
              const isPlayer = s.teamId === playerTeamId;
              const bg = leagueRowBg(isPlayer, p, n, statusColors);
              const gd = s.goalDifference >= 0 ? `+${s.goalDifference}` : String(s.goalDifference);
              return (
                <TableRow key={s.teamId} sx={bg ? { bgcolor: bg } : {}}>
                  <TableCell align="center">{p}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {s.teamName}
                      {isPlayer && <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>(You)</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell align="center">{s.played}</TableCell>
                  <TableCell align="center">{s.won}</TableCell>
                  <TableCell align="center">{s.drawn}</TableCell>
                  <TableCell align="center">{s.lost}</TableCell>
                  <TableCell align="center">{gd}</TableCell>
                  <TableCell align="center"><strong>{s.points}</strong></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button variant="outlined" onClick={() => setScreen('main-menu')}>
          Main Menu
        </Button>
        <Button variant="contained" onClick={startNewSeason}>
          New Season
        </Button>
      </DialogActions>
    </Dialog>
  );
}
