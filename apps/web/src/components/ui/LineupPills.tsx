import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import SlotLabel from './SlotLabel';
import type { ClubPlayer } from '@fm2k/engine';

interface Slot {
  pos: string;
  idx: number;
  isSub: boolean;
}

interface Props {
  orderedSlots: Slot[];
  slotAssignments: (string | null)[];
  playerById: Map<string, ClubPlayer>;
  draggingSlot: number | null;
  onDragStart: (idx: number) => void;
  onDragEnd: () => void;
  onSlotClick: (idx: number) => void;
  onAutoPick: () => void;
  onClearTeam: () => void;
}

export default function LineupPills({
  orderedSlots, slotAssignments, playerById,
  draggingSlot, onDragStart, onDragEnd, onSlotClick,
  onAutoPick, onClearTeam,
}: Props) {
  const starters = orderedSlots.filter(s => !s.isSub);
  const subs = orderedSlots.filter(s => s.isSub);

  const renderRow = (slots: Slot[], action?: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'center' }}>
        {slots.map(({ pos, idx, isSub }) => {
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
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={onSlotClick}
            />
          );
        })}
      </Box>
      {action}
    </Box>
  );

  return (
    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {starters.length > 0 && renderRow(starters,
        <Button size="small" variant="outlined" onClick={onAutoPick} sx={{ whiteSpace: 'nowrap' }}>
          Auto-pick
        </Button>,
      )}
      {subs.length > 0 && renderRow(subs,
        <Button size="small" variant="outlined" color="error" onClick={onClearTeam} sx={{ whiteSpace: 'nowrap' }}>
          Clear team
        </Button>,
      )}
    </Box>
  );
}
