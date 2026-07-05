import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useGameStore, findTeamById, MAX_PAUSES_PER_MATCH } from '@/store/game-store';
import type { SimEvent } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useStatusColors } from '../utils/colors';
import SubstitutionPanel from './SubstitutionPanel';
import MatchInsightCards from './MatchInsightCards';
import MatchStatsSheet from './MatchStatsSheet';
import type { RatedPlayerInfo } from './MatchStatsSheet';
import { FORMATION_LINES, effectiveRole } from '@fm2k/engine';
import type { FormationPosition } from '@fm2k/engine';

const PHASE_LABEL: Record<string, string> = {
  first_half: '1st half', half_time: 'Half time', second_half: '2nd half', full_time: 'Full time',
  extra_time_first: 'Extra time', extra_time_half: 'ET half time', extra_time_second: 'Extra time', extra_time_full: 'After extra time',
};

function EventItem({ event }: { event: SimEvent }) {
  const statusColors = useStatusColors();
  const color =
    event.type === 'goal'    ? statusColors.promotion  :
    event.type === 'penalty' ? statusColors.caution    :
    event.type === 'card'    ? statusColors.caution    :
    event.type === 'phase'   ? statusColors.playerTeam :
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
    focusFixture, focusLive, matchEvents, isStreaming, pauseRequested, pausesUsed, lastPauseReason,
    streamHome, streamAway, streamMinute, lastMatchInsights, lastMatchStatistics, halfTimeInsights,
    editableCountries, clubState, advanceMatch, pauseMatch, skipMatch, goToNextMatch, simulateToEnd,
  } = useGameStore(useShallow((s) => ({
    focusFixture: s.focusFixture,
    focusLive: s.focusLive,
    matchEvents: s.matchEvents,
    isStreaming: s.isStreaming,
    pauseRequested: s.pauseRequested,
    pausesUsed: s.pausesUsed,
    lastPauseReason: s.lastPauseReason,
    streamHome: s.streamHome,
    streamAway: s.streamAway,
    streamMinute: s.streamMinute,
    lastMatchInsights: s.lastMatchInsights,
    lastMatchStatistics: s.lastMatchStatistics,
    halfTimeInsights: s.halfTimeInsights,
    editableCountries: s.editableCountries,
    clubState: s.clubState,
    advanceMatch: s.advanceMatch,
    pauseMatch: s.pauseMatch,
    skipMatch: s.skipMatch,
    goToNextMatch: s.goToNextMatch,
    simulateToEnd: s.simulateToEnd,
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

  // Player identity for the ratings list: name, effective role and team colours.
  // Our own club resolves the role with individual instructions (e.g. RWB, not RB);
  // opponents (no instructions) fall back to their card position.
  const resolvePlayer = (playerId: string): RatedPlayerInfo | undefined => {
    const clubPlayer = clubState?.squad.find(p => p.id === playerId);
    if (clubState && clubPlayer) {
      const slotIdx = clubState.startingXI.indexOf(playerId);
      const templatePos = slotIdx >= 0 ? FORMATION_LINES[clubState.formation].flat()[slotIdx] : undefined;
      const position = templatePos
        ? effectiveRole(playerId, templatePos as FormationPosition, clubState.customSlots, clubState.emptySlotRoles?.[slotIdx]?.role)
        : clubPlayer.position;
      return { name: clubPlayer.name, position, colors: findTeamById(editableCountries, clubState.clubId)?.colors };
    }
    for (const teamId of [focusFixture.homeTeamId, focusFixture.awayTeamId]) {
      const team = findTeamById(editableCountries, teamId);
      const player = team?.squad.find(p => p.id === playerId);
      if (player) { return { name: player.name, position: player.position, colors: team?.colors }; }
    }
    return undefined;
  };

  const pausesLeft = Math.max(0, MAX_PAUSES_PER_MATCH - pausesUsed);
  const xiIncomplete = !!clubState && clubState.startingXI.some(id => id === null);
  const xiSuspended = !!clubState
    && clubState.startingXI.some(id => clubState.squad.find(p => p.id === id)?.suspension);
  const xiInjured = !!clubState
    && clubState.startingXI.some(id => clubState.squad.find(p => p.id === id)?.injury);
  const xiBlocked = xiSuspended || xiInjured || xiIncomplete;

  const controls = isStreaming ? (
    <Button variant="contained" color="secondary" size="small" startIcon={<PauseIcon />}
      disabled={pauseRequested || pausesLeft === 0} onClick={pauseMatch}>
      {pauseRequested ? 'Pausing…' : pausesLeft === 0 ? 'No pauses left' : `Pause (${pausesLeft} left)`}
    </Button>
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
        {atIntermission ? 'Continue' : 'Resume'}
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />} onClick={skipMatch}>
        Skip to full time
      </Button>
    </Box>
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
        disabled={xiBlocked}
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

      {xiBlocked && !live && !completed && (
        <Alert severity="warning" square sx={{ borderRadius: 0 }}>
          {xiIncomplete
            ? 'Your starting XI is incomplete. Fill all 11 slots in the Tactics tab before playing.'
            : xiSuspended
              ? 'Your starting XI includes a suspended player. Fix your lineup in the Tactics tab before playing.'
              : 'Your starting XI includes an injured player. Fix your lineup in the Tactics tab before playing.'}
        </Alert>
      )}

      {!isStreaming && live && lastPauseReason === 'red_card' && (
        <Alert severity="error" square sx={{ borderRadius: 0 }}>
          Red card! The match is paused — reorganise your side before playing on.
        </Alert>
      )}

      {/* While paused (any reason, incl. half time) the manager can make substitutions;
          tactics/formation can be changed in the sections below the panel. */}
      {!isStreaming && live && !completed && clubState && (
        <>
          <Divider />
          <SubstitutionPanel clubState={clubState} />
        </>
      )}

      {/* Half-time tactical read + stats so far (live, while paused). */}
      {!isStreaming && live && !completed && (
        <>
          {atIntermission && halfTimeInsights.length > 0 && (
            <>
              <Divider />
              <MatchInsightCards insights={halfTimeInsights} title="Half-time read" />
            </>
          )}
          <Divider />
          <MatchStatsSheet
            statistics={live.statistics}
            homeName={focusFixture.homeTeamName}
            awayName={focusFixture.awayTeamName}
            title={atIntermission ? 'First-half stats' : `Stats after ${live.minute}'`}
            resolvePlayer={resolvePlayer}
          />
        </>
      )}

      {/* Full-time readout: what the numbers say and what to take from it. */}
      {completed && lastMatchStatistics && (
        <>
          <Divider />
          <MatchStatsSheet
            statistics={lastMatchStatistics}
            homeName={focusFixture.homeTeamName}
            awayName={focusFixture.awayTeamName}
            title="Match stats"
            resolvePlayer={resolvePlayer}
          />
        </>
      )}
      {completed && lastMatchInsights.length > 0 && (
        <>
          <Divider />
          <MatchInsightCards insights={lastMatchInsights} title="Match analysis" />
        </>
      )}

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
