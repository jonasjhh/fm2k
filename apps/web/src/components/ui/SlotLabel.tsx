import { alpha } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ClubPlayer } from '@fm2k/engine';

export default function SlotLabel({
  index, position, player, isSub, isDragging, onDragStart, onDragEnd, onClick,
}: {
  index: number;
  position: string;
  player: ClubPlayer | null;
  isSub: boolean;
  isDragging: boolean;
  onDragStart: (i: number) => void;
  onDragEnd: () => void;
  onClick: (i: number) => void;
}) {
  void isSub;
  return (
    <Paper
      variant="outlined"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(index)}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 1.5,
        py: 0.75,
        minWidth: 54,
        cursor: 'grab',
        borderColor: isDragging
          ? 'primary.main'
          : player
            ? 'primary.light'
            : 'divider',
        bgcolor: isDragging
          ? (t) => alpha(t.palette.primary.main, 0.18)
          : player
            ? (t) => alpha(t.palette.primary.main, 0.07)
            : 'background.paper',
        opacity: isDragging ? 0.5 : 1,
        userSelect: 'none',
        transition: 'background-color 0.1s, border-color 0.1s',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
        },
      }}
    >
      <Typography sx={{
        fontSize: 12, fontWeight: 700, lineHeight: 1, letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}>
        {position}
      </Typography>
    </Paper>
  );
}
