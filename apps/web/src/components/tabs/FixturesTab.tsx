import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { COUNTRY_FLAG } from '@fm2k/engine';
import { useGameStore, findDivisionForTeam, findCountryForTeam } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { fmtDate } from '../../utils/formatting';
import { SectionHeader, SelectorPanel } from '@fm2k/design-system';
import TeamNameButton from '../ui/TeamNameButton';
import TeamLineupDialog from '../TeamLineupDialog';
import { ButtonSelector } from '../ui/ButtonSelector';

type CompetitionChoice = 'league' | 'cup';

export default function FixturesTab() {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [competition, setCompetition] = useState<CompetitionChoice>('league');
  const { leagueStates, cupStates, liveMatches, playerTeamId, clubState, editableCountries, currentMatchday, selectedLeagueIds } =
    useGameStore(useShallow((s) => ({
      leagueStates:       s.leagueStates,
      cupStates:          s.cupStates,
      liveMatches:        s.liveMatches,
      playerTeamId:       s.playerTeamId,
      clubState:          s.clubState,
      editableCountries:  s.editableCountries,
      currentMatchday:    s.currentMatchday,
      selectedLeagueIds:  s.selectedLeagueIds,
    })));

  const playerNation = useMemo(
    () => playerTeamId ? findCountryForTeam(editableCountries, playerTeamId) : null,
    [editableCountries, playerTeamId],
  );
  const playerDiv = useMemo(
    () => playerTeamId ? findDivisionForTeam(editableCountries, playerTeamId) : null,
    [editableCountries, playerTeamId],
  );

  const availableNations = useMemo(
    () => editableCountries.filter(c => selectedLeagueIds.includes(c.id)),
    [editableCountries, selectedLeagueIds],
  );

  const [selectedNationId, setSelectedNationId] = useState(playerNation?.id ?? '');
  const [selectedDivisionId, setSelectedDivisionId] = useState(playerDiv?.id ?? '');

  useEffect(() => {
    if (playerNation && !selectedNationId) {setSelectedNationId(playerNation.id);}
    if (playerDiv && !selectedDivisionId) {setSelectedDivisionId(playerDiv.id);}
  }, [playerNation, playerDiv, selectedNationId, selectedDivisionId]);

  const selectedNation = availableNations.find(c => c.id === selectedNationId);
  const selectedDivision = selectedNation?.divisions.find(d => d.id === selectedDivisionId);
  const cupState = cupStates[`${selectedNationId}-cup`] ?? null;
  const isCup = competition === 'cup';

  const activeState = isCup ? cupState : (leagueStates[selectedDivisionId] ?? null);
  const isActive = isCup ? cupState !== null : selectedDivisionId in leagueStates;

  const totalRounds = useMemo(() => {
    if (isCup) { return cupState?.bracket?.rounds ?? 0; }
    const state = leagueStates[selectedDivisionId];
    if (state) { return Math.max(...state.fixtures.map(f => f.matchday)); }
    if (selectedDivision) { return 2 * (selectedDivision.teams.length - 1); }
    return 0;
  }, [isCup, cupState, leagueStates, selectedDivisionId, selectedDivision]);

  const [selectedRound, setSelectedRound] = useState(() =>
    Math.min(currentMatchday + 1, Math.max(totalRounds, 1)),
  );

  // League follows the current matchday; cup defaults to its first round.
  useEffect(() => {
    setSelectedRound(isCup ? 1 : Math.min(currentMatchday + 1, Math.max(totalRounds, 1)));
  }, [isCup, currentMatchday, totalRounds]);

  const fixturesInRound = useMemo(
    () => activeState?.fixtures.filter(f => f.matchday === selectedRound) ?? [],
    [activeState, selectedRound],
  );

  const roundDate = fixturesInRound[0]?.scheduledTime;
  const roundLabel = isCup
    ? (cupState?.bracket?.roundNames[selectedRound - 1] ?? `Round ${selectedRound}`)
    : `Round ${selectedRound} of ${totalRounds || '–'}`;

  const handleNationChange = (id: string) => {
    setSelectedNationId(id);
    const nation = availableNations.find(c => c.id === id);
    setSelectedDivisionId(nation?.divisions[0]?.id ?? '');
    setSelectedRound(1);
  };

  if (!clubState) {return null;}

  return (
    <Box>
      <SectionHeader title="Fixtures" />

      {/* Nation + Competition (+ Division) selectors */}
      <SelectorPanel>
        <ButtonSelector
          label="Nation"
          value={selectedNationId}
          onChange={handleNationChange}
          options={availableNations.map(c => ({ value: c.id as string, label: c.name, prefix: COUNTRY_FLAG[c.id] }))}
        />
        <ButtonSelector<CompetitionChoice>
          label="Competition"
          value={competition}
          onChange={setCompetition}
          options={[{ value: 'league', label: 'League' }, { value: 'cup', label: 'National Cup' }]}
        />
        {!isCup && (
          <ButtonSelector
            label="Division"
            value={selectedDivisionId}
            onChange={(id) => { setSelectedDivisionId(id); setSelectedRound(1); }}
            options={(selectedNation?.divisions ?? []).map(d => ({ value: d.id, label: d.name }))}
          />
        )}
      </SelectorPanel>

      {/* Round navigator */}
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', my: 2 }}>
        <IconButton size="small" disabled={selectedRound <= 1} onClick={() => setSelectedRound(r => r - 1)}>
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ textAlign: 'center', minWidth: 220, px: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {isCup && '🏆 '}{roundLabel}
          </Typography>
          {roundDate && (
            <Typography variant="caption" color="text.secondary">{fmtDate(roundDate)}</Typography>
          )}
        </Box>

        <IconButton
          size="small"
          disabled={selectedRound >= totalRounds || totalRounds === 0}
          onClick={() => setSelectedRound(r => r + 1)}
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      {/* Fixture cards or placeholder */}
      {!isActive ? (
        <Box sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>
          <Typography>
            {isCup ? 'No cup is being simulated for this nation.' : 'This division is not being simulated in your current save.'}
          </Typography>
        </Box>
      ) : fixturesInRound.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>
          <Typography>{isCup ? 'This round has not been drawn yet.' : 'No fixtures for this round.'}</Typography>
        </Box>
      ) : (
        <Box>
          {fixturesInRound.map(f => {
            const isPlayerGame = f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId;
            const pens = f.result?.decidedBy === 'penalties' && f.result.shootout
              ? ` (${f.result.shootout.home}–${f.result.shootout.away} pens)` : '';
            const scoreLabel = f.result ? `${f.result.homeScore} – ${f.result.awayScore}${pens}` : '';
            const live = liveMatches.find(l => l.fixtureId === f.id);
            return (
              <Paper
                key={f.id}
                variant="outlined"
                sx={{
                  px: 2, py: 1.5, mb: 0.75,
                  borderLeft: '3px solid',
                  borderLeftColor: isPlayerGame ? 'primary.main' : 'transparent',
                  bgcolor: isPlayerGame ? 'action.hover' : 'background.paper',
                }}
              >
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                  <TeamNameButton
                    name={f.homeTeamName}
                    onClick={() => f.homeTeamId && setSelectedTeamId(f.homeTeamId)}
                    sx={{ flex: 1, textAlign: 'right', fontWeight: isPlayerGame ? 600 : 400 }}
                  />

                  {f.status === 'completed' ? (
                    <Chip
                      label={scoreLabel}
                      size="small"
                      sx={{ minWidth: 68, fontWeight: 700 }}
                    />
                  ) : live ? (
                    <Box sx={{ minWidth: 110, textAlign: 'center' }}>
                      <Chip label={`${live.homeScore} – ${live.awayScore}`} color="success" size="small" sx={{ minWidth: 60, fontWeight: 700 }} />
                      <Typography variant="caption" color="success.main" sx={{ display: 'block', fontWeight: 700 }}>
                        {live.phase === 'half_time' ? 'HT' : `${live.minute}'`}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110, textAlign: 'center' }}>
                      {fmtDate(f.scheduledTime)}
                    </Typography>
                  )}

                  <TeamNameButton
                    name={f.awayTeamName}
                    onClick={() => f.awayTeamId && setSelectedTeamId(f.awayTeamId)}
                    sx={{ flex: 1, fontWeight: isPlayerGame ? 600 : 400 }}
                  />
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}
      <TeamLineupDialog teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} />
    </Box>
  );
}
