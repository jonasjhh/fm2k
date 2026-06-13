import { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { useGameStore, findDivisionForTeam, findCountryForTeam } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useStatusColors, leagueRowBg } from '../../utils/colors';
import { ScrollableTable } from '@fm2k/design-system';
import TeamNameButton from '../ui/TeamNameButton';
import TeamLineupDialog from '../TeamLineupDialog';
import CupBracket from '../CupBracket';

type CompetitionChoice = 'league' | 'cup';

export default function TableTab() {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [competition, setCompetition] = useState<CompetitionChoice>('league');
  const { leagueStates, cupStates, playerTeamId, editableCountries, selectedLeagueIds } =
    useGameStore(useShallow((s) => ({
      leagueStates:      s.leagueStates,
      cupStates:         s.cupStates,
      playerTeamId:      s.playerTeamId,
      editableCountries: s.editableCountries,
      selectedLeagueIds: s.selectedLeagueIds,
    })));

  const statusColors = useStatusColors();

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

  const handleNationChange = (id: string) => {
    setSelectedNationId(id);
    const nation = availableNations.find(c => c.id === id);
    setSelectedDivisionId(nation?.divisions[0]?.id ?? '');
  };

  const leagueState = leagueStates[selectedDivisionId] ?? null;
  const cupState = cupStates[`${selectedNationId}-cup`] ?? null;

  const ladder = [...(selectedNation?.divisions ?? [])].sort((a, b) => a.level - b.level);
  const divIdx = ladder.findIndex(d => d.id === selectedDivisionId);
  const hasDivisionAbove = divIdx > 0;
  const hasDivisionBelow = divIdx >= 0 && divIdx < ladder.length - 1;

  const n = leagueState?.standings.length ?? 0;

  const selectors = (
    <Stack direction="row" sx={{ gap: 2, mb: 2, flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Nation</InputLabel>
        <Select value={selectedNationId} label="Nation" onChange={e => handleNationChange(e.target.value)}>
          {availableNations.map(c => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Competition</InputLabel>
        <Select value={competition} label="Competition" onChange={e => setCompetition(e.target.value as CompetitionChoice)}>
          <MenuItem value="league">League</MenuItem>
          <MenuItem value="cup">National Cup</MenuItem>
        </Select>
      </FormControl>

      {competition === 'league' && (
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Division</InputLabel>
          <Select value={selectedDivisionId} label="Division" onChange={e => setSelectedDivisionId(e.target.value)}>
            {(selectedNation?.divisions ?? []).map(d => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Stack>
  );

  if (competition === 'cup') {
    return (
      <Box>
        {availableNations.length > 0 && selectors}
        {cupState
          ? <CupBracket state={cupState} playerTeamId={playerTeamId} onTeamClick={setSelectedTeamId} />
          : <Typography color="text.disabled" sx={{ py: 6, textAlign: 'center' }}>No cup is being simulated for this nation.</Typography>}
        <TeamLineupDialog teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} />
      </Box>
    );
  }

  if (!leagueState) {return <Box>{availableNations.length > 0 && selectors}</Box>;}

  return (
    <Box>
      {availableNations.length > 0 && selectors}

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
        {leagueState.name} — {leagueState.season}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {!hasDivisionAbove && <Chip size="small" sx={{ bgcolor: statusColors.champion }} label="Champion" />}
        {hasDivisionAbove && <Chip size="small" sx={{ bgcolor: statusColors.promotion }} label="Promotion" />}
        {hasDivisionBelow && <Chip size="small" sx={{ bgcolor: statusColors.relegation }} label="Relegation" />}
        <Chip size="small" sx={{ bgcolor: statusColors.playerTeam }} label="Your club" />
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
            const bg = leagueRowBg(isPlayer, pos, n, statusColors, { hasDivisionAbove, hasDivisionBelow });
            const gd = s.goalDifference >= 0 ? `+${s.goalDifference}` : String(s.goalDifference);
            return (
              <TableRow key={s.teamId} sx={bg ? { bgcolor: bg } : {}}>
                <TableCell align="center">{pos}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TeamNameButton name={s.teamName} onClick={() => setSelectedTeamId(s.teamId)} />
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
      <TeamLineupDialog teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} />
    </Box>
  );
}
