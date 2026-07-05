import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { applySubstitutions, MAX_SUBS_PER_MATCH } from '@fm2k/engine';
import type { ClubState } from '@fm2k/engine';
import { showToast } from '@fm2k/toast';
import { useGameStore } from '@/store/game-store';

interface Props {
  clubState: ClubState;
}

/** In-match substitution controls: pick who comes off and who comes on, within the
 *  per-match limit. Shown while the player's live match is paused (or at half time). */
export default function SubstitutionPanel({ clubState }: Props) {
  const queueSubstitution = useGameStore(s => s.queueSubstitution);
  const [outId, setOutId] = useState('');
  const [inId, setInId] = useState('');

  const byId = new Map(clubState.squad.map(p => [p.id, p]));
  const subs = clubState.pendingSubstitutions;
  const remaining = MAX_SUBS_PER_MATCH - subs.length;

  const onPitchIds = applySubstitutions(clubState.startingXI, subs)
    .filter((id): id is string => id !== null);
  const usedIds = new Set(subs.flatMap(s => [s.playerInId, s.playerOutId]));
  const eligibleBench = clubState.benchPlayers
    .map(id => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter(p => !usedIds.has(p.id) && !onPitchIds.includes(p.id) && !p.injury && !p.suspension);

  const makeSub = () => {
    if (!outId || !inId) { return; }
    const outName = byId.get(outId)?.name ?? outId;
    const inName = byId.get(inId)?.name ?? inId;
    if (queueSubstitution(outId, inId)) {
      showToast(`${inName} will come on for ${outName}.`, 'success');
      setOutId('');
      setInId('');
    } else {
      showToast('Substitution not allowed.', 'error');
    }
  };

  return (
    <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" icon={<SwapHorizIcon />} label={`${remaining} sub${remaining === 1 ? '' : 's'} left`} />
      <TextField select size="small" label="Off" value={outId} onChange={e => setOutId(e.target.value)}
        sx={{ minWidth: 170 }} disabled={remaining === 0}>
        {onPitchIds.map(id => (
          <MenuItem key={id} value={id}>{byId.get(id)?.name ?? id} ({byId.get(id)?.position})</MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label="On" value={inId} onChange={e => setInId(e.target.value)}
        sx={{ minWidth: 170 }} disabled={remaining === 0}>
        {eligibleBench.length === 0 ? (
          <MenuItem value="" disabled>No eligible substitutes</MenuItem>
        ) : eligibleBench.map(p => (
          <MenuItem key={p.id} value={p.id}>{p.name} ({p.position})</MenuItem>
        ))}
      </TextField>
      <Button variant="outlined" size="small" startIcon={<SwapHorizIcon />}
        disabled={!outId || !inId || remaining === 0} onClick={makeSub}>
        Substitute
      </Button>
      {subs.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {subs.map(s => `${byId.get(s.playerInId)?.name ?? s.playerInId} ↔ ${byId.get(s.playerOutId)?.name ?? s.playerOutId}`).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}
