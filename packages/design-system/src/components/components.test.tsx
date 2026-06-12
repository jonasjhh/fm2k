import { render, screen } from '@testing-library/react';
import { SectionHeader } from './SectionHeader.tsx';
import { StatsCard } from './StatsCard.tsx';
import { Flag } from './Flag.tsx';

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
