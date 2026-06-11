import { useState, useMemo } from 'react';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useGameStore, findTeamById } from '../../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { ClubPlayer, Formation } from '@fm2k/engine';
import { sellPrice } from '../../utils/calculations';
import { fmt } from '../../utils/formatting';
import ScrollableTable from '../ui/ScrollableTable';
import PlayerStatusChip from '../ui/PlayerStatusChip';
import SlotLabel from '../ui/SlotLabel';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import { useLineupSlots } from '../../hooks/useLineupSlots';

// ─── formation selector data ──────────────────────────────────────────────────

const FORMATIONS_QUICK: Formation[] = [
  '4-4-2', '4-3-3', '4-5-1', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-2-4',
  '3-5-2', '3-4-3', '3-4-2-1',
  '5-3-2', '5-4-1',
];

// ─── formation pitch visual ───────────────────────────────────────────────────

function FormationGrid({
  lines, slotAssignments, squad, teamColors,
}: {
  lines: string[][];
  slotAssignments: (string | null)[];
  squad: ClubPlayer[];
  teamColors: { primary: string; secondary: string };
}) {
  const playerById = useMemo(() => {
    const m = new Map<string, ClubPlayer>();
    squad.forEach(p => m.set(p.id, p));
    return m;
  }, [squad]);

  const reversedLines = [...lines].reverse();

  return (
    <Box sx={{
      background: 'linear-gradient(180deg, #2d6a2d 0%, #1e4d1e 100%)',
      borderRadius: 2,
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-evenly',
      border: '2px solid',
      borderColor: 'success.dark',
      minHeight: 460,
    }}>
      {reversedLines.map((line, li) => {
        const origLineIdx = lines.length - 1 - li;
        const offset = lines.slice(0, origLineIdx).reduce((n, l) => n + l.length, 0);
        return (
          <Box key={li} sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
            {line.map((pos, si) => {
              const idx = offset + si;
              const playerId = slotAssignments[idx] ?? null;
              const player = playerId ? playerById.get(playerId) ?? null : null;
              return (
                <Box key={`${pos}-${si}`} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: 72 }}>
                  <Box sx={{
                    width: 46, height: 46, borderRadius: '50%',
                    bgcolor: player ? teamColors.primary : 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid',
                    borderColor: player ? teamColors.secondary : 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: teamColors.secondary, lineHeight: 1, textAlign: 'center' }}>
                      {pos}
                    </Typography>
                  </Box>
                  <Typography sx={{
                    fontSize: 11, color: 'rgba(255,255,255,0.9)', textAlign: 'center',
                    lineHeight: 1, fontWeight: 600,
                    width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {player ? (() => { const parts = player.name.split(' '); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0]; })() : ''}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

// ─── player detail panel ──────────────────────────────────────────────────────

const ATTR_GROUPS = [
  { label: 'Physical', attrs: [{ key: 'speed', label: 'Speed' }, { key: 'strength', label: 'Strength' }, { key: 'agility', label: 'Agility' }, { key: 'stamina', label: 'Stamina' }] },
  { label: 'Technical', attrs: [{ key: 'passing', label: 'Passing' }, { key: 'finishing', label: 'Finishing' }, { key: 'technique', label: 'Technique' }, { key: 'defending', label: 'Defending' }] },
  { label: 'Mental', attrs: [{ key: 'awareness', label: 'Awareness' }, { key: 'composure', label: 'Composure' }] },
] as const;

function AttrBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'success.main' : value >= 65 ? 'warning.main' : 'error.light';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ width: 76, color: 'text.secondary', flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${value}%`, bgcolor: color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" sx={{ width: 22, textAlign: 'right', fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

function PlayerDetailPanel({ player }: { player: ClubPlayer }) {
  const value = sellPrice(player.attributes);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>{player.name}</Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
          <Chip label={player.position} size="small" variant="outlined" />
          <Chip label={`Age ${player.age}`} size="small" variant="outlined" />
        </Box>
      </Box>
      <Grid container sx={{ borderBottom: 1, borderColor: 'divider' }}>
        {[{ label: 'Fitness', value: `${player.fitness}%` }, { label: 'Value', value: `£${fmt(value)}` }].map(({ label, value: val }) => (
          <Grid size={6} key={label} sx={{ textAlign: 'center', py: 1, borderRight: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
          </Grid>
        ))}
      </Grid>
      {(player.injury || player.suspension) && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <PlayerStatusChip player={player} />
        </Box>
      )}
      <Box sx={{ px: 2, py: 1.5 }}>
        {ATTR_GROUPS.map((group, gi) => (
          <Box key={group.label} sx={gi > 0 ? { mt: 1.5 } : {}}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              {group.label}
            </Typography>
            {group.attrs.map(({ key, label }) => (
              <AttrBar key={key} label={label} value={player.attributes[key]} />
            ))}
            {gi < ATTR_GROUPS.length - 1 && <Divider sx={{ mt: 1 }} />}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TacticsTab() {
  const { clubState, editableCountries, playerTeamId, setFormation } = useGameStore(useShallow((s) => ({
    clubState: s.clubState,
    editableCountries: s.editableCountries,
    playerTeamId: s.playerTeamId,
    setFormation: s.setFormation,
  })));

  const {
    lines, starterSlots, allSlots, slotAssignments,
    playerSlotMap, draggingSlot, dropTargetId,
    setDraggingSlot, setDropTargetId,
    handleSlotClick, handleDragEnd,
    handlePlayerDragOver, handlePlayerDrop,
  } = useLineupSlots();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const teamColors = (playerTeamId ? findTeamById(editableCountries, playerTeamId)?.colors : null)
    ?? { primary: '#1565c0', secondary: '#ffffff' };

  const formation = (clubState?.formation ?? '4-4-2') as Formation;

  const selectedPlayer = useMemo(
    () => clubState?.squad.find(p => p.id === selectedPlayerId) ?? null,
    [clubState, selectedPlayerId],
  );

  if (!clubState) {return null;}


  const playerById = new Map(clubState.squad.map(p => [p.id, p]));

  return (
    <Box>
      {/* Formation selector */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {FORMATIONS_QUICK.map((f) => (
          <Button
            key={f}
            variant={formation === f ? 'contained' : 'outlined'}
            onClick={() => setFormation(f)}
            sx={{ px: 1.5, py: 0.75, minWidth: 54, fontSize: 12, fontWeight: 700, lineHeight: 1 }}
          >
            {f}
          </Button>
        ))}
      </Box>

      {/* Position pills */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        {allSlots.map(({ pos, idx, isSub }) => {
          const playerId = slotAssignments[idx] ?? null;
          const player = playerId ? (playerById.get(playerId) ?? null) : null;
          return (
            <SlotLabel
              key={idx}
              index={idx}
              position={pos}
              player={player}
              isSub={isSub}
              isDragging={draggingSlot === idx}
              onDragStart={setDraggingSlot}
              onDragEnd={handleDragEnd}
              onClick={handleSlotClick}
            />
          );
        })}
      </Box>

      {/* Three-column layout */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>

        {/* Col 1: Player list */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ScrollableTable>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align="center">Pos</TableCell>
                <TableCell align="center">Age</TableCell>
                <TableCell align="center">Slot</TableCell>
                <TableCell align="right">Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clubState.squad.map(p => {
                const slotIdx = playerSlotMap.get(p.id);
                const slotPos = slotIdx !== undefined
                  ? (slotIdx < starterSlots.length ? starterSlots[slotIdx] : 'SUB')
                  : null;
                const isSelected = p.id === selectedPlayerId;
                const isDropTarget = p.id === dropTargetId;
                return (
                  <TableRow
                    key={p.id}
                    hover
                    onClick={() => setSelectedPlayerId(isSelected ? null : p.id)}
                    onDragOver={(e) => handlePlayerDragOver(e, p.id)}
                    onDragLeave={() => setDropTargetId(null)}
                    onDrop={(e) => handlePlayerDrop(e, p.id)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isDropTarget
                        ? (t) => alpha(t.palette.success.main, 0.15)
                        : isSelected
                          ? (t) => alpha(t.palette.primary.main, 0.12)
                          : slotIdx !== undefined
                            ? (t) => alpha(t.palette.primary.main, 0.04)
                            : undefined,
                      outline: isDropTarget ? '2px solid' : undefined,
                      outlineColor: isDropTarget ? 'success.main' : undefined,
                    }}
                  >
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="center">
                      <Chip label={p.position} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">{p.age}</TableCell>
                    <TableCell align="center">
                      {slotPos
                        ? <Chip label={slotPos} size="small" color="primary" />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right">£{fmt(sellPrice(p.attributes))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ScrollableTable>
          {slotAssignments.slice(0, 11).filter(Boolean).length < 11 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {11 - slotAssignments.slice(0, 11).filter(Boolean).length} starter slot{slotAssignments.slice(0, 11).filter(Boolean).length < 10 ? 's' : ''} unfilled — drag a position label onto a player
            </Typography>
          )}
        </Box>

        {/* Col 2: Player detail */}
        <Box sx={{ width: 256, flexShrink: 0 }}>
          {selectedPlayer ? (
            <PlayerDetailPanel player={selectedPlayer} />
          ) : (
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Click a player to see details
              </Typography>
            </Paper>
          )}
        </Box>

        {/* Col 3: Formation pitch */}
        <Box sx={{ width: 380, flexShrink: 0 }}>
          <FormationGrid lines={lines} slotAssignments={slotAssignments} squad={clubState.squad} teamColors={teamColors} />
        </Box>

      </Box>
    </Box>
  );
}
