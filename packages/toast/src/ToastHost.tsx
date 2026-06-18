import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { useToastStore, type ToastType } from './toast-store.ts';

const SEVERITY: Record<ToastType, 'info' | 'success' | 'error' | 'warning'> = {
  info: 'info',
  success: 'success',
  error: 'error',
  warning: 'warning',
};

/**
 * Renders the active toasts fixed to the bottom-right, stacked newest at the bottom, each
 * dismissible. Mount once near the app root; it subscribes to the shared toast store.
 */
export function ToastHost() {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1400,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 360,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <Alert
          key={t.id}
          severity={SEVERITY[t.type]}
          variant="filled"
          onClose={() => dismiss(t.id)}
          sx={{
            pointerEvents: 'auto',
            boxShadow: 3,
            fontWeight: 600,
            '@keyframes toastIn': {
              from: { opacity: 0, transform: 'translateX(16px)' },
              to: { opacity: 1, transform: 'translateX(0)' },
            },
            animation: 'toastIn 0.25s ease',
          }}
        >
          {t.message}
        </Alert>
      ))}
    </Box>
  );
}
