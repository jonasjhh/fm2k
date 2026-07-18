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
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useGameStore } from '@/store/game-store';
import type { ClubPlayer } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';
import { playerValue, emptySlotKey } from '@fm2k/engine';
import { StatsCard } from '@fm2k/design-system';
import { ScrollableTable } from '@fm2k/design-system';
import { useConfirm } from '@fm2k/design-system';
import PlayerStatusChip from '../ui/PlayerStatusChip';
import PlayerDetailModal from '../ui/PlayerDetailModal';
import SlotLabel from '../ui/SlotLabel';
import { useLineupSlots } from '../../hooks/useLineupSlots';

// ─── sorting ──────────────────────────────────────────────────────────────────

type SortCol = 'slot' | 'name' | 'position' | 'age' | 'value' | 'status';
type SortDir = 'asc' | 'desc';

const POSITION_ORDER: Record<string, number> = {
  GK: 0, LB: 1, CB: 2, RB: 3, LM: 4, CM: 5, RM: 6, LW: 7, RW: 8, ST: 9,
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

// ─── main component ───────────────────────────────────────────────────────────

export default function SquadTab() {
  const clubState = useGameStore((s) => s.clubState);
  const sellPlayer = useGameStore((s) => s.sellPlayer);
  const windowOpen = useGameStore((s) => s.transferWindow.open);
  const confirm = useConfirm();
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayer | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'slot', dir: 'asc' });

  const {
    allSlots, displayOrder, slotAssignments,
    playerSlotMap, draggingSlot, dropTargetId,
    setDraggingSlot, setDropTargetId,
    handleSlotClick, handleDragEnd,
    handlePlayerDragOver, handlePlayerDrop,
  } = useLineupSlots();

  const sorted = useMemo(
    () => clubState ? sortPlayers(clubState.squad, sort.col, sort.dir, displayOrder) : [],
    [clubState, sort, displayOrder],
  );

  const orderedSlots = useMemo(
    () => [...allSlots].sort((a, b) => (
      (displayOrder.get(slotAssignments[a.idx] ?? emptySlotKey(a.idx)) ?? a.idx)
      - (displayOrder.get(slotAssignments[b.idx] ?? emptySlotKey(b.idx)) ?? b.idx)
    )),
    [allSlots, displayOrder, slotAssignments],
  );

  if (!clubState) {return null;}

  const totalValue = clubState.squad.reduce((s, p) => s + playerValue(p), 0);
  const playerById = new Map(clubState.squad.map(p => [p.id, p]));

  function handleSort(col: SortCol) {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  async function handleSell() {
    if (!selectedPlayer) {return;}
    const value = playerValue(selectedPlayer);
    const ok = await confirm({
      title: 'Sell player',
      message: `Sell ${selectedPlayer.name} for £${fmt(value)}?`,
      confirmLabel: 'Sell',
      destructive: true,
    });
    if (!ok) {return;}
    sellPlayer(selectedPlayer.id);
    setSelectedPlayer(null);
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
        {orderedSlots.map(({ pos, idx, isSub }) => {
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
            const slotPos = slotIdx !== undefined ? (allSlots[slotIdx]?.pos ?? 'SUB') : null;
            const isDropTarget = p.id === dropTargetId;
            return (
              <TableRow
                key={p.id}
                hover
                onClick={() => setSelectedPlayer(p)}
                onDragOver={(e) => handlePlayerDragOver(e, p.id)}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => handlePlayerDrop(e, p.id)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: isDropTarget
                    ? (t) => alpha(t.palette.success.main, 0.15)
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

      <PlayerDetailModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        actions={
          selectedPlayer && (
            <Button
              variant="outlined"
              color="error"
              disabled={!windowOpen}
              onClick={handleSell}
            >
              {windowOpen ? `Sell · £${fmt(playerValue(selectedPlayer))}` : 'Sell (window closed)'}
            </Button>
          )
        }
      />
    </Box>
  );
}
