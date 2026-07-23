import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useGameStore, findTeamById, MAX_PAUSES_PER_MATCH } from '@/store/game-store';
import { awayDisplayColors } from '../../utils/colors';
import type { SimEvent } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useStatusColors } from '../../utils/colors';
import { useConfirm } from '@fm2k/design-system';
import SubstitutionPanel from '../SubstitutionPanel';
import MatchInsightCards from '../MatchInsightCards';
import MatchStatsSheet from '../MatchStatsSheet';
import TacticsSection from '../ui/TacticsSection';
import FormationSelector from '../ui/FormationSelector';
import { FormationGrid } from '../ui/FormationGrid';
import { effectiveFormationLabel, FORMATION_LINES } from '@fm2k/engine';
import { useClubColors } from '../../hooks/useClubColors';
import { buildResolvePlayer } from '../../utils/resolvePlayer';

const PHASE_LABEL: Record<string, string> = {
  first_half: '1st half', half_time: 'Half time', second_half: '2nd half', full_time: 'Full time',
  extra_time_first: 'Extra time', extra_time_half: 'ET half time', extra_time_second: 'Extra time', extra_time_full: 'After extra time',
};

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? '#000' : '#fff';
}

interface TeamColorPair { primary: string; secondary: string; }

function EventItem({ event, homeColors, awayColors }: {
  event: SimEvent;
  homeColors?: TeamColorPair;
  awayColors?: TeamColorPair;
}) {
  const statusColors = useStatusColors();
  const rowColor =
    event.type === 'goal'    ? statusColors.promotion  :
    event.type === 'penalty' ? statusColors.caution    :
    event.type === 'card'    ? statusColors.caution    :
    event.type === 'phase'   ? statusColors.playerTeam :
    undefined;

  // Split "[TeamName] description" → label + rest
  const match = event.text.match(/^\[([^\]]+)\] (.+)$/);
  const teamLabel = match ? match[1] : null;
  const description = match ? match[2] : event.text;

  const teamColors = event.team === 'home' ? homeColors : event.team === 'away' ? awayColors : undefined;
  const chipBg = teamColors?.primary;
  const chipFg = chipBg ? contrastColor(chipBg) : undefined;

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5, px: 1, bgcolor: rowColor, borderRadius: 1 }}>
      {event.minute && <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, pt: 0.2 }}>{event.minute}</Typography>}
      {teamLabel && chipBg ? (
        <Box sx={{ display: 'inline-block', px: 0.75, py: 0.1, borderRadius: 0.75, bgcolor: chipBg, color: chipFg, fontSize: '0.7rem', fontWeight: 700, lineHeight: 1.6, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {teamLabel}
        </Box>
      ) : teamLabel ? (
        <Typography variant="caption" sx={{ fontWeight: 700, flexShrink: 0, pt: 0.2 }}>{teamLabel}</Typography>
      ) : null}
      <Typography variant="body2">{description}</Typography>
    </Box>
  );
}

/** The match centre: a near-fullscreen modal overlay holding everything needed for
 *  in-match decisions — scoreboard, clock controls, the event ticker, tactics,
 *  substitutions, stats and insights. Opens when the player's fixture is played or
 *  simulated; while the match is live it can only be left through the match controls. */
export default function MatchOverlay() {
  const {
    matchOverlayOpen, focusFixture, focusLive, matchEvents, isStreaming, pauseRequested, pausesUsed,
    lastPauseReason, streamHome, streamAway, streamMinute, lastMatchInsights, lastMatchStatistics,
    halfTimeInsights, editableCountries, clubState,
    advanceMatch, pauseMatch, skipMatch, goToNextMatch, simulateToEnd, closeMatchOverlay, setStyle, setSliders, setFormation,
  } = useGameStore(useShallow((s) => ({
    matchOverlayOpen: s.matchOverlayOpen,
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
    closeMatchOverlay: s.closeMatchOverlay,
    setStyle: s.setStyle,
    setSliders: s.setSliders,
    setFormation: s.setFormation,
  })));

  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const confirm = useConfirm();
  const teamColors = useClubColors();
  const confirmSimSeason = async () => {
    if (await confirm({ title: 'Simulate season', message: 'Simulate all remaining matches?', confirmLabel: 'Simulate' })) {
      simulateToEnd();
    }
  };

  if (!focusFixture) { return null; }

  const homeColors = findTeamById(editableCountries, focusFixture.homeTeamId)?.colors;
  const awayRaw = findTeamById(editableCountries, focusFixture.awayTeamId)?.colors;
  const awayColors = homeColors && awayRaw ? awayDisplayColors(homeColors, awayRaw) : awayRaw;

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
    : 'Kick-off';

  const resolvePlayer = buildResolvePlayer(focusFixture, clubState, editableCountries);

  const pausesLeft = Math.max(0, MAX_PAUSES_PER_MATCH - pausesUsed);

  const controls = isStreaming ? (
    <Button variant="contained" color="secondary" size="small" startIcon={<PauseIcon />}
      disabled={pauseRequested || pausesLeft === 0} onClick={pauseMatch}>
      {pauseRequested ? 'Pausing…' : pausesLeft === 0 ? 'No pauses left' : `Pause (${pausesLeft} left)`}
    </Button>
  ) : completed ? (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
      <Button variant="contained" color="success" size="small" startIcon={<SkipNextIcon />} onClick={goToNextMatch}>
        Next match
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />} onClick={confirmSimSeason}>
        Sim. Season
      </Button>
      <IconButton aria-label="close" size="small" onClick={closeMatchOverlay} sx={{ color: 'inherit' }}>
        <CloseIcon />
      </IconButton>
    </Box>
  ) : (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button variant="contained" color="secondary" size="small" startIcon={<PlayArrowIcon />} onClick={advanceMatch}>
        {atIntermission ? 'Continue' : 'Resume'}
      </Button>
      <Button variant="contained" color="success" size="small" startIcon={<FastForwardIcon />} onClick={skipMatch}>
        Skip to full time
      </Button>
    </Box>
  );

  return (
    <Dialog
      open={matchOverlayOpen}
      fullWidth
      maxWidth={false}
      fullScreen={fullScreen}
      // While the match is live, ESC/backdrop are ignored — the only ways forward
      // are the match controls.
      onClose={() => { if (completed) { closeMatchOverlay(); } }}
      slotProps={{ paper: { sx: fullScreen ? {} : { height: 'calc(100vh - 48px)', m: 3, borderRadius: 3 } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Sticky scoreboard + controls */}
        <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {focusFixture.homeTeamName} {home} – {away} {focusFixture.awayTeamName}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>{statusLine}</Typography>
          </Box>
          {controls}
        </Box>

        {!isStreaming && live && lastPauseReason === 'red_card' && (
          <Alert severity="error" square sx={{ borderRadius: 0, flexShrink: 0 }}>
            Red card! The match is paused — reorganise your side before playing on.
          </Alert>
        )}

        {!isStreaming && live && lastPauseReason === 'injury' && (
          <Alert severity="error" square sx={{ borderRadius: 0, flexShrink: 0 }}>
            Injury! Your player can&apos;t continue — make a substitution before playing on.
          </Alert>
        )}

        {/* Two panes on md+: the ticker fills the left, decisions/readouts stack on the right. */}
        <Box sx={{
          flex: 1, minHeight: 0, display: 'flex', gap: 2, p: 2,
          flexDirection: { xs: 'column', md: 'row' },
          overflow: { xs: 'auto', md: 'hidden' },
        }}>
          <Box sx={{
            flex: { md: '1 1 55%' }, minHeight: { xs: 240, md: 0 },
            overflowY: { md: 'auto' },
            border: '1px solid', borderColor: 'divider', borderRadius: 2,
            p: 1, display: 'flex', flexDirection: 'column', gap: 0.25,
          }}>
            {matchEvents.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ p: 2 }}>Kick off…</Typography>
            ) : (
              matchEvents.map((e, i) => <EventItem key={`${e.minute}-${i}`} event={e} homeColors={homeColors} awayColors={awayColors} />)
            )}
          </Box>

          <Box sx={{
            flex: { md: '1 1 45%' }, minHeight: { md: 0 }, overflowY: { md: 'auto' },
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {/* Tactics + formation are editable whenever the clock is stopped (half time,
                red card, user pause, pre-kick-off) — changes re-resolve into the live
                simulation via applyPendingTactics() on every subsequent tick. */}
            {clubState && !completed && (
              <TacticsSection
                style={clubState.tactics.style}
                sliders={clubState.tactics.sliders}
                onStyle={setStyle}
                onSliders={setSliders}
                disabled={isStreaming}
              />
            )}
            {clubState && !completed && (() => {
              const effectiveLabel = effectiveFormationLabel(clubState.formation, clubState.shapes);
              const lines = FORMATION_LINES[clubState.formation as keyof typeof FORMATION_LINES] ?? [];
              return (
                <Box>
                  <FormationSelector
                    effectiveLabel={effectiveLabel}
                    onFormation={setFormation}
                    disabled={isStreaming}
                  />
                  <Box sx={{ mt: 1 }}>
                    <FormationGrid
                      lines={lines}
                      slotAssignments={clubState.startingXI}
                      squad={clubState.squad}
                      teamColors={teamColors}
                      shape={clubState.shapes?.defending ?? null}
                      compact
                    />
                  </Box>
                </Box>
              );
            })()}

            {!isStreaming && live && !completed && clubState && (
              <Paper variant="outlined">
                <SubstitutionPanel clubState={clubState} />
              </Paper>
            )}

            {!isStreaming && live && !completed && (
              <>
                {atIntermission && halfTimeInsights.length > 0 && (
                  <MatchInsightCards insights={halfTimeInsights} title="Half-time read" />
                )}
                <Paper variant="outlined">
                  <MatchStatsSheet
                    statistics={live.statistics}
                    homeName={focusFixture.homeTeamName}
                    awayName={focusFixture.awayTeamName}
                    title={atIntermission ? 'First-half stats' : `Stats after ${live.minute}'`}
                    resolvePlayer={resolvePlayer}
                  />
                </Paper>
              </>
            )}

            {completed && lastMatchInsights.length > 0 && (
              <MatchInsightCards insights={lastMatchInsights} title="Match analysis" />
            )}
            {completed && lastMatchStatistics && (
              <Paper variant="outlined">
                <MatchStatsSheet
                  statistics={lastMatchStatistics}
                  homeName={focusFixture.homeTeamName}
                  awayName={focusFixture.awayTeamName}
                  title="Match stats"
                  resolvePlayer={resolvePlayer}
                />
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
