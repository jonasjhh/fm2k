import { render, screen } from '@testing-library/react';
import { FitnessBar, fitnessColor } from './FitnessBar';

describe('FitnessBar:', () => {
  test('shows the fitness number on the bar', () => {
    render(<FitnessBar fitness={73} />);
    expect(screen.getByText('73')).toBeInTheDocument();
  });

  test('rounds a fractional fitness value', () => {
    render(<FitnessBar fitness={73.6} />);
    expect(screen.getByText('74')).toBeInTheDocument();
  });

  describe('fitnessColor', () => {
    test.each([
      [100, '#00cc44'],
      [95, '#00cc44'],
      [94, '#44aa22'],
      [85, '#44aa22'],
      [84, '#e8d000'],
      [70, '#e8d000'],
      [69, '#dd8800'],
      [55, '#dd8800'],
      [54, '#cc2200'],
      [40, '#cc2200'],
      [39, '#881030'],
      [0, '#881030'],
    ])('fitness %i → %s', (fitness, expected) => {
      expect(fitnessColor(fitness)).toBe(expected);
    });
  });
});
