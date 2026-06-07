'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { COUNTRY_COLORS } from '@fm2k/engine';
import { getTeamOVR } from '../utils/calculations';
import type { Team, CountryId } from '@fm2k/engine';
import FlagIcon from './FlagIcon';
import type { EditableCountry, EditableDivision } from '../store/game-store';

interface NationBrowserProps {
  countries: EditableCountry[];
  selectedTeamId?: string | null;
  onTeamClick: (team: Team, division: EditableDivision, country: EditableCountry) => void;
}

export default function NationBrowser({ countries, selectedTeamId, onTeamClick }: NationBrowserProps) {
  const [selectedCountry, setSelectedCountry] = useState<EditableCountry | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<EditableDivision | null>(null);

  const back = () => {
    if (selectedDivision) { setSelectedDivision(null); return; }
    if (selectedCountry) { setSelectedCountry(null); }
  };

  // ── level 1: nations ──────────────────────────────────────────────────────
  if (!selectedCountry) {
    return (
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
          Select a nation
        </Typography>
        <List dense disablePadding>
          {countries.map(c => {
            const teamCount = c.divisions.reduce((n, d) => n + d.teams.length, 0);
            const nc = COUNTRY_COLORS[c.id as CountryId];
            return (
              <ListItemButton
                key={c.id}
                onClick={() => setSelectedCountry(c)}
                sx={{ borderLeft: `4px solid ${nc.primary}`, '&:hover': { borderLeftColor: nc.primary } }}
              >
                <Box sx={{ mr: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <FlagIcon countryId={c.id} size={22} style={{ borderRadius: 2 }} />
                </Box>
                <ListItemText
                  primary={c.name}
                  secondary={`${c.divisions.length} divisions · ${teamCount} clubs`}
                  slotProps={{ secondary: { variant: 'caption' } }}
                />
                <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
                  <Box sx={{ width: 8, height: 18, borderRadius: 0.5, bgcolor: nc.primary, border: '1px solid rgba(0,0,0,0.12)' }} />
                  <Box sx={{ width: 8, height: 18, borderRadius: 0.5, bgcolor: nc.secondary, border: '1px solid rgba(0,0,0,0.12)' }} />
                </Box>
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    );
  }

  // ── level 2: divisions ────────────────────────────────────────────────────
  if (!selectedDivision) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 0.5 }}>
          <IconButton size="small" onClick={back}><ArrowBackIcon fontSize="small" /></IconButton>
          <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <FlagIcon countryId={selectedCountry.id} size={16} style={{ borderRadius: 2 }} />
            {selectedCountry.name}
          </Typography>
        </Box>
        <Divider sx={{ my: 0.5 }} />
        <List dense disablePadding>
          {selectedCountry.divisions.map(d => (
            <ListItemButton key={d.id} onClick={() => setSelectedDivision(d)}>
              <ListItemText
                primary={d.name}
                secondary={`Level ${d.level} · ${d.teams.length} clubs`}
                slotProps={{ secondary: { variant: 'caption' } }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
    );
  }

  // ── level 3: teams ────────────────────────────────────────────────────────
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 0.5 }}>
        <IconButton size="small" onClick={back}><ArrowBackIcon fontSize="small" /></IconButton>
        <Typography variant="subtitle2" sx={{ ml: 1, fontWeight: 700 }}>
          {selectedCountry.name} / {selectedDivision.name}
        </Typography>
      </Box>
      <Divider sx={{ my: 0.5 }} />
      <List dense disablePadding>
        {selectedDivision.teams.map(t => {
          const playerCount = t.starters.length + t.substitutes.length;
          const avgOvr = t.starters.length > 0 ? getTeamOVR(t.starters) : null;
          return (
            <ListItemButton
              key={t.id}
              selected={t.id === selectedTeamId}
              onClick={() => onTeamClick(t, selectedDivision, selectedCountry)}
              sx={{ borderLeft: `4px solid ${t.colors.primary}` }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mr: 1.25, flexShrink: 0 }}>
                <Box sx={{ width: 8, height: 11, borderRadius: '2px 2px 0 0', bgcolor: t.colors.primary, border: '1px solid rgba(0,0,0,0.12)' }} />
                <Box sx={{ width: 8, height: 11, bgcolor: t.colors.secondary, border: '1px solid rgba(0,0,0,0.12)', borderTop: 'none' }} />
              </Box>
              <ListItemText
                primary={t.name}
                secondary={
                  <Box component="span" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.25 }}>
                    <Chip label={t.formation} size="small" variant="outlined" sx={{ height: 16, fontSize: 10 }} />
                    {avgOvr !== null && (
                      <Chip label={`OVR ${avgOvr}`} size="small" variant="outlined"
                        sx={{ height: 16, fontSize: 10, borderColor: t.colors.primary, color: t.colors.primary }} />
                    )}
                    <Typography component="span" variant="caption" color="text.disabled">
                      {playerCount}p
                    </Typography>
                  </Box>
                }
                slotProps={{ secondary: { component: 'span' } }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
