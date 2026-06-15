'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import Snackbar from '@mui/material/Snackbar';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { TabId } from '../store/game-store';
import SquadTab from '../components/tabs/SquadTab';
import TacticsTab from '../components/tabs/TacticsTab';
import MatchTab from '../components/tabs/MatchTab';
import TableTab from '../components/tabs/TableTab';
import FixturesTab from '../components/tabs/FixturesTab';
import TransfersTab from '../components/tabs/TransfersTab';
import ClubTab from '../components/tabs/ClubTab';
import FinancesTab from '../components/tabs/FinancesTab';
import StatsBar from '../components/StatsBar';
import SeasonEndModal from '../components/SeasonEndModal';
import SettingsDialog from '../components/ui/SettingsDialog';

const TABS: { id: TabId; label: string }[] = [
  { id: 'squad', label: 'Squad' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'match', label: 'Match' },
  { id: 'table', label: 'Competitions' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'club', label: 'Club' },
  { id: 'finances', label: 'Finances' },
];

import { useClubColors } from '../hooks/useClubColors';

export default function GameInterface() {
  const { activeTab, setActiveTab, setScreen, saveGame, clubState } = useGameStore(useShallow((s) => ({
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    setScreen: s.setScreen,
    saveGame: s.saveGame,
    clubState: s.clubState,
  })));

  const [snackOpen, setSnackOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const clubColors = useClubColors();
  const textColor = clubColors.contrast;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── club header ──────────────────────────────────────────────────────── */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 1100,
        bgcolor: clubColors.primary, color: textColor,
        borderBottom: `3px solid ${clubColors.secondary}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        <Toolbar variant="dense" sx={{ minHeight: 48, px: { xs: 1, sm: 2 } }}>
          <Typography variant="subtitle1" sx={{ mr: 2, fontWeight: 700, color: 'inherit' }}>
            ⚽ {clubState?.clubName ?? ''}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            size="small"
            onClick={() => { saveGame('QUICK'); setSnackOpen(true); }}
            sx={{
              mr: 1,
              color: 'inherit',
              borderColor: `${textColor}40`,
              border: '1px solid',
              '&:hover': { bgcolor: `${textColor}14` },
            }}
          >
            Save
          </Button>
          <IconButton
            size="small"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            sx={{
              mr: 1,
              color: 'inherit',
              borderColor: `${textColor}40`,
              border: '1px solid',
              borderRadius: 1,
              '&:hover': { bgcolor: `${textColor}14` },
            }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
          <Button
            size="small"
            onClick={async () => { await saveGame('AUTO'); setScreen('main-menu'); }}
            sx={{
              color: 'inherit',
              borderColor: `${textColor}40`,
              border: '1px solid',
              '&:hover': { bgcolor: `${textColor}14` },
            }}
          >
            Exit to Main Menu
          </Button>
        </Toolbar>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v as TabId)}
          variant="scrollable"
          scrollButtons="auto"
          textColor="inherit"
          slotProps={{ indicator: { style: { backgroundColor: clubColors.secondary, height: 3 } } }}
          sx={{
            '& .MuiTab-root': { color: textColor, opacity: 0.6 },
            '& .MuiTab-root.Mui-selected': { opacity: 1 },
          }}
        >
          {TABS.map((t) => (
            <Tab key={t.id} value={t.id} label={t.label} />
          ))}
        </Tabs>
      </Box>

      <StatsBar clubColors={clubColors} textColor={textColor} />

      <Box sx={{ flexGrow: 1, p: { xs: 1.5, sm: 2 }, maxWidth: 1200, width: '100%', mx: 'auto' }}>
        {activeTab === 'squad' && <SquadTab />}
        {activeTab === 'tactics' && <TacticsTab />}
        {activeTab === 'match' && <MatchTab />}
        {activeTab === 'table' && <TableTab />}
        {activeTab === 'fixtures' && <FixturesTab />}
        {activeTab === 'transfers' && <TransfersTab />}
        {activeTab === 'club' && <ClubTab />}
        {activeTab === 'finances' && <FinancesTab />}
      </Box>

      <SeasonEndModal />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Snackbar
        open={snackOpen}
        autoHideDuration={2000}
        onClose={() => setSnackOpen(false)}
        message="Game saved"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
