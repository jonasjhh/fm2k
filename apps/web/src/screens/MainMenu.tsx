'use client';
import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import EditIcon from '@mui/icons-material/Edit';
import BugReportIcon from '@mui/icons-material/BugReport';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Link from 'next/link';
import { useGameStore } from '../store/game-store';
import SettingsDialog from '../components/ui/SettingsDialog';
import LoadGameDialog from '../components/ui/LoadGameDialog';
import { readAllSaves } from '@fm2k/backend';

const FEATURES = ['8 nations', '384 clubs', 'Transfer market', 'Club facilities', 'Full season'];

export default function MainMenu() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [hasSaves, setHasSaves] = useState(false);

  useEffect(() => {
    readAllSaves().then(saves => setHasSaves(saves.length > 0));
  }, []);

  const handleLoadOpen = () => {
    setLoadOpen(true);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#07150a',
        backgroundImage: [
          'repeating-linear-gradient(0deg, transparent, transparent 72px, rgba(255,255,255,0.022) 72px, rgba(255,255,255,0.022) 144px)',
          'repeating-linear-gradient(90deg, transparent, transparent 72px, rgba(255,255,255,0.012) 72px, rgba(255,255,255,0.012) 144px)',
        ].join(', '),
        position: 'relative',
        overflow: 'hidden',
        px: 2,
      }}
    >
      {/* centre glow */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(46,125,50,0.18) 0%, transparent 100%)',
      }} />

      <Box sx={{ position: 'relative', textAlign: 'center', maxWidth: 480, width: '100%' }}>

        {/* ── logo / title ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
          <SportsSoccerIcon sx={{ fontSize: 32, color: '#66BB6A' }} />
          <Typography sx={{
            fontSize: 13, fontWeight: 700, letterSpacing: 5,
            color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
          }}>
            Football Manager
          </Typography>
        </Box>

        <Typography sx={{
          fontSize: { xs: 96, sm: 128 },
          fontWeight: 900,
          lineHeight: 0.88,
          letterSpacing: -6,
          color: '#ffffff',
          mb: 1,
          userSelect: 'none',
        }}>
          2000
        </Typography>

        <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', mb: 5, letterSpacing: 0.5 }}>
          The next generation of football management
        </Typography>

        {/* ── menu buttons ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
          <Button
            variant="contained"
            size="large"
            endIcon={<ChevronRightIcon />}
            onClick={() => setScreen('team-selection')}
            sx={{
              py: 1.75, px: 3, borderRadius: 2, fontSize: 15, fontWeight: 700,
              bgcolor: '#2E7D32', color: '#ffffff',
              boxShadow: '0 4px 24px rgba(46,125,50,0.45)',
              '&:hover': { bgcolor: '#388E3C', boxShadow: '0 4px 32px rgba(46,125,50,0.6)' },
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <SportsSoccerIcon fontSize="small" />
              Start New Game
            </Box>
          </Button>

          <Button
            variant="outlined"
            size="large"
            endIcon={<ChevronRightIcon />}
            disabled={!hasSaves}
            onClick={handleLoadOpen}
            sx={{
              py: 1.75, px: 3, borderRadius: 2, fontSize: 15, fontWeight: 700,
              borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)',
              '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.05)' },
              '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <FolderOpenIcon fontSize="small" />
              Load Game
            </Box>
          </Button>

          <Button
            variant="outlined"
            size="large"
            endIcon={<ChevronRightIcon />}
            onClick={() => setScreen('editor')}
            sx={{
              py: 1.75, px: 3, borderRadius: 2, fontSize: 15, fontWeight: 700,
              borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)',
              '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.05)' },
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <EditIcon fontSize="small" />
              Team Editor
            </Box>
          </Button>

          <Button
            variant="outlined"
            size="large"
            onClick={() => setSettingsOpen(true)}
            sx={{
              py: 1.75, px: 3, borderRadius: 2, fontSize: 15, fontWeight: 700,
              borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)',
              '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.05)' },
              justifyContent: 'flex-start',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <SettingsIcon fontSize="small" />
              Settings
            </Box>
          </Button>
        </Box>

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <LoadGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} />

        {/* ── feature pills ────────────────────────────────────────────── */}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mb: 3 }} />
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mb: 4 }}>
          {FEATURES.map(f => (
            <Box
              key={f}
              sx={{
                px: 1.5, py: 0.5, borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.38)',
                fontSize: 11, fontWeight: 500,
              }}
            >
              {f}
            </Box>
          ))}
        </Box>

        {/* ── debug link ───────────────────────────────────────────────── */}
        <Button
          component={Link}
          href="/test"
          variant="text"
          size="small"
          startIcon={<BugReportIcon sx={{ fontSize: '14px !important' }} />}
          sx={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, '&:hover': { color: 'rgba(255,255,255,0.45)', bgcolor: 'transparent' } }}
        >
          Match Simulator Test
        </Button>

        <Typography sx={{ mt: 1.5, color: 'rgba(255,255,255,0.12)', fontSize: 10, letterSpacing: 0.5 }}>
          FM2000 v1.0 · Powered by FM2K Engine
        </Typography>
      </Box>
    </Box>
  );
}
