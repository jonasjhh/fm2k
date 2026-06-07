'use client';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import { useGameStore } from '../store/game-store';
import { useShallow } from 'zustand/react/shallow';
import type { TabId } from '../store/game-store';
import SquadTab from '../components/tabs/SquadTab';
import TacticsTab from '../components/tabs/TacticsTab';
import MatchTab from '../components/tabs/MatchTab';
import TableTab from '../components/tabs/TableTab';
import FixturesTab from '../components/tabs/FixturesTab';
import TransfersTab from '../components/tabs/TransfersTab';
import FacilitiesTab from '../components/tabs/FacilitiesTab';
import FinancesTab from '../components/tabs/FinancesTab';
import StatsBar from '../components/StatsBar';
import MatchSimOverlay from '../components/MatchSimOverlay';
import SeasonEndModal from '../components/SeasonEndModal';

const TABS: { id: TabId; label: string }[] = [
  { id: 'squad', label: 'Squad' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'match', label: 'Match' },
  { id: 'table', label: 'Table' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'finances', label: 'Finances' },
];

import { useMemo } from 'react';
import { getContrastColor } from '../utils/colors';
import { findTeamById } from '../store/game-store';

export default function GameInterface() {
  const { activeTab, setActiveTab, setScreen, clubState, playerTeamId, editableCountries } = useGameStore(useShallow((s) => ({
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    setScreen: s.setScreen,
    clubState: s.clubState,
    playerTeamId: s.playerTeamId,
    editableCountries: s.editableCountries,
  })));

  const clubColors = useMemo(() => {
    if (!playerTeamId) return { primary: '#1B5E20', secondary: '#FFFFFF' };
    return findTeamById(editableCountries, playerTeamId)?.colors ?? { primary: '#1B5E20', secondary: '#FFFFFF' };
  }, [editableCountries, playerTeamId]);
  const textColor = getContrastColor(clubColors.primary);

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
            onClick={() => setScreen('main-menu')}
            sx={{
              color: 'inherit',
              borderColor: `${textColor}40`,
              border: '1px solid',
              '&:hover': { bgcolor: `${textColor}14` },
            }}
          >
            Main Menu
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
        {activeTab === 'facilities' && <FacilitiesTab />}
        {activeTab === 'finances' && <FinancesTab />}
      </Box>

      <MatchSimOverlay />
      <SeasonEndModal />
    </Box>
  );
}
