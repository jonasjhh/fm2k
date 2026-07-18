import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the error colour for hard-to-undo actions. */
  destructive?: boolean;
}

export interface AlertOptions {
  title?: string;
  message: string;
}

interface PendingPrompt extends ConfirmOptions {
  /** An alert is an OK-only prompt: no cancel button, always resolves true. */
  alertOnly: boolean;
}

interface ConfirmContextValue {
  prompt: (opts: PendingPrompt) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * App-wide replacement for the browser's blocking `confirm()`/`alert()`: mounts ONE
 * themed alert-style dialog and hands out promise-based triggers via `useConfirm`/
 * `useAlert`. Mount once inside the ThemeProvider; hooks throw when used outside it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const prompt = useCallback((opts: PendingPrompt): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // A new prompt while one is open dismisses the old one as cancelled.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPending(opts);
    });
  }, []);

  const settle = (confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ prompt }}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => settle(pending?.alertOnly ?? false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        {pending?.title && <DialogTitle sx={{ fontWeight: 700 }}>{pending.title}</DialogTitle>}
        <DialogContent sx={{ pt: pending?.title ? 0 : 3 }}>
          <DialogContentText sx={{ color: 'text.primary' }}>{pending?.message}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          {!pending?.alertOnly && (
            <Button onClick={() => settle(false)} color="inherit">
              {pending?.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button
            onClick={() => settle(true)}
            variant="contained"
            color={pending?.destructive ? 'error' : 'primary'}
            autoFocus
          >
            {pending?.alertOnly ? 'OK' : pending?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

function usePrompt(): ConfirmContextValue['prompt'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) { throw new Error('useConfirm/useAlert must be used within a <ConfirmProvider>'); }
  return ctx.prompt;
}

/** Promise-based confirm: `if (await confirm({ message: '…' })) { … }`. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const prompt = usePrompt();
  return useCallback((opts: ConfirmOptions) => prompt({ ...opts, alertOnly: false }), [prompt]);
}

/** Promise-based alert: OK-only message dialog, resolves when dismissed. */
export function useAlert(): (opts: AlertOptions) => Promise<void> {
  const prompt = usePrompt();
  return useCallback(async (opts: AlertOptions) => { await prompt({ ...opts, alertOnly: true }); }, [prompt]);
}
