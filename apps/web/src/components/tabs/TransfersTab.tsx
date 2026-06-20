import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TablePagination from '@mui/material/TablePagination';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { calculateOverall, playerValue, directTransferPrice, selectStartingXIWithSlots } from '@fm2k/engine';
import type { Player, Position } from '@fm2k/engine';
import { fmt } from '../../utils/formatting';
import { buyPlayerWithConfirm } from '../../utils/transfers';
import { SectionHeader } from '@fm2k/design-system';
import { ScrollableTable } from '@fm2k/design-system';

const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const ROWS_PER_PAGE = 25;

interface PlayerRow {
  player: Player;
  club: string;
  isFreeAgent: boolean;
  price: number;
  ovr: number;
}

type SortCol = 'name' | 'club' | 'position' | 'age' | 'ovr' | 'price';
type SortDir = 'asc' | 'desc';

const ATTR_GROUPS = [
  { label: 'Physical', keys: ['speed', 'strength', 'agility', 'stamina'] },
  { label: 'Technical', keys: ['passing', 'finishing', 'technique', 'defending'] },
  { label: 'Mental', keys: ['awareness', 'composure'] },
] as const;

function AttrBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'success.main' : value >= 65 ? 'warning.main' : 'error.light';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ width: 76, color: 'text.secondary', flexShrink: 0, textTransform: 'capitalize' }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${value}%`, bgcolor: color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" sx={{ width: 22, textAlign: 'right', fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

function PlayerDetailPanel({ row, canAfford, windowOpen, onBuy }: {
  row: PlayerRow; canAfford: boolean; windowOpen: boolean; onBuy: () => void;
}) {
  const { player } = row;
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>{player.name}</Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
          <Chip label={player.position} size="small" variant="outlined" />
          <Chip label={player.nationality} size="small" variant="outlined" />
          <Chip label={`Age ${player.age}`} size="small" variant="outlined" />
          <Chip label={row.club} size="small" variant="outlined" color={row.isFreeAgent ? 'success' : 'default'} />
        </Box>
      </Box>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">Asking price</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>£{fmt(row.price)}</Typography>
      </Box>
      <Box sx={{ px: 2, py: 1.5 }}>
        {ATTR_GROUPS.map((group, gi) => (
          <Box key={group.label} sx={gi > 0 ? { mt: 1.5 } : {}}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.75 }}>{group.label}</Typography>
            {group.keys.map((k) => <AttrBar key={k} label={k} value={player.attributes[k]} />)}
            {gi < ATTR_GROUPS.length - 1 && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button fullWidth size="small" variant="contained" disabled={!windowOpen || !canAfford} onClick={onBuy}>
          {!windowOpen ? 'Window closed' : !canAfford ? 'Cannot afford' : `Buy · £${fmt(row.price)}`}
        </Button>
      </Box>
    </Paper>
  );
}

export default function TransfersTab() {
  const {
    clubState, freeAgents, transferWindow, editableCountries, selectedLeagueIds, playerTeamId,
    signPlayer,
  } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    freeAgents: s.freeAgents,
    transferWindow: s.transferWindow,
    editableCountries: s.editableCountries,
    selectedLeagueIds: s.selectedLeagueIds,
    playerTeamId: s.playerTeamId,
    signPlayer: s.signPlayer,
  })));

  // ── filters ──
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<string>('');
  const [clubFilter, setClubFilter] = useState<string>(''); // '' = all, 'free', or a club name
  const [minOvr, setMinOvr] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'ovr', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const budget = clubState?.budget ?? 0;
  const windowOpen = transferWindow.open;
  const windowLabel = transferWindow.kind === 'pre_season' ? 'Pre-season'
    : transferWindow.kind === 'mid_season' ? 'Mid-season' : '';

  // ── the whole playerbase: every selected-league club (minus our own) + all free agents ──
  const allRows = useMemo<PlayerRow[]>(() => {
    const rows: PlayerRow[] = [];
    for (const c of editableCountries) {
      if (!selectedLeagueIds.includes(c.id)) { continue; }
      for (const d of c.divisions) {
        for (const t of d.teams) {
          if (t.id === playerTeamId) { continue; }
          const { starters } = selectStartingXIWithSlots(t.squad, t.formation);
          const starterIds = new Set(starters.map(p => p.id));
          for (const p of t.squad) {
            const role = starterIds.has(p.id) ? 'starter' : 'bench';
            rows.push({ player: p, club: t.name, isFreeAgent: false, price: directTransferPrice(p, role), ovr: Math.round(calculateOverall(p.attributes)) });
          }
        }
      }
    }
    for (const p of freeAgents) {
      rows.push({ player: p, club: 'Free agent', isFreeAgent: true, price: playerValue(p), ovr: Math.round(calculateOverall(p.attributes)) });
    }
    return rows;
  }, [editableCountries, selectedLeagueIds, freeAgents, playerTeamId]);

  const clubNames = useMemo(
    () => [...new Set(allRows.filter(r => !r.isFreeAgent).map(r => r.club))].sort((a, b) => a.localeCompare(b)),
    [allRows],
  );

  const filterActive = search.trim() !== '' || position !== '' || clubFilter !== '' || minOvr !== '' || maxAge !== '' || affordableOnly;

  const filtered = useMemo<PlayerRow[]>(() => {
    if (!filterActive) { return []; }
    const q = search.trim().toLowerCase();
    const minO = minOvr === '' ? -Infinity : Number(minOvr);
    const maxA = maxAge === '' ? Infinity : Number(maxAge);
    const rows = allRows.filter((r) => {
      if (q && !r.player.name.toLowerCase().includes(q)) { return false; }
      if (position && r.player.position !== position) { return false; }
      if (clubFilter === 'free' && !r.isFreeAgent) { return false; }
      if (clubFilter && clubFilter !== 'free' && r.club !== clubFilter) { return false; }
      if (r.ovr < minO) { return false; }
      if (r.player.age > maxA) { return false; }
      if (affordableOnly && r.price > budget) { return false; }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sort.col) {
        case 'name': return a.player.name.localeCompare(b.player.name) * dir;
        case 'club': return a.club.localeCompare(b.club) * dir;
        case 'position': return a.player.position.localeCompare(b.player.position) * dir;
        case 'age': return (a.player.age - b.player.age) * dir;
        case 'price': return (a.price - b.price) * dir;
        default: return (a.ovr - b.ovr) * dir;
      }
    });
    return rows;
  }, [allRows, filterActive, search, position, clubFilter, minOvr, maxAge, affordableOnly, budget, sort]);

  if (!clubState) { return null; }

  const pageRows = filtered.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const selectedRow = filtered.find(r => r.player.id === selectedId)
    ?? allRows.find(r => r.player.id === selectedId) ?? null;

  const handleSort = (col: SortCol) => {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'name' || col === 'club' || col === 'position' ? 'asc' : 'desc' });
    setPage(0);
  };

  const handleBuy = (row: PlayerRow) => {
    if (buyPlayerWithConfirm(signPlayer, row.player.name, row.player.id, row.price)) {
      setSelectedId(null);
    }
  };

  const sortLabel = (col: SortCol, label: string) => (
    <TableSortLabel active={sort.col === col} direction={sort.col === col ? sort.dir : 'asc'} onClick={() => handleSort(col)}>
      {label}
    </TableSortLabel>
  );

  return (
    <Box>
      <SectionHeader
        title="Transfer Market"
        subtitle={<>Budget: <strong>£{fmt(clubState.budget)}</strong> · Squad: {clubState.squad.length}</>}
      />

      <Alert severity={windowOpen ? 'success' : 'info'} sx={{ mb: 2 }}>
        {windowOpen
          ? <>The <strong>{windowLabel}</strong> transfer window is <strong>open</strong>{transferWindow.closesOnMatchday !== null ? ` (closes on matchday ${transferWindow.closesOnMatchday})` : ''}. Search the playerbase and sign anyone you can afford.</>
          : <>The transfer window is <strong>closed</strong>. Buying and selling reopen in the next window.</>}
      </Alert>

      {/* ── filters ── */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField size="small" label="Search name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} sx={{ minWidth: 180 }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="pos-label">Position</InputLabel>
          <Select labelId="pos-label" label="Position" value={position} onChange={(e) => { setPosition(e.target.value); setPage(0); }}>
            <MenuItem value="">Any</MenuItem>
            {POSITIONS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="club-label">Club</InputLabel>
          <Select labelId="club-label" label="Club" value={clubFilter} onChange={(e) => { setClubFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All clubs</MenuItem>
            <MenuItem value="free">Free agents</MenuItem>
            {clubNames.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" type="number" label="Min OVR" value={minOvr} onChange={(e) => { setMinOvr(e.target.value); setPage(0); }} sx={{ width: 100 }} />
        <TextField size="small" type="number" label="Max age" value={maxAge} onChange={(e) => { setMaxAge(e.target.value); setPage(0); }} sx={{ width: 100 }} />
        <FormControlLabel control={<Switch checked={affordableOnly} onChange={(e) => { setAffordableOnly(e.target.checked); setPage(0); }} />} label="Affordable" />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' }, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!filterActive ? (
            <Alert severity="info">Set a filter or search for a name.</Alert>
          ) : filtered.length === 0 ? (
            <Alert severity="warning">No players match your filters.</Alert>
          ) : (
            <>
              <ScrollableTable>
                <TableHead>
                  <TableRow>
                    <TableCell>{sortLabel('name', 'Name')}</TableCell>
                    <TableCell>{sortLabel('club', 'Club')}</TableCell>
                    <TableCell align="center">{sortLabel('position', 'Pos')}</TableCell>
                    <TableCell align="center">{sortLabel('age', 'Age')}</TableCell>
                    <TableCell align="center">{sortLabel('ovr', 'OVR')}</TableCell>
                    <TableCell align="right">{sortLabel('price', 'Price')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((r) => {
                    const canAfford = budget >= r.price;
                    return (
                      <TableRow key={r.player.id} hover selected={r.player.id === selectedId} sx={{ cursor: 'pointer' }}
                        onClick={() => setSelectedId(r.player.id === selectedId ? null : r.player.id)}>
                        <TableCell>{r.player.name}</TableCell>
                        <TableCell>
                          {r.isFreeAgent ? <Chip label="Free agent" size="small" color="success" variant="outlined" /> : r.club}
                        </TableCell>
                        <TableCell align="center"><Chip label={r.player.position} size="small" variant="outlined" /></TableCell>
                        <TableCell align="center">{r.player.age}</TableCell>
                        <TableCell align="center"><strong>{r.ovr}</strong></TableCell>
                        <TableCell align="right">£{fmt(r.price)}</TableCell>
                        <TableCell>
                          <Button size="small" variant="contained" disabled={!windowOpen || !canAfford}
                            onClick={(e) => { e.stopPropagation(); handleBuy(r); }}>
                            Buy
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </ScrollableTable>
              <TablePagination
                component="div"
                count={filtered.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={ROWS_PER_PAGE}
                rowsPerPageOptions={[ROWS_PER_PAGE]}
              />
            </>
          )}
        </Box>

        {selectedRow && (
          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <PlayerDetailPanel
              row={selectedRow}
              canAfford={budget >= selectedRow.price}
              windowOpen={windowOpen}
              onBuy={() => handleBuy(selectedRow)}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
