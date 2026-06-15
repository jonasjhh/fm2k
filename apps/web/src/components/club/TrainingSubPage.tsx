import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import FacilityUpgradeCard from './FacilityUpgradeCard';

export default function TrainingSubPage() {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <FacilityUpgradeCard facilityKey="training" />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Training Schedules</Typography>
            <Typography variant="body2" color="text.secondary">More options coming soon.</Typography>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}
