import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { useGameStore, findTeamById } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { sfx, fmtDate } from '../../utils/formatting';
import { getContrastColor } from '../../utils/colors';
import {
  getTeamOVR, recentForm, FORMATION_LINES, buildSlotAssignments, buildXISlotAssignments,
} from '@fm2k/engine';
import type { Player, Formation } from '@fm2k/engine';
import { FormationGrid } from '../ui/FormationGrid';
import MatchSimPanel from '../MatchSimPanel';
import TacticsSection from '../ui/TacticsSection';

function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const color = result === 'W' ? 'success' : result === 'D' ? 'warning' : 'error';
  return <Chip label={result} size="small" color={color} sx={{ minWidth: 32, fontWeight: 700 }} />;
}

export default function MatchTab() {
  const { leagueState, cupStates, clubState, playerTeamId, editableCountries, seasonComplete, focusFixture, focusLive, isStreaming, setStyle, setSliders } =
    useGameStore(useShallow((s) => ({
      leagueState: s.leagueState,
      cupStates: s.cupStates,
      clubState: s.clubState,
      playerTeamId: s.playerTeamId,
      editableCountries: s.editableCountries,
      seasonComplete: s.seasonComplete,
      focusFixture: s.focusFixture,
      focusLive: s.focusLive,
      isStreaming: s.isStreaming,
      setStyle: s.setStyle,
      setSliders: s.setSliders,
    })));

  if (!leagueState) {return null;}

  if (seasonComplete && !focusFixture) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>The season is complete!</Typography>
        <Typography variant="body2">Check the Competitions tab for final standings and cup results.</Typography>
      </Alert>
    );
  }

  const fixture = focusFixture;
  if (!fixture) {return <Alert severity="info">No upcoming fixtures for your club.</Alert>;}

  const isCup = fixture.competitionId in cupStates;
  const isHome = fixture.homeTeamId === playerTeamId;
  const competitionLabel = isCup ? `National Cup — ${fixture.roundLabel}` : leagueState.name;

  const formFixtures = (focusLive || isStreaming)
    ? leagueState.fixtures.filter(f => f.id !== fixture?.id)
    : leagueState.fixtures;

  const formBadges = (teamId: string) =>
    recentForm(formFixtures, teamId).map((r, i) => (
      <FormBadge key={`${teamId}-${i}`} result={r} />
    ));

  /** The formation + slot assignments to display: the player's chosen XI, or the
   *  opponent's auto-selected best XI. */
  const xiViewFor = (teamId: string) => {
    const team = findTeamById(editableCountries, teamId);
    if (teamId === playerTeamId && clubState) {
      // TODO: an injured player can be selected and is shown here, but MatchSimulator
      // does not yet model reduced performance for injured players.
      const formation = clubState.formation;
      return {
        team, formation,
        lines: FORMATION_LINES[formation],
        slotAssignments: buildSlotAssignments(clubState.startingXI, clubState.benchPlayers, clubState.squad, formation),
        squad: clubState.squad as Player[],
      };
    }
    const squad: Player[] = team ? team.squad : [];
    const formation = (team?.formation ?? '4-4-2') as Formation;
    return { team, formation, lines: FORMATION_LINES[formation], slotAssignments: buildXISlotAssignments(squad, formation), squad };
  };

  const renderTeam = (teamId: string, showStats: boolean) => {
    const view = xiViewFor(teamId);
    if (!view.team) {return null;}
    const colors = view.team.colors;
    const headerText = getContrastColor(colors.primary);
    const xiPlayers = view.slotAssignments.slice(0, 11)
      .map(id => (id ? view.squad.find(p => p.id === id) : undefined))
      .filter((p): p is Player => p !== undefined);
    const ovr = getTeamOVR(xiPlayers);
    const pos = leagueState.standings.findIndex(s => s.teamId === teamId) + 1;
    return (
      <Grid size={{ xs: 12, sm: 6 }} key={teamId}>
        {/* Standalone team header, styled in the team's colours */}
        <Box sx={{
          bgcolor: colors.primary, color: headerText,
          borderTopLeftRadius: 8, borderTopRightRadius: 8,
          px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1,
          border: '1px solid', borderColor: 'divider', borderBottom: 'none',
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0, color: colors.secondary }} noWrap>
            {view.team.name}{teamId === playerTeamId ? ' (You)' : ''}
          </Typography>
          <Chip size="small" label={view.formation} sx={{ bgcolor: headerText, color: colors.primary, fontWeight: 700 }} />
          <Chip size="small" label={`OVR ${ovr}`} sx={{ bgcolor: `${headerText}22`, color: headerText }} />
        </Box>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderTop: 'none', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, p: 1 }}>
          <FormationGrid lines={view.lines} slotAssignments={view.slotAssignments} squad={view.squad} teamColors={colors} compact />
          {showStats && pos > 0 && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {pos}{sfx(pos)} in {leagueState.name}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Box sx={{ display: 'flex', gap: 0.5 }}>{formBadges(teamId)}</Box>
            </Box>
          )}
        </Box>
      </Grid>
    );
  };

  return (
    <Box>
      {/* Styled match header */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Box sx={{
          px: 2, py: 0.75, borderRadius: 999,
          bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.3 }}>
            {isCup && '🏆 '}{competitionLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            · {isCup ? '' : `Matchday ${fixture.matchday} · `}{fmtDate(fixture.scheduledTime)} · {isHome ? 'Home' : 'Away'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {renderTeam(fixture.homeTeamId, !isCup)}
        {renderTeam(fixture.awayTeamId, !isCup)}
      </Grid>

      {clubState && (
        <Box sx={{ mt: 2 }}>
          <TacticsSection
            style={clubState.tactics.style}
            sliders={clubState.tactics.sliders}
            onStyle={setStyle}
            onSliders={setSliders}
            disabled={isStreaming || !!focusLive}
          />
        </Box>
      )}

      <MatchSimPanel />
    </Box>
  );
}
