import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';

interface ScrollableTableProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export default function ScrollableTable({ children, sx }: ScrollableTableProps) {
  return (
    <Box sx={{ overflowX: 'auto', ...sx }}>
      <Paper variant="outlined">
        <Table size="small">
          {children}
        </Table>
      </Paper>
    </Box>
  );
}
