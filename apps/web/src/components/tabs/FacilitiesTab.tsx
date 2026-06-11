import type { ReactNode } from 'react';
import type { StadiumSectorConfig } from '@fm2k/engine';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SchoolIcon from '@mui/icons-material/School';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { FACILITY_NAMES, FACILITY_DESCS, FACILITY_COSTS, FACILITY_LEVELS } from '../../constants';
import { fmt } from '../../utils/formatting';
import SectionHeader from '../ui/SectionHeader';
import StadiumPlanner from '../StadiumPlanner';
import { DEFAULT_STADIUM_SECTORS } from '../../utils/stadium';

const FACILITY_ICONS: Record<string, ReactNode> = {
  medical: <MedicalServicesIcon />,
  training: <FitnessCenterIcon />,
  academy: <SchoolIcon />,
};

export default function FacilitiesTab() {
  const { clubState, upgradeFacility, applyStadiumDesign } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    upgradeFacility: s.upgradeFacility,
    applyStadiumDesign: s.applyStadiumDesign,
  })));
  if (!clubState) return null;

  const handleUpgrade = (key: string) => {
    const lvl = clubState.facilities[key as keyof typeof clubState.facilities];
    const cost = FACILITY_COSTS[lvl];
    if (!confirm(`Upgrade ${FACILITY_NAMES[key]} for £${fmt(cost)}?`)) return;
    if (!upgradeFacility(key)) alert('Insufficient budget.');
  };

  const committedSectors = clubState.stadiumSectors ?? (DEFAULT_STADIUM_SECTORS as Record<string, StadiumSectorConfig>);

  const handleApply = (sectors: Record<string, StadiumSectorConfig>, cost: number, newCapacity: number): boolean => {
    if (!confirm(`Apply stadium renovation for £${fmt(cost)}? This will update your stadium to ${newCapacity.toLocaleString()} capacity.`)) return false;
    return applyStadiumDesign(sectors, cost, newCapacity);
  };

  return (
    <Box>
      <SectionHeader
        title="Club Facilities"
        subtitle={<>Budget: <strong>£{fmt(clubState.budget)}</strong></>}
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(['medical', 'training', 'academy'] as const).map((key) => {
          const lvl = clubState.facilities[key];
          const maxed = lvl >= 4;
          const cost = FACILITY_COSTS[lvl];
          const canAfford = clubState.budget >= cost;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={key}>
              <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {FACILITY_ICONS[key]}
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{FACILITY_NAMES[key]}</Typography>
                  </Box>
                  <Chip label={`Level ${lvl}: ${FACILITY_LEVELS[lvl]}`} size="small" color={maxed ? 'success' : 'default'} sx={{ mb: 1 }} />
                  <LinearProgress
                    variant="determinate"
                    value={(lvl / 4) * 100}
                    color={maxed ? 'success' : 'primary'}
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">{FACILITY_DESCS[key]}</Typography>
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
                      onClick={() => handleUpgrade(key)}
                    >
                      Upgrade → {FACILITY_LEVELS[lvl + 1]} (£{fmt(cost)})
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Card variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Stadium Planner</Typography>
          <Typography variant="caption" color="text.secondary">
            Design your stadium layout — configure each stand sector and seating density.
            Changes cost money and are applied only when you confirm the renovation.
          </Typography>
        </Box>
        <StadiumPlanner
          clubName={clubState.clubName}
          committedSectors={committedSectors}
          budget={clubState.budget}
          onApply={handleApply}
        />
      </Card>
    </Box>
  );
}
