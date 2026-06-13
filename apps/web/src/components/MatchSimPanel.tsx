import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useGameStore } from '../store/game-store';
import type { SimEvent, SimSpeed } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useStatusColors } from '../utils/colors';

const PHASE_LABEL: Record<string, string> = {
  first_half: '1st half', half_time: 'Half time', second_half: '2nd half', full_time: 'Full time',
  extra_time_first: 'Extra time', extra_time_half: 'ET half time', extra_time_second: 'Extra time', extra_time_full: 'After extra time',
};

function EventItem({ event }: { event: SimEvent }) {
  const statusColors = useStatusColors();
  const color =
    event.type === 'goal'  ? statusColors.promotion  :
    event.type === 'card'  ? statusColors.caution    :
    event.type === 'phase' ? statusColors.playerTeam :
    undefined;
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5, px: 1, bgcolor: color, borderRadius: 1 }}>
      {event.minute && <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, pt: 0.2 }}>{event.minute}</Typography>}
      <Typography variant="body2">{event.text}</Typography>
    </Box>
  );
}

/** The match-centre panel: a live scoreboard, clock controls, and the event ticker. */
export default function MatchSimPanel() {
  const {
    focusFixture, focusLive, matchEvents, isStreaming, streamHome, streamAway, streamMinute,
    simSpeed, clubState, advanceMatch, skipMatch, goToNextMatch, simulateToEnd, setSimSpeed,
  } = useGameStore(useShallow((s) => ({
    focusFixture: s.focusFixture,
    focusLive: s.focusLive,
    matchEvents: s.matchEvents,
    isStreaming: s.isStreaming,
    streamHome: s.streamHome,
    streamAway: s.streamAway,
    streamMinute: s.streamMinute,
    simSpeed: s.simSpeed,
    clubState: s.clubState,
    advanceMatch: s.advanceMatch,
    skipMatch: s.skipMatch,
    goToNextMatch: s.goToNextMatch,
    simulateToEnd: s.simulateToEnd,
    setSimSpeed: s.setSimSpeed,
  })));

  if (!focusFixture) { return null; }

  const live = focusLive;
  const completed = focusFixture.status === 'completed';
  const atIntermission = !!live && (live.phase === 'half_time' || live.phase === 'extra_time_half');

  const home = isStreaming ? streamHome : (live?.homeScore ?? focusFixture.result?.homeScore ?? 0);
  const away = isStreaming ? streamAway : (live?.awayScore ?? focusFixture.result?.awayScore ?? 0);
  const minute = isStreaming ? streamMinute : (live?.minute ?? 0);

  const pens = focusFixture.result?.decidedBy === 'penalties' && focusFixture.result.shootout
    ? ` (${focusFixture.result.shootout.home}–${focusFixture.result.shootout.away} pens)` : '';
  const statusLine = isStreaming ? `${minute}'`
    : completed ? `Full time${pens}`
    : live ? `${minute}' · ${PHASE_LABEL[live.phase] ?? ''}`
    : 'Not started';

  const xiInvalid = !!clubState
    && clubState.startingXI.some(id => clubState.squad.find(p => p.id === id)?.suspension);

  const controls = isStreaming ? (
    <Button variant="contained" color="inherit" size="small" disabled>Playing…</Button>
  ) : completed ? (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button variant="contained" color="success" size="small" startIcon={<SkipNextIcon />} onClick={goToNextMatch}>
        Next match
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />}
        onClick={() => { if (confirm('Simulate all remaining matches?')) { simulateToEnd(); } }}>
        Sim. Season
      </Button>
    </Box>
  ) : live ? (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button variant="contained" color="secondary" size="small" startIcon={<PlayArrowIcon />} onClick={advanceMatch}>
        {atIntermission ? 'Continue' : 'Play on'}
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />} onClick={skipMatch}>
        Skip to full time
      </Button>
    </Box>
  ) : (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button variant="contained" color="secondary" size="small" startIcon={<PlayArrowIcon />}
        disabled={xiInvalid} onClick={advanceMatch}>
        Play Match
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />}
        disabled={xiInvalid} onClick={skipMatch}>
        Simulate
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />}
        disabled={xiInvalid}
        onClick={() => { if (confirm('Simulate all remaining matches?')) { simulateToEnd(); } }}>
        Sim. Season
      </Button>
    </Box>
  );

  return (
    <Paper variant="outlined" sx={{ mt: 3, overflow: 'hidden' }}>
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {focusFixture.homeTeamName} {home} – {away} {focusFixture.awayTeamName}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>{statusLine}</Typography>
        </Box>
        {controls}
      </Box>

      {xiInvalid && !live && !completed && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          Your starting XI includes a suspended player. Fix your lineup in the Tactics tab before playing.
        </Alert>
      )}

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75 }}>
        <Typography variant="caption" color="text.secondary">Speed</Typography>
        <ToggleButtonGroup
          size="small" exclusive value={simSpeed}
          onChange={(_, v: SimSpeed | null) => { if (v) { setSimSpeed(v); } }}
        >
          <ToggleButton value="normal">Normal</ToggleButton>
          <ToggleButton value="fast">Fast</ToggleButton>
          <ToggleButton value="instant">Instant</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />
      <Box sx={{ maxHeight: 320, overflowY: 'auto', p: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {matchEvents.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ p: 2 }}>
            {live ? 'Kick off…' : 'Press Play Match to watch it live, or Simulate to skip ahead.'}
          </Typography>
        ) : (
          matchEvents.map((e, i) => <EventItem key={`${e.minute}-${i}`} event={e} />)
        )}
      </Box>
    </Paper>
  );
}
