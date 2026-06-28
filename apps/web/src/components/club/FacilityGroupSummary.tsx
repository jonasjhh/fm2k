import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { FACILITY_CATALOGUE, FacilityManager } from '@fm2k/engine';
import type { FacilityGroupId } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';

/** Total weekly upkeep across every built, non-mothballed wing in a group. */
export default function FacilityGroupSummary({ group }: { group: FacilityGroupId }) {
  const clubState = useGameStore(useShallow((s) => s.clubState));
  if (!clubState) {return null;}

  const groupState = clubState.facilities[group];
  const weeklyUpkeep = Object.keys(groupState.wings)
    .filter(wingId => !groupState.wings[wingId]?.mothballed)
    .reduce((sum, wingId) => sum + FacilityManager.wingCost(group, wingId, clubState.facilities).weeklyUpkeep, 0);
  const builtCount = Object.keys(groupState.wings).length;
  const totalCount = Object.keys(FACILITY_CATALOGUE[group]).length;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {builtCount} / {totalCount} wings built — £{fmt(weeklyUpkeep)}/week upkeep
        </Typography>
      </Box>
    </Paper>
  );
}
