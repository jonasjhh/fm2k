import { useMemo } from 'react';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import ScrollableTable from '../ui/ScrollableTable';
import PlayerStatusChip from '../ui/PlayerStatusChip';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import { useGameStore } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { calculateOverall } from '@fm2k/engine';
import { POSITION_GROUP } from '../../constants';

const FORMATIONS_QUICK = [
  { label: '4-4-2', def: 4, mid: 4, atk: 2 },
  { label: '4-3-3', def: 4, mid: 3, atk: 3 },
  { label: '3-5-2', def: 3, mid: 5, atk: 2 },
  { label: '4-2-3-1', def: 4, mid: 5, atk: 1 },
  { label: '5-3-2', def: 5, mid: 3, atk: 2 },
];

export default function TacticsTab() {
  const { clubState, toggleXI, setStartingXI } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    toggleXI: s.toggleXI,
    setStartingXI: s.setStartingXI,
  })));
  if (!clubState) return null;

  const autoSelect = (def: number, mid: number, atk: number) => {
    const avail = clubState.squad.filter((p) => !p.injury && !p.suspension);
    const best = (g: string) =>
      avail
        .filter((p) => POSITION_GROUP[p.position] === g)
        .sort((a, b) => calculateOverall(b.attributes) - calculateOverall(a.attributes));
    const xi = [
      ...best('GK').slice(0, 1),
      ...best('DEF').slice(0, def),
      ...best('MID').slice(0, mid),
      ...best('ATK').slice(0, atk),
    ].map((p) => p.id);
    if (xi.length < 11) {
      const sel = new Set(xi);
      avail
        .filter((p) => !sel.has(p.id))
        .sort((a, b) => calculateOverall(b.attributes) - calculateOverall(a.attributes))
        .slice(0, 11 - xi.length)
        .forEach((p) => xi.push(p.id));
    }
    if (xi.length === 11) setStartingXI(xi);
  };

  const players = useMemo(
    () => clubState.startingXI.map((id) => clubState.squad.find((p) => p.id === id)).filter(Boolean),
    [clubState.startingXI, clubState.squad],
  );
  const byGroup = useMemo(() => {
    const g: Record<string, typeof players> = { GK: [], DEF: [], MID: [], ATK: [] };
    for (const p of players) if (p) (g[POSITION_GROUP[p.position] ?? 'MID'] ??= []).push(p);
    return g;
  }, [players]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2, overflowX: 'auto' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          XI: {clubState.startingXI.length}/11
        </Typography>
        <ButtonGroup size="small" variant="outlined">
          {FORMATIONS_QUICK.map((f) => (
            <Button key={f.label} onClick={() => autoSelect(f.def, f.mid, f.atk)}>
              {f.label}
            </Button>
          ))}
        </ButtonGroup>
        <Button size="small" variant="outlined" color="error" onClick={() => setStartingXI([])}>
          Clear
        </Button>
      </Box>

      {clubState.startingXI.length < 11 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select {11 - clubState.startingXI.length} more player{clubState.startingXI.length < 10 ? 's' : ''} to complete your XI.
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <ScrollableTable sx={{ flex: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Name</TableCell>
                <TableCell align="center">Pos</TableCell>
                <TableCell align="center">OVR</TableCell>
                <TableCell align="center">Fit%</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clubState.squad.map((p) => {
                const ovr = Math.round(calculateOverall(p.attributes));
                const inXI = clubState.startingXI.includes(p.id);
                const disabled = !inXI && clubState.startingXI.length >= 11;
                return (
                  <TableRow
                    key={p.id}
                    hover
                    onClick={() => !disabled && toggleXI(p.id)}
                    sx={{ cursor: disabled ? 'default' : 'pointer', bgcolor: inXI ? (theme) => alpha(theme.palette.primary.main, 0.08) : undefined, opacity: disabled ? 0.5 : 1 }}
                  >
                    <TableCell padding="checkbox">
                      {inXI ? <CheckBoxIcon color="primary" fontSize="small" /> : <CheckBoxOutlineBlankIcon fontSize="small" />}
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
                    <TableCell align="center"><strong>{ovr}</strong></TableCell>
                    <TableCell align="center">{p.fitness}%</TableCell>
                    <TableCell><PlayerStatusChip player={p} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
        </ScrollableTable>

        <Paper
          variant="outlined"
          sx={{
            width: { xs: '100%', md: 280 },
            bgcolor: '#2E7D32',
            borderRadius: 3,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minHeight: 320,
            justifyContent: 'center',
          }}
        >
          {players.length === 0 ? (
            <Typography color="rgba(255,255,255,0.6)" align="center" sx={{ fontSize: 13 }}>
              Select 11 players to see formation
            </Typography>
          ) : (
            (['ATK', 'MID', 'DEF', 'GK'] as const).map((group) => {
              const rows = byGroup[group];
              if (!rows.length) return null;
              return (
                <Box key={group} sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {rows.map((p) => p ? (
                    <Box key={p.id} sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2, px: 1, py: 0.5 }}>
                      <Typography color="white" sx={{ fontSize: 11, fontWeight: 600 }}>
                        {p.name.split(' ').pop()}
                      </Typography>
                      <Typography color="rgba(255,255,255,0.7)" sx={{ fontSize: 10 }}>{p.position}</Typography>
                    </Box>
                  ) : null)}
                </Box>
              );
            })
          )}
        </Paper>
      </Box>
    </Box>
  );
}
