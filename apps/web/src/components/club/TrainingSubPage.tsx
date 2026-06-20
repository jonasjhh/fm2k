import Grid from '@mui/material/Grid';
import FacilityUpgradeCard from './FacilityUpgradeCard';

export default function TrainingSubPage() {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <FacilityUpgradeCard facilityKey="training" />
      </Grid>
    </Grid>
  );
}
