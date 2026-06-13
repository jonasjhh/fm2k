import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import type { CompetitionState, BracketSlot, CompetitionFixture } from '@fm2k/engine';
import TeamNameButton from './ui/TeamNameButton';

const TBD = 'TBD';

function TeamLine({
  teamId, name, isWinner, isPlayer, onTeamClick,
}: {
  teamId: string | null;
  name: string | null;
  isWinner: boolean;
  isPlayer: boolean;
  onTeamClick: (id: string) => void;
}) {
  const label = name ?? TBD;
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5,
      fontWeight: isWinner ? 700 : 400,
      color: name ? 'text.primary' : 'text.disabled',
    }}>
      {teamId
        ? <TeamNameButton name={label} onClick={() => onTeamClick(teamId)} sx={{ fontWeight: isWinner ? 700 : 400 }} />
        : <Typography component="span" variant="body2">{label}</Typography>}
      {isPlayer && <Chip label="You" size="small" color="primary" sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }} />}
    </Box>
  );
}

function scoreLabel(fixture: CompetitionFixture | undefined): string | null {
  if (!fixture?.result) { return null; }
  const { homeScore, awayScore, decidedBy, shootout } = fixture.result;
  let label = `${homeScore} – ${awayScore}`;
  if (decidedBy === 'penalties' && shootout) { label += ` (${shootout.home}–${shootout.away} pens)`; }
  else if (decidedBy === 'extra_time') { label += ' (AET)'; }
  return label;
}

function TieCard({
  slot, fixturesById, playerTeamId, onTeamClick,
}: {
  slot: BracketSlot;
  fixturesById: Map<string, CompetitionFixture>;
  playerTeamId: string | null;
  onTeamClick: (id: string) => void;
}) {
  const fixture = slot.fixtureId ? fixturesById.get(slot.fixtureId) : undefined;
  const score = scoreLabel(fixture);
  return (
    <Paper variant="outlined" sx={{ px: 1, py: 0.75, minWidth: 180 }}>
      <TeamLine
        teamId={slot.homeTeamId} name={slot.homeTeamName}
        isWinner={slot.winnerTeamId !== null && slot.winnerTeamId === slot.homeTeamId}
        isPlayer={slot.homeTeamId === playerTeamId}
        onTeamClick={onTeamClick}
      />
      <TeamLine
        teamId={slot.awayTeamId} name={slot.awayTeamName}
        isWinner={slot.winnerTeamId !== null && slot.winnerTeamId === slot.awayTeamId}
        isPlayer={slot.awayTeamId === playerTeamId}
        onTeamClick={onTeamClick}
      />
      {score && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {score}
        </Typography>
      )}
    </Paper>
  );
}

/** Renders a fixed single-elimination bracket as one column per round. */
export default function CupBracket({
  state, playerTeamId, onTeamClick,
}: {
  state: CompetitionState;
  playerTeamId: string | null;
  onTeamClick: (id: string) => void;
}) {
  const bracket = state.bracket;
  if (!bracket) { return null; }

  const fixturesById = new Map(state.fixtures.map(f => [f.id, f]));
  const finalSlot = bracket.slots.find(s => s.round === bracket.rounds);
  const championName = finalSlot && bracket.championTeamId
    ? (finalSlot.homeTeamId === bracket.championTeamId ? finalSlot.homeTeamName : finalSlot.awayTeamName)
    : null;

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
        {state.name} — {state.season}
      </Typography>

      {bracket.championTeamId && (
        <Paper sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'success.main', color: 'success.contrastText' }}>
          <EmojiEventsIcon />
          <Typography sx={{ fontWeight: 700 }}>Winner: {championName ?? bracket.championTeamId}</Typography>
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
        {Array.from({ length: bracket.rounds }, (_, r) => r + 1).map(round => (
          <Box key={round} sx={{ minWidth: 196 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
              {bracket.roundNames[round - 1]}
            </Typography>
            <Stack spacing={1}>
              {bracket.slots.filter(s => s.round === round).map(slot => (
                <TieCard
                  key={slot.tieId}
                  slot={slot}
                  fixturesById={fixturesById}
                  playerTeamId={playerTeamId}
                  onTeamClick={onTeamClick}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
