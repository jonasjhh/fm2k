import { useState, useMemo } from 'react';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import { useGameStore } from '@/store/game-store';
import { useClubColors } from '../../hooks/useClubColors';
import { useShallow } from 'zustand/react/shallow';
import type { ClubPlayer, Formation } from '@fm2k/engine';
import { FORMATION_LINES, effectiveFormationLabel, emptySlotKey } from '@fm2k/engine';
import { ScrollableTable } from '@fm2k/design-system';
import PlayerStatusChip from '../ui/PlayerStatusChip';
import PlayerDetailModal from '../ui/PlayerDetailModal';
import SlotLabel from '../ui/SlotLabel';
import { TacticsPitch } from '../ui/TacticsPitch';
import { useLineupSlots } from '../../hooks/useLineupSlots';

// ─── sorting ──────────────────────────────────────────────────────────────────

type SortCol = 'slot' | 'name' | 'position';
type SortDir = 'asc' | 'desc';

const POSITION_ORDER: Record<string, number> = {
  GK: 0, LB: 1, CB: 2, RB: 3, LM: 4, CM: 5, RM: 6, LW: 7, RW: 8, ST: 9,
};

function sortPlayers(players: ClubPlayer[], col: SortCol, dir: SortDir, slotMap?: Map<string, number>): ClubPlayer[] {
  return [...players].sort((a, b) => {
    let cmp = 0;
    if (col === 'slot') { cmp = (slotMap?.get(a.id) ?? Infinity) - (slotMap?.get(b.id) ?? Infinity); }
    else if (col === 'name') { cmp = a.name.localeCompare(b.name); }
    else if (col === 'position') { cmp = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99); }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ─── formation selector data ──────────────────────────────────────────────────

const FORMATIONS_QUICK = Object.keys(FORMATION_LINES) as Formation[];

// ─── main component ───────────────────────────────────────────────────────────

export default function TacticsTab() {
  const { clubState, setFormation, setPlayerGeometry } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    setFormation: s.setFormation,
    setPlayerGeometry: s.setPlayerGeometry,
  })));

  const {
    allSlots, displayOrder, slotAssignments,
    playerSlotMap, draggingSlot, dropTargetId,
    setDraggingSlot, setDropTargetId,
    handleSlotClick, handleDragEnd,
    handlePlayerDragOver, handlePlayerDrop,
  } = useLineupSlots();

  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayer | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'slot', dir: 'asc' });

  const teamColors = useClubColors();
  const formation = (clubState?.formation ?? '4-4-2') as Formation;
  const effectiveLabel = clubState
    ? effectiveFormationLabel(clubState.formation, clubState.startingXI, clubState.shapes)
    : formation;

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

  const playerById = new Map(clubState.squad.map(p => [p.id, p]));

  function handleSort(col: SortCol) {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  return (
    <Box>
      {/* Formation selector */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {FORMATIONS_QUICK.map((f) => (
          <Button
            key={f}
            variant={effectiveLabel === f ? 'contained' : 'outlined'}
            onClick={() => setFormation(f)}
            sx={{ px: 1.5, py: 0.75, minWidth: 54, fontSize: 12, fontWeight: 700, lineHeight: 1 }}
          >
            {f}
          </Button>
        ))}
        {/* Status-only — there's no "switch to custom" action; dragging a circle on the
            pitch below is what gets you here, this pill just reflects that it happened. */}
        <Chip
          label="Custom"
          color={effectiveLabel === 'custom' ? 'secondary' : 'default'}
          variant={effectiveLabel === 'custom' ? 'filled' : 'outlined'}
          sx={{ fontSize: 12, fontWeight: 700 }}
        />
      </Box>

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

      {/* Two-column layout: player list + formation pitch */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>

        {/* Player list */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ScrollableTable>
            <TableHead>
              <TableRow>
                <TableCell align="center" sortDirection={sort.col === 'slot' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'slot'} direction={sort.col === 'slot' ? sort.dir : 'asc'} onClick={() => handleSort('slot')}>Slot</TableSortLabel>
                </TableCell>
                <TableCell align="center" sortDirection={sort.col === 'position' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'position'} direction={sort.col === 'position' ? sort.dir : 'asc'} onClick={() => handleSort('position')}>Pos</TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort.col === 'name' ? sort.dir : false}>
                  <TableSortLabel active={sort.col === 'name'} direction={sort.col === 'name' ? sort.dir : 'asc'} onClick={() => handleSort('name')}>Name</TableSortLabel>
                </TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map(p => {
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
                    <TableCell><PlayerStatusChip player={p} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ScrollableTable>
          {slotAssignments.slice(0, 11).filter(Boolean).length < 11 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {11 - slotAssignments.slice(0, 11).filter(Boolean).length} starter slot{slotAssignments.slice(0, 11).filter(Boolean).length < 10 ? 's' : ''} unfilled — drag a position label onto a player
            </Typography>
          )}
        </Box>

        {/* Formation pitch */}
        <Box sx={{ width: 380, flexShrink: 0 }}>
          <TacticsPitch
            formation={formation}
            startingXI={clubState.startingXI}
            shapes={clubState.shapes}
            squad={clubState.squad}
            teamColors={teamColors}
            onPlayerMove={setPlayerGeometry}
          />
        </Box>

      </Box>

      <PlayerDetailModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />
    </Box>
  );
}
