import type { StadiumSectorConfig } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { useConfirm, useAlert } from '@fm2k/design-system';
import { fmt } from '../../utils/formatting';
import StadiumPlanner from '../StadiumPlanner';
import { DEFAULT_STADIUM_SECTORS } from '../../utils/stadium';

export default function StadiumSubPage() {
  const { clubState, applyStadiumDesign } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    applyStadiumDesign: s.applyStadiumDesign,
  })));
  const confirm = useConfirm();
  const showAlert = useAlert();
  if (!clubState) { return null; }

  const committedSectors = clubState.stadiumSectors ?? (DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>);

  const handleApply = async (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): Promise<boolean> => {
    const ok = await confirm({
      title: 'Stadium renovation',
      message: `Apply stadium renovation for £${fmt(cost)}? This will update your stadium to ${newCapacity.toLocaleString()} capacity.`,
      confirmLabel: 'Renovate',
    });
    if (!ok) { return false; }
    if (!applyStadiumDesign(sectors, cost, newCapacity)) {
      await showAlert({ message: 'Insufficient budget.' });
      return false;
    }
    return true;
  };

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Stadium Planner</Typography>
      </Box>
      <StadiumPlanner
        clubName={clubState.clubName}
        committedSectors={committedSectors}
        budget={clubState.budget}
        onApply={handleApply}
      />
    </Card>
  );
}
