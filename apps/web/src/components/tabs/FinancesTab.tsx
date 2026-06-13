import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { useGameStore } from '../../store/game-store';
import { fmt, fmtDate } from '../../utils/formatting';
import { ScrollableTable } from '@fm2k/design-system';

export default function FinancesTab() {
  const clubState = useGameStore((s) => s.clubState);
  if (!clubState) {return null;}

  const recent = [...clubState.financialLog].reverse().slice(0, 40);

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom>Club Finances</Typography>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">Current Budget</Typography>
          <Typography variant="h4" color={clubState.budget >= 0 ? 'success.main' : 'error.main'} sx={{ fontWeight: 700 }}>
            £{fmt(clubState.budget)}
          </Typography>
        </CardContent>
      </Card>

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Recent Transactions</Typography>
      <ScrollableTable>
        <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recent.length ? recent.map((tx, i) => {
              const positive = tx.amount >= 0;
              const sign = positive ? '+' : '';
              return (
                <TableRow key={i} hover>
                  <TableCell>
                    <Chip
                      label={tx.type.replace(/_/g, ' ')}
                      size="small"
                      variant="outlined"
                      color={tx.type === 'transfer_in' ? 'success' : tx.type === 'transfer_out' ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                    {tx.timestamp ? fmtDate(tx.timestamp) : '—'}
                  </TableCell>
                  <TableCell>{tx.description}</TableCell>
                  <TableCell align="right">
                    <Typography
                      component="span"
                      color={positive ? 'success.main' : 'error.main'}
                      variant="body2"
                      sx={{ fontWeight: 700 }}
                    >
                      {sign}£{fmt(Math.abs(tx.amount))}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                  No transactions yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
      </ScrollableTable>
    </Box>
  );
}
