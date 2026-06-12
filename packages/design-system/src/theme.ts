import { createTheme } from '@mui/material/styles';

export function createAppTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary: mode === 'dark'
        ? { main: '#66BB6A', light: '#98ee99', dark: '#338a3e', contrastText: '#000000' }
        : { main: '#1B5E20', light: '#43A047', dark: '#004d00', contrastText: '#ffffff' },
      secondary: mode === 'dark'
        ? { main: '#FF8A65', light: '#FFB74D', dark: '#E64A19', contrastText: '#000000' }
        : { main: '#E65100', light: '#FF8A65', dark: '#BF360C', contrastText: '#ffffff' },
      success: {
        main: '#2E7D32',
      },
      error: {
        main: '#C62828',
      },
      warning: {
        main: '#F9A825',
      },
      background: mode === 'dark'
        ? { default: '#0d1f0f', paper: '#162a18' }
        : { default: '#F1F8F1', paper: '#FFFFFF' },
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingTop: 0,
            paddingBottom: 0,
            fontSize: '0.8rem',
            minWidth: 80,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& th': {
              fontWeight: 700,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
          },
        },
      },
    },
  });
}
