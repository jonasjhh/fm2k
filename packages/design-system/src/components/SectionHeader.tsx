import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" component="div">{subtitle}</Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}
