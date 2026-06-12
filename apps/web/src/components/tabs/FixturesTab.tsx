import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useGameStore, findDivisionForTeam, findCountryForTeam } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { fmtDate } from '../../utils/formatting';
import { SectionHeader } from '@fm2k/design-system';

export default function FixturesTab() {
  const { leagueStates, playerTeamId, clubState, editableCountries, currentMatchday, selectedLeagueIds } =
    useGameStore(useShallow((s) => ({
      leagueStates:       s.leagueStates,
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

  // Show all nations that were selected at game start
  const availableNations = useMemo(
    () => editableCountries.filter(c => selectedLeagueIds.includes(c.id)),
    [editableCountries, selectedLeagueIds],
  );

  const [selectedNationId, setSelectedNationId] = useState(playerNation?.id ?? '');
  const [selectedDivisionId, setSelectedDivisionId] = useState(playerDiv?.id ?? '');

  // Keep defaults in sync if playerNation/playerDiv haven't resolved yet on first render
  useEffect(() => {
    if (playerNation && !selectedNationId) {setSelectedNationId(playerNation.id);}
    if (playerDiv && !selectedDivisionId) {setSelectedDivisionId(playerDiv.id);}
  }, [playerNation, playerDiv, selectedNationId, selectedDivisionId]);

  const selectedNation = availableNations.find(c => c.id === selectedNationId);
  const selectedDivision = selectedNation?.divisions.find(d => d.id === selectedDivisionId);

  // All divisions that have a simulated LeagueManager are "active"
  const isActiveLeague = selectedDivisionId in leagueStates;

  const totalRounds = useMemo(() => {
    const state = leagueStates[selectedDivisionId];
    if (state) {
      return Math.max(...state.fixtures.map(f => f.matchday));
    }
    if (selectedDivision) {
      return 2 * (selectedDivision.teams.length - 1);
    }
    return 0;
  }, [leagueStates, selectedDivisionId, selectedDivision]);

  const [selectedRound, setSelectedRound] = useState(() =>
    Math.min(currentMatchday + 1, Math.max(totalRounds, 1)),
  );

  useEffect(() => {
    setSelectedRound(Math.min(currentMatchday + 1, Math.max(totalRounds, 1)));
  }, [currentMatchday, totalRounds]);

  const fixturesInRound = useMemo(
    () => leagueStates[selectedDivisionId]?.fixtures.filter(f => f.matchday === selectedRound) ?? [],
    [leagueStates, selectedDivisionId, selectedRound],
  );

  const roundDate = fixturesInRound[0]?.scheduledTime;

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

      {/* Nation + Division selectors */}
      <Stack direction="row" sx={{ gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Nation</InputLabel>
          <Select
            value={selectedNationId}
            label="Nation"
            onChange={e => handleNationChange(e.target.value)}
          >
            {availableNations.map(c => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Division</InputLabel>
          <Select
            value={selectedDivisionId}
            label="Division"
            onChange={e => { setSelectedDivisionId(e.target.value); setSelectedRound(1); }}
          >
            {(selectedNation?.divisions ?? []).map(d => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* Round navigator */}
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', my: 2 }}>
        <IconButton
          size="small"
          disabled={selectedRound <= 1}
          onClick={() => setSelectedRound(r => r - 1)}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ textAlign: 'center', minWidth: 220, px: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Round {selectedRound} of {totalRounds || '–'}
          </Typography>
          {roundDate && (
            <Typography variant="caption" color="text.secondary">
              {fmtDate(roundDate)}
            </Typography>
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
      {!isActiveLeague ? (
        <Box sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>
          <Typography>This division is not being simulated in your current save.</Typography>
        </Box>
      ) : fixturesInRound.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>
          <Typography>No fixtures for this round.</Typography>
        </Box>
      ) : (
        <Box>
          {fixturesInRound.map(f => {
            const isPlayerGame =
              f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId;
            return (
              <Paper
                key={f.id}
                variant="outlined"
                sx={{
                  px: 2,
                  py: 1.5,
                  mb: 0.75,
                  borderLeft: '3px solid',
                  borderLeftColor: isPlayerGame ? 'primary.main' : 'transparent',
                  bgcolor: isPlayerGame ? 'action.hover' : 'background.paper',
                }}
              >
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                  <Typography
                    align="right"
                    noWrap
                    sx={{ flex: 1, fontWeight: isPlayerGame ? 600 : 400 }}
                  >
                    {f.homeTeamName}
                  </Typography>

                  {f.status === 'completed' ? (
                    <Chip
                      label={`${f.result!.homeScore} – ${f.result!.awayScore}`}
                      size="small"
                      sx={{ minWidth: 68, fontWeight: 700 }}
                    />
                  ) : (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 110, textAlign: 'center' }}
                    >
                      {fmtDate(f.scheduledTime)}
                    </Typography>
                  )}

                  <Typography
                    noWrap
                    sx={{ flex: 1, fontWeight: isPlayerGame ? 600 : 400 }}
                  >
                    {f.awayTeamName}
                  </Typography>
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
