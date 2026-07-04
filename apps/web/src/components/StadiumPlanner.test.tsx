import { render, screen, fireEvent, within } from '@testing-library/react';
import type { StadiumSectorConfig } from '@fm2k/engine';
import StadiumPlanner from './StadiumPlanner';
import { calculateTotalChangeCost, calculateTotalCapacity } from '../utils/stadium';

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) { throw new Error('expected a value'); }
  return v;
}

function tierTemplateSelect() {
  // 0 = sector selector, 1 = structural tier template
  return must(screen.getAllByRole('combobox')[1]);
}

function sectors(overrides: Record<string, StadiumSectorConfig> = {}): Record<string, StadiumSectorConfig> {
  return {
    N: { type: 'open-bleacher', densityValue: 30 },
    S: { type: 'covered-grandstand', densityValue: 30 },
    E: { type: 'none', densityValue: 30 },
    W: { type: 'executive-suite', densityValue: 30 },
    ...overrides,
  };
}

function renderPlanner(overrides: Partial<React.ComponentProps<typeof StadiumPlanner>> = {}) {
  const onApply = vi.fn().mockReturnValue(true);
  const props = {
    clubName: 'Testers FC',
    committedSectors: sectors(),
    budget: 100_000_000,
    onApply,
    ...overrides,
  };
  const utils = render(<StadiumPlanner {...props} />);
  return { ...utils, onApply, props };
}

describe('StadiumPlanner:', () => {
  test('renders all 8 sector click plates in the 3D scene', () => {
    const { container } = renderPlanner();
    const plates = container.querySelectorAll('[data-sector-plate]');
    expect(plates).toHaveLength(8);
  });

  test('shows committed capacity with no pending changes', () => {
    renderPlanner();
    const committed = calculateTotalCapacity(sectors());
    expect(screen.getByText('Total Capacity')).toBeInTheDocument();
    expect(screen.getAllByText(committed.toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Renovation Cost/)).not.toBeInTheDocument();
  });

  test('clicking a sector plate selects that stand in the detail panel', () => {
    const { container } = renderPlanner();
    // sector name shows in both the selector and the detail panel
    expect(screen.getAllByText('North Stand').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(must(container.querySelector('[data-sector-plate="W"]')));
    expect(screen.getAllByText('West Stand').length).toBeGreaterThanOrEqual(2);
  });

  test('clicking any 3D face of a stand selects that stand', () => {
    const { container } = renderPlanner();
    // pick a non-ground face (e.g. the roof of the South covered grandstand)
    const faces = container.querySelectorAll('[data-sector-face="S"]');
    expect(faces.length).toBeGreaterThan(0);
    fireEvent.click(must(faces[faces.length - 1]));
    expect(screen.getAllByText('South Stand').length).toBeGreaterThanOrEqual(2);
  });

  test('changing a stand type surfaces the renovation cost banner', () => {
    renderPlanner();
    const select = tierTemplateSelect();
    fireEvent.mouseDown(select);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('3-Tier Colosseum Grandstand'));

    const expectedCost = calculateTotalChangeCost(
      sectors(),
      sectors({ N: { type: 'triple-tier', densityValue: 30 } }),
    );
    expect(screen.getByText(/Renovation Cost — 1 sector changed/)).toBeInTheDocument();
    // shown in both the banner and the per-sector chip (single sector changed)
    expect(screen.getAllByText(`£${expectedCost.toLocaleString()}`).length).toBeGreaterThan(0);
  });

  test('applying a change calls onApply with sectors, cost and new capacity', () => {
    const { onApply } = renderPlanner();
    const select = tierTemplateSelect();
    fireEvent.mouseDown(select);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('1-Tier Steep Supporters Kop'));

    fireEvent.click(screen.getByRole('button', { name: 'Apply Design' }));

    const planned = sectors({ N: { type: 'kop', densityValue: 30 } });
    expect(onApply).toHaveBeenCalledWith(
      planned,
      calculateTotalChangeCost(sectors(), planned),
      calculateTotalCapacity(planned),
    );
  });

  test('cannot afford: apply is disabled and labelled accordingly', () => {
    renderPlanner({ budget: 0 });
    const select = tierTemplateSelect();
    fireEvent.mouseDown(select);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('1-Tier Steep Supporters Kop'));

    expect(screen.getByRole('button', { name: 'Cannot Afford' })).toBeDisabled();
  });

  test('discard reverts pending changes', () => {
    renderPlanner();
    const select = tierTemplateSelect();
    fireEvent.mouseDown(select);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('1-Tier Steep Supporters Kop'));
    expect(screen.getByText(/Renovation Cost/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText(/Renovation Cost/)).not.toBeInTheDocument();
  });
});
