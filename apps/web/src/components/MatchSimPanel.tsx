import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ArticleIcon from '@mui/icons-material/Article';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useConfirm } from '@fm2k/design-system';
import MatchStatsSheet from './MatchStatsSheet';
import { buildResolvePlayer } from '../utils/resolvePlayer';

/** The slim inline match card on the Match tab. It only launches things: Play/Simulate
 *  open the near-fullscreen MatchOverlay (the actual match centre); once the fixture is
 *  completed it offers Next match / the report. Hidden entirely while the overlay is up. */
export default function MatchSimPanel() {
  const {
    focusFixture, focusLive, matchOverlayOpen, clubState, editableCountries,
    lastMatchStatistics,
    advanceMatch, skipMatch, goToNextMatch, simulateToEnd, openMatchOverlay,
  } = useGameStore(useShallow((s) => ({
    focusFixture: s.focusFixture,
    focusLive: s.focusLive,
    matchOverlayOpen: s.matchOverlayOpen,
    clubState: s.clubState,
    editableCountries: s.editableCountries,
    lastMatchStatistics: s.lastMatchStatistics,
    advanceMatch: s.advanceMatch,
    skipMatch: s.skipMatch,
    goToNextMatch: s.goToNextMatch,
    simulateToEnd: s.simulateToEnd,
    openMatchOverlay: s.openMatchOverlay,
  })));

  const resolvePlayer = buildResolvePlayer(focusFixture, clubState, editableCountries);

  const confirm = useConfirm();
  const confirmSimSeason = async () => {
    if (await confirm({ title: 'Simulate season', message: 'Simulate all remaining matches?', confirmLabel: 'Simulate' })) {
      simulateToEnd();
    }
  };

  if (!focusFixture) { return null; }
  // The overlay owns the match while it's up — no duplicate controls behind it.
  if (matchOverlayOpen) { return null; }

  const completed = focusFixture.status === 'completed';

  const xiIncomplete = !!clubState && clubState.startingXI.some(id => id === null);
  const xiSuspended = !!clubState
    && clubState.startingXI.some(id => clubState.squad.find(p => p.id === id)?.suspension);
  const xiInjured = !!clubState
    && clubState.startingXI.some(id => clubState.squad.find(p => p.id === id)?.injury);
  const xiBlocked = xiSuspended || xiInjured || xiIncomplete;

  const pens = focusFixture.result?.decidedBy === 'penalties' && focusFixture.result.shootout
    ? ` (${focusFixture.result.shootout.home}–${focusFixture.result.shootout.away} pens)` : '';

  return (
    <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden' }}>
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {completed ? (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Full time: {focusFixture.homeTeamName} {focusFixture.result?.homeScore ?? 0} – {focusFixture.result?.awayScore ?? 0} {focusFixture.awayTeamName}{pens}
              </Typography>
              <Typography variant="body2" color="text.secondary">Open the report for stats and analysis.</Typography>
            </>
          ) : focusLive ? (
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Match in progress</Typography>
          ) : (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Ready for kick-off</Typography>
              <Typography variant="body2" color="text.secondary">Play to watch it live, or simulate to skip ahead.</Typography>
            </>
          )}
        </Box>

        {completed ? (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="outlined" size="small" startIcon={<ArticleIcon />} onClick={openMatchOverlay}>
              Match report
            </Button>
            <Button variant="contained" color="success" size="small" startIcon={<SkipNextIcon />} onClick={goToNextMatch}>
              Next match
            </Button>
            <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />} onClick={confirmSimSeason}>
              Sim. Season
            </Button>
          </Box>
        ) : focusLive ? (
          // A live match with the overlay closed shouldn't normally happen, but never
          // strand the user: give them the way back in.
          <Button variant="contained" color="secondary" size="small" startIcon={<PlayArrowIcon />} onClick={openMatchOverlay}>
            Return to match
          </Button>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="contained" color="secondary" size="small" startIcon={<PlayArrowIcon />}
              disabled={xiBlocked} onClick={advanceMatch}>
              Play Match
            </Button>
            <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />}
              disabled={xiBlocked} onClick={skipMatch}>
              Simulate
            </Button>
            <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />}
              disabled={xiBlocked} onClick={confirmSimSeason}>
              Sim. Season
            </Button>
          </Box>
        )}
      </Box>

      {xiBlocked && !focusLive && !completed && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          {xiIncomplete
            ? 'Your starting XI is incomplete. Fill all 11 slots in the Tactics tab before playing.'
            : xiSuspended
              ? 'Your starting XI includes a suspended player. Fix your lineup in the Tactics tab before playing.'
              : 'Your starting XI includes an injured player. Fix your lineup in the Tactics tab before playing.'}
        </Alert>
      )}

      {completed && lastMatchStatistics && (
        <>
          <Divider />
          <MatchStatsSheet
            statistics={lastMatchStatistics}
            homeName={focusFixture.homeTeamName}
            awayName={focusFixture.awayTeamName}
            title="Match stats"
            resolvePlayer={resolvePlayer}
            defaultShowRatings
          />
        </>
      )}
    </Paper>
  );
}
