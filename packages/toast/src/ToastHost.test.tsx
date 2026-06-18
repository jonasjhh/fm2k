import { render, screen, act } from '@testing-library/react';
import { ToastHost } from './ToastHost.tsx';
import { useToastStore, showToast } from './toast-store.ts';

beforeEach(() => { useToastStore.getState().clear(); });

describe('ToastHost:', () => {
  it('renders an active toast message', () => {
    render(<ToastHost />);
    act(() => { showToast('Saved!', 'success', 0); });
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastHost />);
    expect(container.querySelector('.MuiAlert-root')).toBeNull();
  });
});
