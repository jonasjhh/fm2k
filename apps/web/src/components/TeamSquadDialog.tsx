'use client';
import { useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import CloseIcon from '@mui/icons-material/Close';
import { calculateOverall, playerValue, getTeamOVR } from '@fm2k/engine';
import type { Player } from '@fm2k/engine';
import { ScrollableTable } from '@fm2k/design-system';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, findTeamById } from '@/store/game-store';
import { fmt } from '../utils/formatting';
import ScoutedPlayerModal from './ui/ScoutedPlayerModal';

type SortCol = 'name' | 'position' | 'age' | 'ovr' | 'value';
type SortDir = 'asc' | 'desc';

function sortPlayers(players: Player[], col: SortCol, dir: SortDir): Player[] {
  return [...players].sort((a, b) => {
    let cmp = 0;
    if (col === 'name') { cmp = a.name.localeCompare(b.name); }
    else if (col === 'position') { cmp = a.position.localeCompare(b.position); }
    else if (col === 'age') { cmp = a.age - b.age; }
    else if (col === 'ovr') { cmp = calculateOverall(a.attributes) - calculateOverall(b.attributes); }
    else if (col === 'value') { cmp = playerValue(a) - playerValue(b); }
    return dir === 'asc' ? cmp : -cmp;
  });
}

interface Props {
  teamId: string | null;
  onClose: () => void;
}

/** Read-only full-squad browser for any club (used for AI clubs — the manager's own squad
 *  is managed via the interactive Squad tab instead). */
export default function TeamSquadDialog({ teamId, onClose }: Props) {
  const { editableCountries } = useGameStore(useShallow(s => ({ editableCountries: s.editableCountries })));
  const team = teamId ? findTeamById(editableCountries, teamId) : null;
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'ovr', dir: 'desc' });
  const [clickedPlayerId, setClickedPlayerId] = useState<string | null>(null);

  const sorted = useMemo(
    () => team ? sortPlayers(team.squad, sort.col, sort.dir) : [],
    [team, sort],
  );

  const handleSort = (col: SortCol) => {
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };

  return (
    <>
      <Dialog open={team !== null} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
        {team && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: team.colors.primary, border: '2px solid', borderColor: team.colors.secondary, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>{team.name}</Typography>
                <Typography variant="caption" color="text.secondary">Full squad · {team.squad.length} players</Typography>
              </Box>
              <Chip
                size="small"
                variant="outlined"
                label={`OVR ${getTeamOVR(team.squad)}`}
                sx={{ borderColor: team.colors.primary }}
              />
              <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 2 }}>
              <ScrollableTable>
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sortDirection={sort.col === 'position' ? sort.dir : false}>
                      <TableSortLabel active={sort.col === 'position'} direction={sort.col === 'position' ? sort.dir : 'asc'} onClick={() => handleSort('position')}>
                        Pos
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={sort.col === 'name' ? sort.dir : false}>
                      <TableSortLabel active={sort.col === 'name'} direction={sort.col === 'name' ? sort.dir : 'asc'} onClick={() => handleSort('name')}>
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" sortDirection={sort.col === 'age' ? sort.dir : false}>
                      <TableSortLabel active={sort.col === 'age'} direction={sort.col === 'age' ? sort.dir : 'asc'} onClick={() => handleSort('age')}>
                        Age
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" sortDirection={sort.col === 'ovr' ? sort.dir : false}>
                      <TableSortLabel active={sort.col === 'ovr'} direction={sort.col === 'ovr' ? sort.dir : 'desc'} onClick={() => handleSort('ovr')}>
                        OVR
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sortDirection={sort.col === 'value' ? sort.dir : false}>
                      <TableSortLabel active={sort.col === 'value'} direction={sort.col === 'value' ? sort.dir : 'desc'} onClick={() => handleSort('value')}>
                        Value
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sorted.map((p) => (
                    <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => setClickedPlayerId(p.id)}>
                      <TableCell align="center"><Chip label={p.position} size="small" variant="outlined" /></TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell align="center">{p.age}</TableCell>
                      <TableCell align="center"><strong>{Math.round(calculateOverall(p.attributes))}</strong></TableCell>
                      <TableCell align="right">£{fmt(playerValue(p))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </ScrollableTable>
            </DialogContent>
          </>
        )}
      </Dialog>

      {team && (
        <ScoutedPlayerModal
          squad={team.squad}
          playerId={clickedPlayerId}
          onClose={() => setClickedPlayerId(null)}
          teamId={team.id}
          isOwnTeam={false}
        />
      )}
    </>
  );
}
