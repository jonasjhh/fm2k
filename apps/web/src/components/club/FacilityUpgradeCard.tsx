import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SchoolIcon from '@mui/icons-material/School';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { FACILITY_NAMES, FACILITY_DESCS, FACILITY_COSTS, FACILITY_LEVELS } from '../../constants';
import { fmt } from '../../utils/formatting';

export type FacilityKey = 'medical' | 'training' | 'academy';

const FACILITY_ICONS: Record<FacilityKey, ReactNode> = {
  medical: <MedicalServicesIcon />,
  training: <FitnessCenterIcon />,
  academy: <SchoolIcon />,
};

export default function FacilityUpgradeCard({ facilityKey }: { facilityKey: FacilityKey }) {
  const { clubState, upgradeFacility } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    upgradeFacility: s.upgradeFacility,
  })));
  if (!clubState) {return null;}

  const lvl = clubState.facilities[facilityKey];
  const maxed = lvl >= 4;
  const cost = FACILITY_COSTS[lvl];
  const canAfford = clubState.budget >= cost;

  const handleUpgrade = () => {
    if (!confirm(`Upgrade ${FACILITY_NAMES[facilityKey]} for £${fmt(cost)}?`)) {return;}
    if (!upgradeFacility(facilityKey)) {alert('Insufficient budget.');}
  };

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {FACILITY_ICONS[facilityKey]}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{FACILITY_NAMES[facilityKey]}</Typography>
        </Box>
        <Chip label={`Level ${lvl}: ${FACILITY_LEVELS[lvl]}`} size="small" color={maxed ? 'success' : 'default'} sx={{ mb: 1 }} />
        <LinearProgress
          variant="determinate"
          value={(lvl / 4) * 100}
          color={maxed ? 'success' : 'primary'}
          sx={{ mb: 1 }}
        />
        <Typography variant="caption" color="text.secondary">{FACILITY_DESCS[facilityKey]}</Typography>
      </CardContent>
      <CardActions>
        {maxed ? (
          <Button size="small" disabled fullWidth>Max Level</Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            fullWidth
            disabled={!canAfford}
            onClick={handleUpgrade}
          >
            Upgrade → {FACILITY_LEVELS[lvl + 1]} (£{fmt(cost)})
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
