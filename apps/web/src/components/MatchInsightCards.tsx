import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import ShieldIcon from '@mui/icons-material/Shield';
import HubIcon from '@mui/icons-material/Hub';
import BoltIcon from '@mui/icons-material/Bolt';
import SwapCallsIcon from '@mui/icons-material/SwapCalls';
import InsightsIcon from '@mui/icons-material/Insights';
import type { MatchInsight, InsightCategory } from '@fm2k/engine';

const CATEGORY_ICON: Record<InsightCategory, React.ReactNode> = {
  attack: <SportsSoccerIcon fontSize="small" />,
  defense: <ShieldIcon fontSize="small" />,
  midfield: <HubIcon fontSize="small" />,
  press: <BoltIcon fontSize="small" />,
  transition: <SwapCallsIcon fontSize="small" />,
  neutral: <InsightsIcon fontSize="small" />,
};

interface Props {
  insights: MatchInsight[];
  /** Section heading, e.g. "Match analysis" or "Half-time read". */
  title: string;
}

/** The tactical readout: ranked takeaway cards from the insight detectors. */
export default function MatchInsightCards({ insights, title }: Props) {
  if (insights.length === 0) { return null; }
  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="match-insights">
      <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>{title}</Typography>
      {insights.map((ins, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1.25, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Box sx={{ color: 'secondary.main', display: 'flex', pt: 0.25 }}>{CATEGORY_ICON[ins.category]}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{ins.headline}</Typography>
            <Typography variant="body2" color="text.secondary">{ins.detail}</Typography>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
