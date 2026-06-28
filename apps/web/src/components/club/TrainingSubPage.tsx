import Grid from '@mui/material/Grid';
import { TRAINING_WING_IDS } from '@fm2k/engine';
import WingCard from './WingCard';
import FacilityGroupSummary from './FacilityGroupSummary';

export default function TrainingSubPage() {
  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <FacilityGroupSummary group="training" />
      </Grid>
      {TRAINING_WING_IDS.map(wingId => (
        <Grid key={wingId} size={{ xs: 12, sm: 6, md: 4 }}>
          <WingCard group="training" wingId={wingId} />
        </Grid>
      ))}
    </Grid>
  );
}
