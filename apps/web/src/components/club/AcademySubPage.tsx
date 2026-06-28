import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { ACADEMY_HUB_WING_IDS, ACADEMY_DEVELOPMENT_WING_IDS } from '@fm2k/engine';
import WingCard from './WingCard';
import FacilityGroupSummary from './FacilityGroupSummary';

export default function AcademySubPage() {
  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <FacilityGroupSummary group="academy" />
      </Grid>
      <Grid size={12}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>Regional Scouting Hubs</Typography>
        <Typography variant="caption" color="text.secondary">Recruitment quality and bias for new intakes.</Typography>
      </Grid>
      {ACADEMY_HUB_WING_IDS.map(wingId => (
        <Grid key={wingId} size={{ xs: 12, sm: 6, md: 4 }}>
          <WingCard group="academy" wingId={wingId} />
        </Grid>
      ))}
      <Grid size={12}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>Youth Development</Typography>
        <Typography variant="caption" color="text.secondary">Growth and welfare for players already at the club.</Typography>
      </Grid>
      {ACADEMY_DEVELOPMENT_WING_IDS.map(wingId => (
        <Grid key={wingId} size={{ xs: 12, sm: 6, md: 4 }}>
          <WingCard group="academy" wingId={wingId} />
        </Grid>
      ))}
    </Grid>
  );
}
