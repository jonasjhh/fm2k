'use client';

import { createContext, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from './theme';
import { useGameStore } from './store/game-store';
import MainMenu from './screens/MainMenu';
import TeamSelection from './screens/TeamSelection';
import TeamEditor from './screens/TeamEditor';
import GameInterface from './screens/GameInterface';

export const ColorModeContext = createContext({ toggle: () => {} });

export default function App() {
  const screen = useGameStore((s) => s.screen);

  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return (localStorage.getItem('fm2k-color-mode') as 'light' | 'dark') ?? 'light';
  });

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
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
