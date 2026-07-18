import { render, screen } from '@testing-library/react';
import { FitnessBar } from './FitnessBar';

describe('FitnessBar:', () => {
  test('shows the fitness number on the bar', () => {
    render(<FitnessBar fitness={73} />);
    expect(screen.getByText('73')).toBeInTheDocument();
  });

  test('rounds a fractional fitness value', () => {
    render(<FitnessBar fitness={73.6} />);
    expect(screen.getByText('74')).toBeInTheDocument();
  });

  test.each([
    [100, 'colorSuccess'],
    [85, 'colorSuccess'],
    [84, 'colorWarning'],
    [60, 'colorWarning'],
    [59, 'colorError'],
    [0, 'colorError'],
  ])('fitness %i renders the %s tier', (fitness, expectedClass) => {
    const { container } = render(<FitnessBar fitness={fitness} />);
    const bar = container.querySelector('.MuiLinearProgress-root');
    expect(bar?.className).toContain(expectedClass);
  });
});
