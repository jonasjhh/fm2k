import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import StarIcon from '@mui/icons-material/Star';
import { useGameStore } from '../../store/game-store';
import { calculateOverall } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';
import { sellPrice } from '../../utils/calculations';
import StatsCard from '../ui/StatsCard';
import ScrollableTable from '../ui/ScrollableTable';
import PlayerStatusChip from '../ui/PlayerStatusChip';

export default function SquadTab() {
  const clubState = useGameStore((s) => s.clubState);
  if (!clubState) return null;

  const totalValue = clubState.squad.reduce((s, p) => s + sellPrice(p.attributes), 0);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Squad Size',  value: clubState.squad.length },
          { label: 'Est. Value',  value: `£${fmt(totalValue)}` },
          { label: 'Starting XI', value: `${clubState.startingXI.length}/11` },
        ].map(({ label, value }) => (
          <Grid size={{ xs: 6, sm: 4 }} key={label}>
            <StatsCard label={label} value={value} />
          </Grid>
        ))}
      </Grid>

      <ScrollableTable>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="center">Pos</TableCell>
            <TableCell align="center">OVR</TableCell>
            <TableCell align="center">Fitness</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {clubState.squad.map((p) => {
            const ovr = Math.round(calculateOverall(p.attributes));
            const inXI = clubState.startingXI.includes(p.id);
            return (
              <TableRow key={p.id} hover sx={inXI ? { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08) } : {}}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {p.name}
                    {inXI && <StarIcon sx={{ fontSize: 14, color: 'primary.main' }} />}
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Chip label={p.position} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="center"><strong>{ovr}</strong></TableCell>
                <TableCell align="center">{p.fitness}%</TableCell>
                <TableCell><PlayerStatusChip player={p} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </ScrollableTable>
    </Box>
  );
}
