import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { ButtonSelector } from '../ui/ButtonSelector';
import { FACILITY_CATALOGUE, FacilityManager } from '@fm2k/engine';
import type { FacilityGroupId, WingId, OperatingMode } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';

const MODE_OPTIONS: { value: OperatingMode; label: string }[] = [
  { value: 'full_staff', label: 'Full Staff' },
  { value: 'core_staff', label: 'Core Staff' },
  { value: 'skeleton_crew', label: 'Skeleton Crew' },
];

const STAFF_TIER_OPTIONS = [
  { value: '1', label: 'Junior' },
  { value: '2', label: 'Experienced' },
  { value: '3', label: 'Elite' },
];

/** One wing within a facility group: a "Build" card when unbuilt, or mode/staff-tier
 *  controls plus an upkeep readout (and a forced-mothball warning) once built. */
export default function WingCard({ group, wingId }: { group: FacilityGroupId; wingId: WingId }) {
  const { clubState, buildWing, setWingMode, setWingStaffTier, mothballWing, unmothballWing } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    buildWing: s.buildWing,
    setWingMode: s.setWingMode,
    setWingStaffTier: s.setWingStaffTier,
    mothballWing: s.mothballWing,
    unmothballWing: s.unmothballWing,
  })));
  if (!clubState) {return null;}

  const def = FACILITY_CATALOGUE[group][wingId];
  const wing = clubState.facilities[group].wings[wingId];

  if (!wing) {
    const canAfford = clubState.budget >= def.buildCost;
    return (
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{def.name}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {def.description}
          </Typography>
          <Button
            size="small"
            variant="contained"
            fullWidth
            disabled={!canAfford}
            onClick={() => buildWing(group, wingId)}
          >
            Build (£{fmt(def.buildCost)})
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { weeklyUpkeep } = FacilityManager.wingCost(group, wingId, clubState.facilities);

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{def.name}</Typography>
          {wing.forcedMothball && (
            <Chip size="small" color="error" label="Mothballed — insufficient club funds" />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {def.description}
        </Typography>

        <Box sx={{ mb: 1 }}>
          <ButtonSelector
            label="Mode"
            options={MODE_OPTIONS}
            value={wing.mode}
            onChange={(mode) => setWingMode(group, wingId, mode)}
          />
        </Box>
        <Box sx={{ mb: 1.5 }}>
          <ButtonSelector
            label="Staff"
            options={STAFF_TIER_OPTIONS}
            value={String(wing.staffTier)}
            onChange={(tier) => setWingStaffTier(group, wingId, Number(tier) as 1 | 2 | 3)}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            £{fmt(weeklyUpkeep)}/week{wing.mothballed && ' (mothballed)'}
          </Typography>
          <Button size="small" onClick={() => (wing.mothballed ? unmothballWing(group, wingId) : mothballWing(group, wingId))}>
            {wing.mothballed ? 'Un-mothball' : 'Mothball'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
