import { useState, useMemo } from 'react';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Button from '@mui/material/Button';
import { useGameStore } from '../../store/game-store';
import type { ClubPlayer, RegimentId } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';
import { playerValue, REGIMENT_IDS, REGIMENT_LABELS, DEFAULT_REGIMENT } from '@fm2k/engine';
import { StatsCard } from '@fm2k/design-system';
import { ScrollableTable } from '@fm2k/design-system';
import PlayerStatusChip from '../ui/PlayerStatusChip';
import SlotLabel from '../ui/SlotLabel';
import { useLineupSlots } from '../../hooks/useLineupSlots';

// ─── sorting ──────────────────────────────────────────────────────────────────

type SortCol = 'slot' | 'name' | 'position' | 'age' | 'value' | 'status';
type SortDir = 'asc' | 'desc';

const POSITION_ORDER: Record<string, number> = {
  GK: 0, LB: 1, CB: 2, RB: 3, CDM: 4, LM: 5, CM: 6, CAM: 7, RM: 8, LW: 9, RW: 10, ST: 11, CF: 12,
};

function statusRank(p: ClubPlayer): number {
  if (p.injury) {return 0;}
  if (p.suspension) {return 1;}
  return 2;
}

function sortPlayers(players: ClubPlayer[], col: SortCol, dir: SortDir, slotMap?: Map<string, number>): ClubPlayer[] {
  return [...players].sort((a, b) => {
    let cmp = 0;
    if (col === 'slot') {cmp = (slotMap?.get(a.id) ?? Infinity) - (slotMap?.get(b.id) ?? Infinity);}
    else if (col === 'name') {cmp = a.name.localeCompare(b.name);}
    else if (col === 'position') {cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);}
    else if (col === 'age') {cmp = a.age - b.age;}
    else if (col === 'value') {cmp = playerValue(a) - playerValue(b);}
    else if (col === 'status') {cmp = statusRank(a) - statusRank(b);}
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ─── attribute config ─────────────────────────────────────────────────────────

const ATTR_GROUPS = [
  {
    label: 'Physical',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'stamina', label: 'Stamina' },
    ],
  },
  {
    label: 'Technical',
    attrs: [
      { key: 'passing', label: 'Passing' },
      { key: 'finishing', label: 'Finishing' },
      { key: 'technique', label: 'Technique' },
      { key: 'defending', label: 'Defending' },
    ],
  },
  {
    label: 'Mental',
    attrs: [
      { key: 'awareness', label: 'Awareness' },
      { key: 'composure', label: 'Composure' },
    ],
  },
] as const;

// ─── attribute bar ────────────────────────────────────────────────────────────

function AttrBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'success.main' : value >= 65 ? 'warning.main' : 'error.light';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ width: 76, color: 'text.secondary', flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${value}%`, bgcolor: color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" sx={{ width: 22, textAlign: 'right', fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function PlayerDetailPanel({ player }: { player: ClubPlayer }) {
  const value = playerValue(player);
  const setTraining = useGameStore((s) => s.setTraining);
  const sellPlayer = useGameStore((s) => s.sellPlayer);
  const windowOpen = useGameStore((s) => s.transferWindow.open);

  const handleSell = () => {
    if (!confirm(`Sell ${player.name} for £${fmt(value)}?`)) {return;}
    sellPlayer(player.id);
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }} noWrap>
            {player.name}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip label={player.position} size="small" variant="outlined" />
          <Chip label={player.nationality} size="small" variant="outlined" />
          <Chip label={`Age ${player.age}`} size="small" variant="outlined" />
        </Box>
      </Box>

      <Grid container sx={{ borderBottom: 1, borderColor: 'divider' }}>
        {[
          { label: 'Fitness', value: `${player.fitness}%` },
          { label: 'Value',   value: `£${fmt(value)}` },
        ].map(({ label, value: val }) => (
          <Grid size={6} key={label} sx={{ textAlign: 'center', py: 1, borderRight: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } }}>
            <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">{label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
          </Grid>
        ))}
      </Grid>

      {(player.injury ?? player.suspension) && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">Status</Typography>
          <PlayerStatusChip player={player} />
        </Box>
      )}

      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Training</Typography>
        <Select
          size="small"
          fullWidth
          value={player.training ?? DEFAULT_REGIMENT}
          onChange={(e) => setTraining(player.id, e.target.value as RegimentId)}
          sx={{ '& .MuiSelect-select': { py: 0.5 } }}
        >
          {REGIMENT_IDS.map((id) => (
            <MenuItem key={id} value={id}>{REGIMENT_LABELS[id]}</MenuItem>
          ))}
        </Select>
      </Box>

      <Box sx={{ px: 2, py: 1.5 }}>
        {ATTR_GROUPS.map((group, gi) => (
          <Box key={group.label} sx={gi > 0 ? { mt: 1.5 } : {}}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              {group.label}
            </Typography>
            {group.attrs.map(({ key, label }) => (
              <AttrBar key={key} label={label} value={player.attributes[key]} />
            ))}
            {gi < ATTR_GROUPS.length - 1 && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          color="error"
          disabled={!windowOpen}
          onClick={handleSell}
        >
          {windowOpen ? `Sell · £${fmt(value)}` : 'Sell (window closed)'}
        </Button>
      </Box>
    </Paper>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SquadTab() {
  const clubState = useGameStore((s) => s.clubState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'slot', dir: 'asc' });

  const {
    starterSlots, allSlots, slotAssignments,
    playerSlotMap, draggingSlot, dropTargetId,
    setDraggingSlot, setDropTargetId,
    handleSlotClick, handleDragEnd,
    handlePlayerDragOver, handlePlayerDrop,
  } = useLineupSlots();

  const sorted = useMemo(
    () => clubState ? sortPlayers(clubState.squad, sort.col, sort.dir, playerSlotMap) : [],
    [clubState, sort, playerSlotMap],
  );

  if (!clubState) {return null;}

  const totalValue = clubState.squad.reduce((s, p) => s + playerValue(p), 0);
  const selectedPlayer = clubState.squad.find((p) => p.id === selectedId) ?? null;
  const playerById = new Map(clubState.squad.map(p => [p.id, p]));

  function handleSort(col: SortCol) {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Squad Size', value: clubState.squad.length },
          { label: 'Est. Value', value: `£${fmt(totalValue)}` },
        ].map(({ label, value }) => (
          <Grid size={{ xs: 6, sm: 4 }} key={label}>
            <StatsCard label={label} value={value} />
          </Grid>
        ))}
      </Grid>

      {/* Position pills */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        {allSlots.map(({ pos, idx, isSub }) => {
          const playerId = slotAssignments[idx] ?? null;
          const player = playerId ? (playerById.get(playerId) ?? null) : null;
          return (
            <SlotLabel
              key={idx}
              index={idx}
              position={pos}
              player={player}
              isSub={isSub}
              isDragging={draggingSlot === idx}
              onDragStart={setDraggingSlot}
              onDragEnd={handleDragEnd}
              onClick={handleSlotClick}
            />
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Squad table */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ScrollableTable>
            <TableHead>
              <TableRow>
                <TableCell align="center" sortDirection={sort.col === 'slot' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'slot'} direction={sort.col === 'slot' ? sort.dir : 'asc'} onClick={() => handleSort('slot')}>
                    Slot
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sortDirection={sort.col === 'position' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'position'} direction={sort.col === 'position' ? sort.dir : 'asc'} onClick={() => handleSort('position')}>
                    Pos
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort.col === 'name' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'name'} direction={sort.col === 'name' ? sort.dir : 'asc'} onClick={() => handleSort('name')}>
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sortDirection={sort.col === 'age' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'age'} direction={sort.col === 'age' ? sort.dir : 'asc'} onClick={() => handleSort('age')}>
                    Age
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sortDirection={sort.col === 'value' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'value'} direction={sort.col === 'value' ? sort.dir : 'asc'} onClick={() => handleSort('value')}>
                    Value
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort.col === 'status' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'status'} direction={sort.col === 'status' ? sort.dir : 'asc'} onClick={() => handleSort('status')}>
                    Status
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((p) => {
                const slotIdx = playerSlotMap.get(p.id);
                const slotPos = slotIdx !== undefined
                  ? (slotIdx < starterSlots.length ? starterSlots[slotIdx] : 'SUB')
                  : null;
                const isSelected = p.id === selectedId;
                const isDropTarget = p.id === dropTargetId;
                return (
                  <TableRow
                    key={p.id}
                    hover
                    onClick={() => setSelectedId(isSelected ? null : p.id)}
                    onDragOver={(e) => handlePlayerDragOver(e, p.id)}
                    onDragLeave={() => setDropTargetId(null)}
                    onDrop={(e) => handlePlayerDrop(e, p.id)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isDropTarget
                        ? (t) => alpha(t.palette.success.main, 0.15)
                        : isSelected
                          ? (t) => alpha(t.palette.primary.main, 0.12)
                          : slotIdx !== undefined
                            ? (t) => alpha(t.palette.primary.main, 0.04)
                            : undefined,
                      outline: isDropTarget ? '2px solid' : undefined,
                      outlineColor: isDropTarget ? 'success.main' : undefined,
                    }}
                  >
                    <TableCell align="center">
                      {slotPos
                        ? <Chip label={slotPos} size="small" color="primary" />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={p.position} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="center">{p.age}</TableCell>
                    <TableCell align="right">£{fmt(playerValue(p))}</TableCell>
                    <TableCell><PlayerStatusChip player={p} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ScrollableTable>
        </Box>

        {/* Detail panel */}
        {selectedPlayer && (
          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <PlayerDetailPanel player={selectedPlayer} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
