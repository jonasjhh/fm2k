'use client';
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import {
  calculateOverall, REGIMENT_IDS, REGIMENT_LABELS, REGIMENT_DESCRIPTIONS,
  DEFAULT_REGIMENT, defaultRegiment,
} from '@fm2k/engine';
import type { ClubPlayer, PlayerDelta, RegimentId, PlayerAttributes } from '@fm2k/engine';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/game-store';
import { SectionHeader } from '@fm2k/design-system';
import { ScrollableTable } from '@fm2k/design-system';
import PlayerDetailModal from '../ui/PlayerDetailModal';
import { useDivisionPar } from '../../hooks/useDivisionPar';

const ATTR_SHORT: Record<keyof PlayerAttributes, string> = {
  speed: 'SPD', strength: 'STR', stamina: 'STA', passing: 'PAS', technique: 'TEC',
  finishing: 'FIN', defending: 'DEF', goalkeeping: 'GKE',
};

// ─── sorting ──────────────────────────────────────────────────────────────────

type SortCol = 'position' | 'name' | 'age' | 'overall' | 'training' | 'development';
type SortDir = 'asc' | 'desc';

const POSITION_ORDER: Record<string, number> = {
  GK: 0, LB: 1, CB: 2, RB: 3, LM: 4, CM: 5, RM: 6, LW: 7, RW: 8, ST: 9,
};

function netDelta(delta: PlayerDelta | undefined): number {
  if (!delta) { return 0; }
  return Object.values(delta.deltas).reduce((sum, d) => sum + d, 0);
}

function sortSquad(
  squad: ClubPlayer[],
  col: SortCol,
  dir: SortDir,
  deltaByPlayerId: Map<string, PlayerDelta>,
): ClubPlayer[] {
  return [...squad].sort((a, b) => {
    let cmp = 0;
    if (col === 'position') { cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99); }
    else if (col === 'name') { cmp = a.name.localeCompare(b.name); }
    else if (col === 'age') { cmp = a.age - b.age; }
    else if (col === 'overall') { cmp = calculateOverall(a.attributes) - calculateOverall(b.attributes); }
    else if (col === 'training') {
      cmp = REGIMENT_LABELS[a.training ?? DEFAULT_REGIMENT].localeCompare(REGIMENT_LABELS[b.training ?? DEFAULT_REGIMENT]);
    } else if (col === 'development') {
      cmp = netDelta(deltaByPlayerId.get(a.id)) - netDelta(deltaByPlayerId.get(b.id));
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

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

  const par = useDivisionPar();
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayer | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'position', dir: 'asc' });
  const [legendOpen, setLegendOpen] = useState(false);

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

  const sorted = useMemo(
    () => clubState ? sortSquad(clubState.squad, sort.col, sort.dir, deltaByPlayerId) : [],
    [clubState, sort, deltaByPlayerId],
  );

  if (!clubState) { return null; }

  function handleSort(col: SortCol) {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  function sortLabel(col: SortCol, label: string) {
    return (
      <TableSortLabel active={sort.col === col} direction={sort.col === col ? sort.dir : 'asc'} onClick={() => handleSort(col)}>
        {label}
      </TableSortLabel>
    );
  }

  function handleAutoAssign() {
    if (!clubState) { return; }
    for (const p of clubState.squad) {
      setTraining(p.id, defaultRegiment(p.position, p.age));
    }
  }

  return (
    <Box>
      <SectionHeader title="Training" subtitle="Assign each player's training focus and review last season's development." />

      {/* Regiment counts + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
          {REGIMENT_IDS.map(id => (
            <Chip
              key={id}
              label={`${REGIMENT_LABELS[id]}: ${regimentCounts.get(id) ?? 0}`}
              size="small"
              variant="outlined"
            />
          ))}
        </Box>
        <Button size="small" variant="outlined" onClick={() => setLegendOpen(o => !o)}>
          {legendOpen ? 'Hide guide' : 'Show guide'}
        </Button>
        <Button size="small" variant="outlined" onClick={handleAutoAssign}>
          Auto-assign
        </Button>
      </Box>

      {/* Collapsible regiment guide */}
      <Collapse in={legendOpen}>
        <Box sx={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 1, mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover',
        }}>
          {REGIMENT_IDS.map(id => (
            <Box key={id}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {REGIMENT_LABELS[id]}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {REGIMENT_DESCRIPTIONS[id]}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>

      <ScrollableTable>
        <TableHead>
          <TableRow>
            <TableCell align="center" sortDirection={sort.col === 'position' ? sort.dir : false}>
              {sortLabel('position', 'Pos')}
            </TableCell>
            <TableCell sortDirection={sort.col === 'name' ? sort.dir : false}>
              {sortLabel('name', 'Name')}
            </TableCell>
            <TableCell align="center" sortDirection={sort.col === 'age' ? sort.dir : false}>
              {sortLabel('age', 'Age')}
            </TableCell>
            <TableCell align="center" sortDirection={sort.col === 'overall' ? sort.dir : false}>
              {sortLabel('overall', 'OVR')}
            </TableCell>
            <TableCell sx={{ minWidth: 200 }} sortDirection={sort.col === 'training' ? sort.dir : false}>
              {sortLabel('training', 'Training focus')}
            </TableCell>
            <TableCell sx={{ minWidth: 200 }} sortDirection={sort.col === 'development' ? sort.dir : false}>
              {sortLabel('development', 'Recent development')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map(p => (
            <TableRow key={p.id} hover onClick={() => setSelectedPlayer(p)} sx={{ cursor: 'pointer' }}>
              <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell align="center">{p.age}</TableCell>
              <TableCell align="center"><strong>{Math.round(calculateOverall(p.attributes))}</strong></TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
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

      <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} par={par} />
    </Box>
  );
}
