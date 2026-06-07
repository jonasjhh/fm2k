import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

interface StatsCardProps {
  label: string;
  value: string | number;
}

export default function StatsCard({ label, value }: StatsCardProps) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}
