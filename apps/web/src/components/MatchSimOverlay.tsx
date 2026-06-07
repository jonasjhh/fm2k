import { useRef, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import FastForwardIcon from '@mui/icons-material/FastForward';
import CheckIcon from '@mui/icons-material/Check';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { SimEvent } from '../store/game-store';
import { useStatusColors } from '../utils/colors';

function EventItem({ event }: { event: SimEvent }) {
  const statusColors = useStatusColors();
  const color =
    event.type === 'goal'  ? statusColors.promotion  :
    event.type === 'card'  ? statusColors.caution    :
    event.type === 'phase' ? statusColors.playerTeam :
    undefined;
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5, px: 1, bgcolor: color, borderRadius: 1 }}>
      {event.minute && <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, pt: 0.2 }}>{event.minute}</Typography>}
      <Typography variant="body2">{event.text}</Typography>
    </Box>
  );
}

export default function MatchSimOverlay() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { open, header, time, visibleEvents, finished, requestSkip, continueAfterMatch } = useGameStore(useShallow((s) => ({
    open: s.matchSimOverlayOpen,
    header: s.matchSimHeader,
    time: s.matchSimTime,
    visibleEvents: s.matchSimVisibleEvents,
    finished: s.matchSimFinished,
    requestSkip: s.requestSkip,
    continueAfterMatch: s.continueAfterMatch,
  })));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleEvents]);

  return (
    <Dialog open={open} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 2, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{header}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>{time}</Typography>
      </Box>
      <DialogContent sx={{ p: 0 }}>
        <Box
          ref={scrollRef}
          sx={{ maxHeight: 360, overflowY: 'auto', p: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}
        >
          {visibleEvents.length === 0 && (
            <Typography color="text.secondary" align="center" sx={{ p: 2 }}>Kick off…</Typography>
          )}
          {visibleEvents.map((e, i) => <EventItem key={i} event={e} />)}
        </Box>
        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, p: 2 }}>
          {!finished ? (
            <Button variant="outlined" startIcon={<FastForwardIcon />} onClick={requestSkip}>
              Skip to End
            </Button>
          ) : (
            <Button variant="contained" startIcon={<CheckIcon />} onClick={continueAfterMatch}>
              Continue
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
