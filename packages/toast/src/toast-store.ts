import { create } from 'zustand';

/**
 * A small toast-notification store, modelled on fm95's queued `showToast`: messages are shown
 * bottom-right, auto-dismiss after a duration, and stack rather than overwrite. Framework-agnostic
 * enough to fire from anywhere via `showToast(...)`; React consumers read it through `useToastStore`
 * and render with `<ToastHost/>`.
 */

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export const DEFAULT_TOAST_DURATION = 4000;
/** Cap visible toasts so a burst (e.g. several retirements) can't bury the screen. */
export const MAX_VISIBLE_TOASTS = 4;

interface ToastState {
  toasts: Toast[];
  /** Queue a toast; it auto-dismisses after `duration` ms (0 = sticky). Returns its id. */
  show: (message: string, type?: ToastType, duration?: number) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, type = 'info', duration = DEFAULT_TOAST_DURATION) => {
    const id = nextId++;
    set(state => ({ toasts: [...state.toasts, { id, message, type }].slice(-MAX_VISIBLE_TOASTS) }));
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },
  dismiss: id => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Fire a toast from non-React code (event handlers, store subscriptions, etc.). */
export function showToast(message: string, type: ToastType = 'info', duration = DEFAULT_TOAST_DURATION): number {
  return useToastStore.getState().show(message, type, duration);
}
