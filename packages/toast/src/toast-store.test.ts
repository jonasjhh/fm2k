import { useToastStore, showToast, MAX_VISIBLE_TOASTS } from './toast-store.ts';

beforeEach(() => {
  useToastStore.getState().clear();
  vi.useRealTimers();
});

describe('toast store:', () => {
  it('shows a toast with a message and type', () => {
    showToast('Hello', 'success');
    const [t] = useToastStore.getState().toasts;
    expect(t.message).toBe('Hello');
    expect(t.type).toBe('success');
  });

  it('defaults to the info type', () => {
    showToast('Plain');
    expect(useToastStore.getState().toasts[0].type).toBe('info');
  });

  it('assigns unique ids', () => {
    const a = showToast('one');
    const b = showToast('two');
    expect(a).not.toBe(b);
  });

  it('dismisses a toast by id', () => {
    const id = showToast('bye', 'info', 0); // sticky
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('caps the number of visible toasts', () => {
    for (let i = 0; i < MAX_VISIBLE_TOASTS + 3; i++) { showToast(`t${i}`, 'info', 0); }
    expect(useToastStore.getState().toasts).toHaveLength(MAX_VISIBLE_TOASTS);
    // keeps the newest ones
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(`t${MAX_VISIBLE_TOASTS + 2}`);
  });

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers();
    showToast('temp', 'info', 1000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('a sticky toast (duration 0) does not auto-dismiss', () => {
    vi.useFakeTimers();
    showToast('stay', 'error', 0);
    vi.advanceTimersByTime(10_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
