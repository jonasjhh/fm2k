import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SectionHeader } from './SectionHeader.tsx';
import { StatsCard } from './StatsCard.tsx';
import { Flag } from './Flag.tsx';
import { ConfirmProvider, useConfirm, useAlert } from './ConfirmProvider.tsx';
import { SelectorPanel } from './SelectorPanel.tsx';
import { ButtonSelector } from './ButtonSelector.tsx';
import { FormBadge } from './FormBadge.tsx';

describe('SectionHeader:', () => {
  it('renders the title and optional action', () => {
    render(<SectionHeader title="Squad" action={<button>Add</button>} />);
    expect(screen.getByText('Squad')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('StatsCard:', () => {
  it('renders a label and value', () => {
    render(<StatsCard label="Budget" value="£1.0M" />);
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('£1.0M')).toBeInTheDocument();
  });
});

describe('Flag:', () => {
  it('renders the flag-icons class for the given ISO code', () => {
    const { container } = render(<Flag code="no" />);
    expect(container.querySelector('.fi.fi-no')).not.toBeNull();
  });
});

describe('SelectorPanel:', () => {
  it('renders its children', () => {
    render(<SelectorPanel><span>row content</span></SelectorPanel>);
    expect(screen.getByText('row content')).toBeInTheDocument();
  });
});

describe('ButtonSelector:', () => {
  const options = [
    { value: 'league', label: 'League', prefix: '🏟️' },
    { value: 'cup', label: 'Cup' },
  ] as const;

  it('renders the label, options and prefix, marking the current value selected', () => {
    render(<ButtonSelector label="View" options={[...options]} value="league" onChange={() => {}} />);
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('🏟️')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /League/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cup' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the clicked option through onChange', () => {
    const onChange = vi.fn();
    render(<ButtonSelector options={[...options]} value="league" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cup' }));
    expect(onChange).toHaveBeenCalledWith('cup');
  });

  it('fills the selected button with a custom activeColor when given', () => {
    render(<ButtonSelector options={[...options]} value="league" onChange={() => {}} activeColor="#123456" activeContrast="#ffffff" />);
    const selected = screen.getByRole('button', { name: /League/ });
    expect(selected).toHaveStyle({ backgroundColor: '#123456' });
  });
});

describe('FormBadge:', () => {
  it.each([
    ['W', 'colorSuccess'],
    ['D', 'colorWarning'],
    ['L', 'colorError'],
  ] as const)('%s renders a %s chip', (result, expectedClass) => {
    render(<FormBadge result={result} />);
    const chip = screen.getByText(result).closest('.MuiChip-root');
    expect(chip?.className).toContain(expectedClass);
  });
});

describe('ConfirmProvider:', () => {
  function ConfirmHarness({ onResult }: { onResult: (r: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <button onClick={async () => onResult(await confirm({
        title: 'Sell player', message: 'Sell Jane Doe for £1,000?', confirmLabel: 'Sell', destructive: true,
      }))}>
        trigger
      </button>
    );
  }

  function AlertHarness({ onDone }: { onDone: () => void }) {
    const alert = useAlert();
    return (
      <button onClick={async () => { await alert({ message: 'Insufficient budget.' }); onDone(); }}>
        trigger
      </button>
    );
  }

  it('confirm shows title/message/labels and resolves true on confirm', async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><ConfirmHarness onResult={r => results.push(r)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('trigger'));
    expect(await screen.findByText('Sell player')).toBeInTheDocument();
    expect(screen.getByText('Sell Jane Doe for £1,000?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    await waitFor(() => expect(results).toEqual([true]));
  });

  it('confirm resolves false on cancel and the dialog closes', async () => {
    const results: boolean[] = [];
    render(<ConfirmProvider><ConfirmHarness onResult={r => results.push(r)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('trigger'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(results).toEqual([false]));
  });

  it('alert shows an OK-only dialog and resolves when dismissed', async () => {
    let done = false;
    render(<ConfirmProvider><AlertHarness onDone={() => { done = true; }} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('trigger'));
    expect(await screen.findByText('Insufficient budget.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(done).toBe(true));
  });

  it('useConfirm outside the provider throws loudly', () => {
    const Bare = () => { useConfirm(); return null; };
    // Silence React's error boundary noise for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/within a <ConfirmProvider>/);
    spy.mockRestore();
  });
});
