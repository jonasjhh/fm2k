'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import { COUNTRY_COLORS } from '@fm2k/engine';
import type { CountryId } from '@fm2k/engine';
import FlagIcon from '../components/FlagIcon';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { EditableCountry } from '@/store/game-store';


import { getContrastColor } from '../utils/colors';

type Step = 'leagues' | 'nation' | 'team';

export default function TeamSelection() {
  const [step, setStep] = useState<Step>('leagues');
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<string>>(new Set());
  const [selectedNation, setSelectedNation] = useState<EditableCountry | null>(null);

  const { setScreen, editableCountries, startGame } = useGameStore(useShallow(s => ({
    setScreen: s.setScreen,
    editableCountries: s.editableCountries,
    startGame: s.startGame,
  })));

  function toggleLeague(id: string) {
    setSelectedLeagueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function goBack() {
    if (step === 'leagues') { setScreen('main-menu'); }
    else if (step === 'nation') { setStep('leagues'); setSelectedNation(null); }
    else { setStep('nation'); }
  }

  // ── derived ─────────────────────────────────────────────────────────────────
  const availableNations = editableCountries.filter(c => selectedLeagueIds.has(c.id));
  const nc = selectedNation ? COUNTRY_COLORS[selectedNation.id as CountryId] : null;

  const headerBgColor   = step === 'team' && nc ? nc.primary : 'primary.main';
  const headerColor     = step === 'team' && nc ? getContrastColor(nc.primary) : '#ffffff';
  const headerBorderBottom = step === 'team' && nc ? `3px solid ${nc.secondary}` : undefined;

  const headerTitle =
    step === 'leagues' ? 'Choose Your Leagues' :
    step === 'nation'  ? 'Choose Your Nation'  :
                         'Choose Your Club';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>

      {/* ── header ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        bgcolor: headerBgColor, color: headerColor, borderBottom: headerBorderBottom,
        display: 'flex', alignItems: 'center', px: 1, minHeight: 56, flexShrink: 0,
      }}>
        <IconButton onClick={goBack} sx={{ color: 'inherit' }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 1, fontWeight: 600, flexGrow: 1 }}>{headerTitle}</Typography>
        {step === 'leagues' && (
          <Button sx={{ color: 'inherit' }} startIcon={<EditIcon />} onClick={() => setScreen('editor')}>
            Edit Teams
          </Button>
        )}
      </Box>

      <Box sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 2, sm: 3 }, width: '100%' }}>

        {/* ── step 1: league multi-select ─────────────────────────────────── */}
        {step === 'leagues' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select which nation leagues to include in your game world.
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
              {editableCountries.map(c => {
                const isSelected = selectedLeagueIds.has(c.id);
                const colors = COUNTRY_COLORS[c.id as CountryId];
                const teamCount = c.divisions.reduce((n, d) => n + d.teams.length, 0);
                return (
                  <Grid key={c.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <ButtonBase
                      onClick={() => toggleLeague(c.id)}
                      sx={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left',
                        p: 2, borderRadius: 1,
                        bgcolor: isSelected ? `${colors.primary}18` : 'background.paper',
                        border: '2px solid',
                        borderColor: isSelected ? colors.primary : 'divider',
                        borderLeftColor: colors.primary, borderLeftWidth: 5,
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: isSelected ? `${colors.primary}28` : 'action.hover' },
                      }}
                    >
                      <FlagIcon countryId={c.id} size={28} style={{ borderRadius: 3 }} />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.divisions.length} divisions · {teamCount} clubs
                        </Typography>
                      </Box>
                      <Box sx={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? colors.primary : 'rgba(0,0,0,0.2)'}`,
                        bgcolor: isSelected ? colors.primary : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {isSelected && <CheckIcon sx={{ fontSize: 14, color: getContrastColor(colors.primary) }} />}
                      </Box>
                    </ButtonBase>
                  </Grid>
                );
              })}
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
              {selectedLeagueIds.size > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {selectedLeagueIds.size} league{selectedLeagueIds.size !== 1 ? 's' : ''} selected
                </Typography>
              )}
              <Button
                variant="contained"
                size="large"
                disabled={selectedLeagueIds.size === 0}
                endIcon={<ChevronRightIcon />}
                onClick={() => setStep('nation')}
                sx={{ px: 3 }}
              >
                Continue
              </Button>
            </Box>
          </>
        )}

        {/* ── step 2: nation select ───────────────────────────────────────── */}
        {step === 'nation' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select the nation whose club you want to manage.
            </Typography>
            <Grid container spacing={2}>
              {availableNations.map(c => {
                const colors = COUNTRY_COLORS[c.id as CountryId];
                const teamCount = c.divisions.reduce((n, d) => n + d.teams.length, 0);
                return (
                  <Grid key={c.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <ButtonBase
                      onClick={() => { setSelectedNation(c); setStep('team'); }}
                      sx={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left',
                        p: 2, borderRadius: 1, bgcolor: 'background.paper',
                        border: '1px solid', borderColor: 'divider',
                        borderLeftColor: colors.primary, borderLeftWidth: 5,
                        transition: 'background-color 0.15s',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <FlagIcon countryId={c.id} size={28} style={{ borderRadius: 3 }} />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.divisions.length} divisions · {teamCount} clubs
                        </Typography>
                      </Box>
                    </ButtonBase>
                  </Grid>
                );
              })}
            </Grid>
          </>
        )}

        {/* ── step 3: team select ─────────────────────────────────────────── */}
        {step === 'team' && selectedNation && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select the club you want to manage in {selectedNation.name}.
            </Typography>
            {selectedNation.divisions.map(d => (
              <Box key={d.id} sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {d.name}
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {d.teams.map(t => (
                    <ButtonBase
                      key={t.id}
                      onClick={() => startGame(t.id, [...selectedLeagueIds])}
                      sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        py: 1, px: 1.5, minWidth: 140, borderRadius: 1,
                        bgcolor: t.colors.primary, color: t.colors.secondary,
                        border: '1px solid rgba(0,0,0,0.12)',
                        transition: 'filter 0.15s',
                        '&:hover': { filter: 'brightness(0.88)' },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, textAlign: 'left', color: 'inherit' }}>
                        {t.name}
                      </Typography>
                    </ButtonBase>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

      </Box>
    </Box>
  );
}
