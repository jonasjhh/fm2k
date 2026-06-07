'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { useGameStore } from './store/game-store';
import MainMenu from './screens/MainMenu';
import TeamSelection from './screens/TeamSelection';
import TeamEditor from './screens/TeamEditor';
import GameInterface from './screens/GameInterface';

export default function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {screen === 'main-menu' && <MainMenu />}
      {screen === 'team-selection' && <TeamSelection />}
      {screen === 'editor' && <TeamEditor />}
      {screen === 'game' && <GameInterface />}
    </ThemeProvider>
  );
}
