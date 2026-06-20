'use client';
import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
  calculateOverall, REGIMENT_IDS, REGIMENT_LABELS, DEFAULT_REGIMENT,
} from '@fm2k/engine';
import type { ClubPlayer, PlayerDelta, RegimentId, PlayerAttributes } from '@fm2k/engine';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/game-store';
import { SectionHeader } from '@fm2k/design-system';
import { ScrollableTable } from '@fm2k/design-system';

const ATTR_SHORT: Record<keyof PlayerAttributes, string> = {
  speed: 'SPD', strength: 'STR', agility: 'AGI', passing: 'PAS', finishing: 'FIN',
  technique: 'TEC', defending: 'DEF', stamina: 'STA', awareness: 'AWA', composure: 'COM',
};

function DevelopmentCell({ delta }: { delta: PlayerDelta | undefined }) {
  if (!delta || Object.keys(delta.deltas).length === 0) {
    return <Typography variant="caption" color="text.disabled">No change last season</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {(Object.entries(delta.deltas) as [keyof PlayerAttributes, number][]).map(([attr, d]) => (
        <Chip
          key={attr}
          label={`${ATTR_SHORT[attr]} ${d > 0 ? '+' : ''}${d}`}
          size="small"
          color={d > 0 ? 'success' : 'error'}
          variant="outlined"
        />
      ))}
    </Box>
  );
}

export default function TrainingTab() {
  const { clubState, setTraining } = useGameStore(useShallow(s => ({
    clubState: s.clubState,
    setTraining: s.setTraining,
  })));

  const deltaByPlayerId = useMemo(
    () => new Map((clubState?.recentDevelopment ?? []).map(d => [d.playerId, d])),
    [clubState],
  );

  const regimentCounts = useMemo(() => {
    const counts = new Map<RegimentId, number>(REGIMENT_IDS.map(id => [id, 0]));
    for (const p of clubState?.squad ?? []) {
      const r = p.training ?? DEFAULT_REGIMENT;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return counts;
  }, [clubState]);

  if (!clubState) { return null; }

  const squad: ClubPlayer[] = clubState.squad;

  return (
    <Box>
      <SectionHeader title="Training" subtitle="Assign each player's training focus and review last season's development." />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {REGIMENT_IDS.map(id => (
          <Chip
            key={id}
            label={`${REGIMENT_LABELS[id]}: ${regimentCounts.get(id) ?? 0}`}
            size="small"
            variant="outlined"
          />
        ))}
      </Box>

      <ScrollableTable>
        <TableHead>
          <TableRow>
            <TableCell align="center">Pos</TableCell>
            <TableCell>Name</TableCell>
            <TableCell align="center">Age</TableCell>
            <TableCell align="center">OVR</TableCell>
            <TableCell sx={{ minWidth: 160 }}>Training focus</TableCell>
            <TableCell sx={{ minWidth: 200 }}>Recent development</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {squad.map(p => (
            <TableRow key={p.id} hover>
              <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell align="center">{p.age}</TableCell>
              <TableCell align="center"><strong>{Math.round(calculateOverall(p.attributes))}</strong></TableCell>
              <TableCell>
                <Select
                  size="small"
                  fullWidth
                  value={p.training ?? DEFAULT_REGIMENT}
                  onChange={(e) => setTraining(p.id, e.target.value as RegimentId)}
                  sx={{ '& .MuiSelect-select': { py: 0.5 } }}
                >
                  {REGIMENT_IDS.map((id) => (
                    <MenuItem key={id} value={id}>{REGIMENT_LABELS[id]}</MenuItem>
                  ))}
                </Select>
              </TableCell>
              <TableCell>
                <DevelopmentCell delta={deltaByPlayerId.get(p.id)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ScrollableTable>
    </Box>
  );
}
