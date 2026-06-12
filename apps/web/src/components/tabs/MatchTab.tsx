import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FastForwardIcon from '@mui/icons-material/FastForward';
import { useGameStore, findTeamById } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { sfx, fmtDate } from '../../utils/formatting';
import { getTeamOVR, recentForm } from '@fm2k/engine';

function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const color = result === 'W' ? 'success' : result === 'D' ? 'warning' : 'error';
  return <Chip label={result} size="small" color={color} sx={{ minWidth: 32, fontWeight: 700 }} />;
}

export default function MatchTab() {
  const { leagueState, playerTeamId, editableCountries, seasonComplete, lastMatchResult, simulateMatchday, playMatch, simulateToEnd } = useGameStore(useShallow((s) => ({
    leagueState: s.leagueState,
    playerTeamId: s.playerTeamId,
    editableCountries: s.editableCountries,
    seasonComplete: s.seasonComplete,
    lastMatchResult: s.lastMatchResult,
    simulateMatchday: s.simulateMatchday,
    playMatch: s.playMatch,
    simulateToEnd: s.simulateToEnd,
  })));

  if (!leagueState) {return null;}

  if (seasonComplete) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>The season is complete!</Typography>
        <Typography variant="body2">Check the Table tab for final standings.</Typography>
      </Alert>
    );
  }

  const scheduled = leagueState.fixtures.filter((f) => f.status === 'scheduled');
  if (!scheduled.length) {return <Alert severity="info">No upcoming fixtures.</Alert>;}

  const nextMd = scheduled.reduce((min, f) => Math.min(min, f.matchday), scheduled[0].matchday);
  const fixture = leagueState.fixtures.find(
    (f) => f.matchday === nextMd && (f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId),
  );
  if (!fixture) {return <Alert severity="info">No upcoming fixtures for your club.</Alert>;}

  const isHome = fixture.homeTeamId === playerTeamId;
  const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
  const opponentName = isHome ? fixture.awayTeamName : fixture.homeTeamName;

  const standings = leagueState.standings;
  const oppEntry = standings.find((s) => s.teamId === opponentId);
  const myEntry = standings.find((s) => s.teamId === playerTeamId);
  const oppPos = standings.findIndex((s) => s.teamId === opponentId) + 1;
  const myPos = standings.findIndex((s) => s.teamId === playerTeamId) + 1;
  const oppTeam = findTeamById(editableCountries, opponentId);
  const oppOvr = oppTeam ? getTeamOVR(oppTeam.starters) : '—';

  const formBadges = (teamId: string) =>
    recentForm(leagueState.fixtures, teamId).map((r, i) => (
      <FormBadge key={`${teamId}-${i}`} result={r} />
    ));

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="caption" color="text.secondary">
            Matchday {fixture.matchday} · {fmtDate(fixture.scheduledTime)} · {isHome ? 'Home' : 'Away'}
          </Typography>
          <Typography variant="h5" sx={{ my: 1, fontWeight: 700 }}>
            {fixture.homeTeamName} vs {fixture.awayTeamName}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<FlashOnIcon />} onClick={() => simulateMatchday()}>
              Simulate
            </Button>
            <Button variant="contained" color="secondary" startIcon={<PlayArrowIcon />} onClick={() => playMatch()}>
              Play Match
            </Button>
            <Button
              variant="outlined"
              startIcon={<FastForwardIcon />}
              onClick={() => { if (confirm('Simulate all remaining matches?')) {simulateToEnd();} }}
            >
              Sim. Season
            </Button>
          </Box>
        </CardContent>
      </Card>

      {lastMatchResult && (() => {
        const hs = lastMatchResult.homeScore;
        const as = lastMatchResult.awayScore;
        const hName = standings.find((s) => s.teamId === lastMatchResult.homeTeamId)?.teamName ?? '';
        const aName = standings.find((s) => s.teamId === lastMatchResult.awayTeamId)?.teamName ?? '';
        const won = lastMatchResult.isHome ? hs > as : as > hs;
        const drew = hs === as;
        return (
          <Alert severity={won ? 'success' : drew ? 'warning' : 'error'} sx={{ mb: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {won ? 'WIN' : drew ? 'DRAW' : 'LOSS'} — {hName} {hs}–{as} {aName}
            </Typography>
          </Alert>
        );
      })()}

      <Grid container spacing={2}>
        {[
          {
            title: opponentName,
            pos: oppPos, entry: oppEntry, ovr: oppOvr,
            formation: oppTeam?.formation ?? '—', teamId: opponentId,
            venue: isHome ? 'Away side' : 'Home side',
          },
          {
            title: myEntry?.teamName ?? '',
            pos: myPos, entry: myEntry, ovr: null,
            formation: null, teamId: playerTeamId ?? '',
            venue: isHome ? 'Home advantage!' : 'Away day',
          },
        ].map(({ title, pos, entry, ovr, formation, teamId, venue }) => (
          <Grid size={{ xs: 12, sm: 6 }} key={teamId}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {pos}{sfx(pos)} place · {entry?.won ?? 0}W {entry?.drawn ?? 0}D {entry?.lost ?? 0}L
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {entry?.goalsFor ?? 0} scored, {entry?.goalsAgainst ?? 0} conceded
                </Typography>
                {ovr !== null && (
                  <Typography variant="body2" color="text.secondary">
                    {formation} · Avg OVR {ovr}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">{venue}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                  {formBadges(teamId)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
