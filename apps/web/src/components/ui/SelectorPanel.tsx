import type { ReactNode } from 'react';
import Box from '@mui/material/Box';

/**
 * The shared bordered container that holds a tab's `ButtonSelector` rows, so the
 * selector chrome looks identical across Competitions / Fixtures / Club.
 */
export function SelectorPanel({ children }: { children: ReactNode }) {
  return (
    <Box sx={{
      mb: 2, p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      {children}
    </Box>
  );
}

export default SelectorPanel;
