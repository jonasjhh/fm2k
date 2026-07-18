'use client';
import { memo, useState, useTransition } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CasinoIcon from '@mui/icons-material/Casino';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useGameStore } from '@/store/game-store';
import { useConfirm } from '@fm2k/design-system';
import { useShallow } from 'zustand/react/shallow';
import { calculateOverall, NameGenerator, COUNTRY_COLORS, ALL_PLAYER_POSITIONS } from '@fm2k/engine';

import type { CountryKey } from '@fm2k/engine';
import type { Player, PlayerPosition, PlayerAttributes } from '@fm2k/engine';
import type { EditableCountry } from '@/store/game-store';
import FlagIcon from '../components/FlagIcon';

// ── attribute column definitions ──────────────────────────────────────────────
const ATTR_COLS: { key: keyof PlayerAttributes; label: string; full: string }[] = [
  { key: 'speed',     label: 'SPD', full: 'Speed'     },
  { key: 'strength',  label: 'STR', full: 'Strength'  },
  { key: 'stamina',   label: 'STA', full: 'Stamina'   },
  { key: 'passing',   label: 'PAS', full: 'Passing'   },
  { key: 'technique', label: 'TEC', full: 'Technique' },
  { key: 'finishing', label: 'FIN', full: 'Finishing' },
  { key: 'defending', label: 'DEF', full: 'Defending' },
  { key: 'keeping',   label: 'KEE', full: 'Keeping'   },
];

const DEFAULT_ATTRS: PlayerAttributes = {
  speed: 50, strength: 50, stamina: 50, passing: 50, technique: 50,
  finishing: 50, defending: 50, keeping: 50,
};

import { getContrastColor } from '../utils/colors';

// ── PlayerRow — read-only display, click row to edit ─────────────────────────
interface PlayerRowProps {
  player: Player;
  teamId: string;
  onEdit: (player: Player) => void;
  regeneratePlayer: (teamId: string, playerId: string) => void;
  removePlayer: (teamId: string, playerId: string) => void;
}

const PlayerRow = memo(function PlayerRow({
  player, teamId, onEdit, regeneratePlayer, removePlayer,
}: PlayerRowProps) {
  const ovr = Math.round(calculateOverall(player.attributes));
  return (
    <TableRow
      hover
      onClick={() => onEdit(player)}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell>
        <Chip label={player.position} size="small" variant="outlined" />
      </TableCell>
      <TableCell>{player.name}</TableCell>
      {ATTR_COLS.map(a => (
        <TableCell key={a.key} align="center" sx={{ px: 0.5, fontSize: 12 }}>
          {player.attributes[a.key]}
        </TableCell>
      ))}
      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 13 }}>{ovr}</TableCell>
      <TableCell align="right" onClick={e => e.stopPropagation()}>
        <IconButton size="small" onClick={() => regeneratePlayer(teamId, player.id)} title="Regenerate">
          <CasinoIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" color="error" onClick={() => removePlayer(teamId, player.id)} title="Remove">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
});

// ── main component ────────────────────────────────────────────────────────────
export default function TeamEditor() {
  const [selectedCountry, setSelectedCountry] = useState<EditableCountry | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPos, setDraftPos] = useState<PlayerPosition>('CM');
  const [draftAge, setDraftAge] = useState(22);
  const [draftPotential, setDraftPotential] = useState(70);
  const [draftAttrs, setDraftAttrs] = useState<PlayerAttributes>({ ...DEFAULT_ATTRS });
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  const {
    setScreen, goToMainMenu, editableCountries, editingTeamId, setEditingTeamId,
    updateTeamName, updatePlayerData, regeneratePlayer, removePlayer,
    addPlayer, generateFullTeam,
  } = useGameStore(useShallow(s => ({
    setScreen: s.setScreen,
    goToMainMenu: s.goToMainMenu,
    editableCountries: s.editableCountries,
    editingTeamId: s.editingTeamId,
    setEditingTeamId: s.setEditingTeamId,
    updateTeamName: s.updateTeamName,
    updatePlayerData: s.updatePlayerData,
    regeneratePlayer: s.regeneratePlayer,
    removePlayer: s.removePlayer,
    addPlayer: s.addPlayer,
    generateFullTeam: s.generateFullTeam,
  })));

  // Derive the active team and its country
  let activeTeam: typeof editableCountries[0]['divisions'][0]['teams'][0] | null = null;
  let teamCountry: EditableCountry | null = null;
  if (editingTeamId) {
    outer: for (const c of editableCountries) {
      for (const d of c.divisions) {
        const found = d.teams.find(t => t.id === editingTeamId);
        if (found) { activeTeam = found; teamCountry = c; break outer; }
      }
    }
  }
  // Stable const aliases: narrowing of the `let`s above doesn't survive into nested
  // closures (onChange/onClick handlers below), narrowing of a `const` does.
  const team = activeTeam;
  const country = teamCountry;

  function goToNations() { setEditingTeamId(null); setSelectedCountry(null); }
  function goToTeams(country: EditableCountry) { setEditingTeamId(null); setSelectedCountry(country); }
  function selectTeam(teamId: string) { startTransition(() => setEditingTeamId(teamId)); }

  function goBack() {
    if (view === 'team-editor') { setEditingTeamId(null); }
    else if (view === 'teams') { setSelectedCountry(null); }
    else { goToMainMenu(); }
  }

  const view = editingTeamId ? 'team-editor' : selectedCountry ? 'teams' : 'nations';

  const appBarTitle = view === 'nations'
    ? 'Editor — Select a nation'
    : view === 'teams'
      ? 'Editor — Select a team'
      : `Editor — Edit ${activeTeam?.name ?? ''}`;

  // ── modal helpers ─────────────────────────────────────────────────────────
  function closeModal() { setModalMode(null); setEditingPlayer(null); }

  function openAddModal() {
    const name = teamCountry ? new NameGenerator('all', teamCountry.id).generateName() : '';
    setDraftName(name);
    setDraftPos('CM');
    setDraftAge(22);
    setDraftPotential(70);
    setDraftAttrs({ ...DEFAULT_ATTRS });
    setModalMode('add');
  }

  function openEditModal(player: Player) {
    setDraftName(player.name);
    setDraftPos(player.position);
    setDraftAge(player.age);
    setDraftPotential(player.potential);
    setDraftAttrs({ ...player.attributes });
    setEditingPlayer(player);
    setModalMode('edit');
  }

  function randomiseAttrs() {
    const rand = () => Math.floor(Math.random() * 60) + 30;
    setDraftAttrs({
      speed: rand(), strength: rand(), stamina: rand(), passing: rand(), technique: rand(),
      finishing: rand(), defending: rand(), keeping: rand(),
    });
  }

  function submitModal() {
    if (!activeTeam || !teamCountry) {return;}
    const playerData = {
      name: draftName.trim() || 'Unknown',
      position: draftPos,
      nationality: teamCountry.nationality,
      age: draftAge,
      potential: draftPotential,
      attributes: draftAttrs,
    };
    if (modalMode === 'edit' && editingPlayer) {
      updatePlayerData(activeTeam.id, editingPlayer.id, playerData);
    } else {
      addPlayer(activeTeam.id, playerData);
    }
    closeModal();
  }

  const draftOvr = Math.round(calculateOverall(draftAttrs));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        color="primary"
        elevation={0}
        sx={
          view === 'team-editor' && activeTeam ? {
            bgcolor: activeTeam.colors.primary,
            color: getContrastColor(activeTeam.colors.primary),
            borderBottom: `3px solid ${activeTeam.colors.secondary}`,
          } : view === 'teams' && selectedCountry ? (() => {
            const nc = COUNTRY_COLORS[selectedCountry.id as CountryKey];
            return {
              bgcolor: nc.primary,
              color: getContrastColor(nc.primary),
              borderBottom: `3px solid ${nc.secondary}`,
            };
          })() : {}
        }
      >
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={goBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 1 }}>{appBarTitle}</Typography>
          <Button color="inherit" onClick={() => setScreen('team-selection')}>Play</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, sm: 3 } }}>
        {/* ── breadcrumb ─────────────────────────────────────────────────── */}
        <Breadcrumbs sx={{ mb: 2 }}>
          {view === 'nations' ? (
            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>Nations</Typography>
          ) : (
            <Link component="button" variant="body2" underline="hover" color="inherit" onClick={goToNations}>
              Nations
            </Link>
          )}
          {(view === 'teams' || view === 'team-editor') && selectedCountry && (
            view === 'teams' ? (
              <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <FlagIcon countryId={selectedCountry.id} size={16} /> {selectedCountry.name}
              </Typography>
            ) : (
              <Link component="button" variant="body2" underline="hover" color="inherit" onClick={() => goToTeams(selectedCountry)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <FlagIcon countryId={selectedCountry.id} size={16} /> {selectedCountry.name}
              </Link>
            )
          )}
          {view === 'team-editor' && activeTeam && (
            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
              {activeTeam.name}
            </Typography>
          )}
        </Breadcrumbs>

        {/* ── nations view — only rendered when active ──────────────────── */}
        {view === 'nations' && (
          <Grid container spacing={2}>
            {editableCountries.map(c => {
              const teamCount = c.divisions.reduce((n, d) => n + d.teams.length, 0);
              const nc = COUNTRY_COLORS[c.id as CountryKey];
              return (
                <Grid key={c.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <ButtonBase
                    onClick={() => setSelectedCountry(c)}
                    sx={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left',
                      p: 2, borderRadius: 1, bgcolor: 'background.paper',
                      border: '1px solid', borderColor: 'divider',
                      borderLeftColor: nc.primary, borderLeftWidth: 5,
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <FlagIcon countryId={c.id} size={28} style={{ borderRadius: 3 }} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{c.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.divisions.length} division{c.divisions.length !== 1 ? 's' : ''} · {teamCount} clubs
                      </Typography>
                    </Box>
                  </ButtonBase>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* ── teams view — avgOvr only computed when this view is active ─── */}
        {view === 'teams' && selectedCountry && (
          <Box>
            {selectedCountry.divisions.map(d => (
              <Box key={d.id} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="overline" color="text.secondary">{d.name}</Typography>
                  <Chip label={d.teams.length} size="small" />
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {d.teams.map(t => {
                    return (
                      <ButtonBase
                        key={t.id}
                        onClick={() => selectTeam(t.id)}
                        sx={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          py: 1, px: 1.5, minWidth: 140, borderRadius: 1,
                          bgcolor: t.colors.primary,
                          color: t.colors.secondary,
                          border: '1px solid rgba(0,0,0,0.12)',
                          transition: 'filter 0.15s',
                          '&:hover': { filter: 'brightness(0.88)' },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, textAlign: 'left', color: 'inherit' }}>{t.name}</Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* ── team editor view — PlayerRow memoised to limit re-renders ──── */}
        {view === 'team-editor' && team && country && (
          <Box>
            {/* ── team identity header ──────────────────────────────────── */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 2, mb: 3,
              p: { xs: 1.5, sm: 2 }, borderRadius: 2, bgcolor: 'background.paper',
              border: '1px solid', borderColor: 'divider',
              borderLeftColor: team.colors.primary, borderLeftWidth: 6,
            }}>
              <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
                <Box sx={{ width: 20, height: 28, borderRadius: '3px 3px 0 0', bgcolor: team.colors.primary, border: '1px solid rgba(0,0,0,0.15)' }} />
                <Box sx={{ width: 20, height: 28, borderRadius: '3px 3px 0 0', bgcolor: team.colors.secondary, border: '1px solid rgba(0,0,0,0.15)' }} />
              </Box>
              <TextField
                label="Club Name"
                value={team.name}
                onChange={e => updateTeamName(team.id, e.target.value)}
                size="small"
                sx={{ flexGrow: 1, maxWidth: 360 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto', flexShrink: 0 }}>
                <FlagIcon countryId={country.id} size={20} style={{ borderRadius: 3 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{country.name}</Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Players
                <Chip label={team.squad.length} size="small" sx={{ ml: 1 }} />
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openAddModal}>
                  Add Player
                </Button>
                <Button size="small" variant="contained" color="secondary" startIcon={<CasinoIcon />}
                  onClick={async () => {
                    if (await confirm({
                      title: 'Replace squad',
                      message: `Replace all players in ${team.name}?`,
                      confirmLabel: 'Replace',
                      destructive: true,
                    })) { generateFullTeam(team.id); }
                  }}>
                  Full Team
                </Button>
              </Box>
            </Box>

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 70 }}>Pos</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>Name</TableCell>
                    {ATTR_COLS.map(a => (
                      <TableCell key={a.key} align="center" sx={{ px: 0.5, width: 48 }}>{a.label}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ width: 48 }}>OVR</TableCell>
                    <TableCell align="right" sx={{ minWidth: 72 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {team.squad.map(p => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      teamId={team.id}
                      onEdit={openEditModal}
                      regeneratePlayer={regeneratePlayer}
                      removePlayer={removePlayer}
                    />
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}
      </Box>

      {/* ── add player modal ────────────────────────────────────────────────── */}
      <Dialog open={modalMode !== null} onClose={closeModal} maxWidth="md" fullWidth>
        <DialogTitle>{modalMode === 'edit' ? 'Edit Player' : 'Add Player'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Name" value={draftName} onChange={e => setDraftName(e.target.value)}
                fullWidth size="small" autoFocus />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Position</InputLabel>
                <Select value={draftPos} label="Position" onChange={e => setDraftPos(e.target.value as PlayerPosition)}>
                  {ALL_PLAYER_POSITIONS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 3, sm: 1.5 }}>
              <TextField label="Age" type="number" value={draftAge}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 15 && v <= 45) {setDraftAge(v);} }}
                fullWidth size="small" slotProps={{ htmlInput: { min: 15, max: 45 } }} />
            </Grid>
            <Grid size={{ xs: 3, sm: 1.5 }}>
              <TextField label="POT" type="number" value={draftPotential}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 99) {setDraftPotential(v);} }}
                fullWidth size="small" slotProps={{ htmlInput: { min: 1, max: 99 } }} />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="overline" color="text.secondary">Attributes</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={`OVR ${draftOvr}`} size="small" color="primary" />
                  <Tooltip title="Randomise attributes">
                    <IconButton size="small" onClick={randomiseAttrs}><CasinoIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>
              </Box>
              <Divider />
            </Grid>

            {ATTR_COLS.map(a => (
              <Grid key={a.key} size={{ xs: 6, sm: 2.4 }}>
                <TextField
                  label={a.full} type="number" value={draftAttrs[a.key]}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1 && v <= 99) {setDraftAttrs(prev => ({ ...prev, [a.key]: v }));}
                  }}
                  fullWidth size="small" slotProps={{ htmlInput: { min: 1, max: 99 } }}
                />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal}>Cancel</Button>
          <Button variant="contained" onClick={submitModal} startIcon={<AddIcon />}>
            {modalMode === 'edit' ? 'Save Changes' : 'Add Player'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
