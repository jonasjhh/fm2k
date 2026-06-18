'use client';

import { createContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '@fm2k/design-system';
import { ToastHost } from '@fm2k/toast';
import { useGameStore } from './store/game-store';
import MainMenu from './screens/MainMenu';
import TeamSelection from './screens/TeamSelection';
import TeamEditor from './screens/TeamEditor';
import GameInterface from './screens/GameInterface';

export const ColorModeContext = createContext({ toggle: () => {} });

export default function App() {
  const screen = useGameStore((s) => s.screen);

  // Start with 'light' to match server — read localStorage after hydration to avoid mismatch
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('fm2k-color-mode') as 'light' | 'dark' | null;
    if (saved) {setMode(saved);}
  }, []);

  const colorMode = useMemo(() => ({
    toggle: () => setMode((m) => {
      const next = m === 'light' ? 'dark' : 'light';
      localStorage.setItem('fm2k-color-mode', next);
      return next;
    }),
  }), []);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {screen === 'main-menu' && <MainMenu />}
        {screen === 'team-selection' && <TeamSelection />}
        {screen === 'editor' && <TeamEditor />}
        {screen === 'game' && <GameInterface />}
        <ToastHost />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
