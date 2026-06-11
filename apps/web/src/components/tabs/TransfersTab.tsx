import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { calculateOverall } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';
import { sellPrice } from '../../utils/calculations';
import SectionHeader from '../ui/SectionHeader';
import ScrollableTable from '../ui/ScrollableTable';
import PlayerStatusChip from '../ui/PlayerStatusChip';

export default function TransfersTab() {
  const { clubState, transferListings, currentMatchday, buyPlayer, sellPlayer, refreshTransfers } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    transferListings: s.transferListings,
    currentMatchday: s.currentMatchday,
    buyPlayer: s.buyPlayer,
    sellPlayer: s.sellPlayer,
    refreshTransfers: s.refreshTransfers,
  })));
  if (!clubState) {return null;}

  const handleBuy = (listingId: string, playerName: string, price: number) => {
    if (!confirm(`Buy ${playerName} for £${fmt(price)}?`)) {return;}
    const ok = buyPlayer(listingId);
    if (!ok) {alert('Purchase failed — insufficient budget.');}
  };

  const handleSell = (playerId: string, playerName: string, price: number) => {
    if (!confirm(`Sell ${playerName} for £${fmt(price)}?`)) {return;}
    sellPlayer(playerId);
  };

  return (
    <Box>
      <SectionHeader
        title="Transfer Market"
        subtitle={<>Budget: <strong>£{fmt(clubState.budget)}</strong> · Squad: {clubState.squad.length}</>}
        action={
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refreshTransfers}>
            Refresh Market
          </Button>
        }
      />

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Available Players</Typography>
      <ScrollableTable sx={{ mb: 3 }}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="center">Pos</TableCell>
            <TableCell align="center">OVR</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="center">Exp.</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {transferListings.length ? transferListings.map((l) => {
            const ovr = Math.round(calculateOverall(l.player.attributes));
            const canAfford = clubState.budget >= l.askingPrice;
            const exp = l.expiresOnMatchday - currentMatchday;
            return (
              <TableRow key={l.id} hover>
                <TableCell>{l.player.name}</TableCell>
                <TableCell align="center"><Chip label={l.player.position} size="small" variant="outlined" /></TableCell>
                <TableCell align="center"><strong>{ovr}</strong></TableCell>
                <TableCell align="right">£{fmt(l.askingPrice)}</TableCell>
                <TableCell align="center">
                  <Chip label={`${exp}md`} size="small" color={exp <= 2 ? 'warning' : 'default'} />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!canAfford}
                    onClick={() => handleBuy(l.id, l.player.name, l.askingPrice)}
                  >
                    Buy
                  </Button>
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Alert severity="info" sx={{ border: 'none' }}>Market empty — click Refresh to populate it.</Alert>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </ScrollableTable>

      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Sell a Player</Typography>
      <ScrollableTable>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="center">Pos</TableCell>
            <TableCell align="center">OVR</TableCell>
            <TableCell align="center">Fitness</TableCell>
            <TableCell align="center">Status</TableCell>
            <TableCell align="right">Sale Price</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {clubState.squad.map((p) => {
            const ovr = Math.round(calculateOverall(p.attributes));
            const price = sellPrice(p.attributes);
            return (
              <TableRow key={p.id} hover>
                <TableCell>{p.name}</TableCell>
                <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
                <TableCell align="center"><strong>{ovr}</strong></TableCell>
                <TableCell align="center">{p.fitness}%</TableCell>
                <TableCell align="center"><PlayerStatusChip player={p} /></TableCell>
                <TableCell align="right">£{fmt(price)}</TableCell>
                <TableCell>
                  <Button size="small" variant="outlined" color="error" onClick={() => handleSell(p.id, p.name, price)}>
                    Sell
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </ScrollableTable>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Tip: Refresh the market every few matchdays to see new listings.
      </Typography>
    </Box>
  );
}
