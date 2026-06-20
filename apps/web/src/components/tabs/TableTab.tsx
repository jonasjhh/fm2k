import { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import { COUNTRY_FLAG } from '@fm2k/engine';
import { useGameStore, findDivisionForTeam, findCountryForTeam } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useStatusColors, leagueRowBg } from '../../utils/colors';
import { ScrollableTable } from '@fm2k/design-system';
import TeamNameButton from '../ui/TeamNameButton';
import TeamLineupDialog from '../TeamLineupDialog';
import CupBracket from '../CupBracket';
import { ButtonSelector } from '../ui/ButtonSelector';
import { SelectorPanel } from '../ui/SelectorPanel';

type CompetitionChoice = 'league' | 'cup';

export default function TableTab() {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [competition, setCompetition] = useState<CompetitionChoice>('league');
  const { leagueStates, cupStates, liveMatches, playerTeamId, editableCountries, selectedLeagueIds } =
    useGameStore(useShallow((s) => ({
      leagueStates:      s.leagueStates,
      cupStates:         s.cupStates,
      liveMatches:       s.liveMatches,
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
      {competition === 'league' && (
        <ButtonSelector
          label="Division"
          value={selectedDivisionId}
          onChange={setSelectedDivisionId}
          options={(selectedNation?.divisions ?? []).map(d => ({ value: d.id, label: d.name }))}
        />
      )}
    </SelectorPanel>
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

  // Provisional table: fold in-progress scores into the standings for a live picture.
  const liveForDiv = liveMatches.filter(l => l.competitionId === selectedDivisionId);
  const playingIds = new Set(liveForDiv.flatMap(l => [l.homeTeamId, l.awayTeamId]));
  const displayStandings = liveForDiv.length === 0 ? leagueState.standings : (() => {
    const rows = leagueState.standings.map(x => ({ ...x }));
    const by = new Map(rows.map(x => [x.teamId, x]));
    for (const m of liveForDiv) {
      const h = by.get(m.homeTeamId); const a = by.get(m.awayTeamId);
      if (!h || !a) { continue; }
      h.played++; a.played++;
      h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
      a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
      if (m.homeScore > m.awayScore) { h.won++; h.points += 3; a.lost++; }
      else if (m.homeScore < m.awayScore) { a.won++; a.points += 3; h.lost++; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
      h.goalDifference = h.goalsFor - h.goalsAgainst;
      a.goalDifference = a.goalsFor - a.goalsAgainst;
    }
    rows.sort((x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor);
    return rows;
  })();
  const isLive = liveForDiv.length > 0;

  return (
    <Box>
      {availableNations.length > 0 && selectors}

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
        {leagueState.name} — {leagueState.season}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {isLive && <Chip size="small" color="success" label="● LIVE — provisional" sx={{ fontWeight: 700 }} />}
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
          {displayStandings.map((s, i) => {
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
                    {playingIds.has(s.teamId) && <Box component="span" sx={{ color: 'success.main', fontWeight: 700, fontSize: 12 }}>● live</Box>}
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
