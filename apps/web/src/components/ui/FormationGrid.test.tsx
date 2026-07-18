import { render, screen } from '@testing-library/react';
import type { Player, PlayerAttributes } from '@fm2k/engine';
import { FormationGrid } from './FormationGrid';

const ATTRS: PlayerAttributes = {
  speed: 60, strength: 60, passing: 60, finishing: 60,
  technique: 60, defending: 60, stamina: 60, goalkeeping: 10,
};

function player(id: string, position: Player['position']): Player {
  return { id, name: id, nationality: 'n', age: 25, position, potential: 70, attributes: ATTRS };
}

const COLORS = { primary: '#000', secondary: '#fff' };

describe('FormationGrid:', () => {
  test('a 4-2-3-1 layout renders the same 6 band rows as a 4-4-2 (GK + 5 fixed bands)', () => {
    const lines442 = [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']];
    const squad442: Player[] = [
      player('gk', 'GK'), player('lb', 'LB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
      player('lm', 'LM'), player('cm1', 'CM'), player('cm2', 'CM'), player('rm', 'RM'),
      player('st1', 'ST'), player('st2', 'ST'),
    ];
    const slots442 = squad442.map(p => p.id);
    const { container: c442 } = render(
      <FormationGrid lines={lines442} slotAssignments={slots442} squad={squad442} teamColors={COLORS} />,
    );
    const rows442 = c442.firstElementChild?.children.length;

    const lines4231 = [['GK'], ['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['AM', 'AM', 'AM'], ['ST']];
    const squad4231: Player[] = [
      player('gk', 'GK'), player('lb', 'LB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
      player('dm1', 'CM'), player('dm2', 'CM'), player('am1', 'CM'), player('am2', 'CM'), player('am3', 'CM'),
      player('st1', 'ST'),
    ];
    const slots4231 = squad4231.map(p => p.id);
    const { container: c4231 } = render(
      <FormationGrid lines={lines4231} slotAssignments={slots4231} squad={squad4231} teamColors={COLORS} />,
    );
    const rows4231 = c4231.firstElementChild?.children.length;

    expect(rows442).toBe(6);
    expect(rows4231).toBe(6);
  });

  test('a player with a shape entry renders in that band with a derived role, not the template one', () => {
    const lines = [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']];
    const squad: Player[] = [
      player('gk', 'GK'), player('lb', 'LB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
      player('lm', 'LM'), player('cm1', 'CM'), player('cm2', 'CM'), player('rm', 'RM'),
      player('st1', 'ST'), player('st2', 'ST'),
    ];
    const slotAssignments = squad.map(p => p.id);
    const shape = { cb1: { band: 'ATT' as const, lateral: 0 } };
    render(
      <FormationGrid
        lines={lines} slotAssignments={slotAssignments} squad={squad}
        teamColors={COLORS} shape={shape}
      />,
    );
    expect(screen.getAllByText('ST')).toHaveLength(3); // st1, st2, and cb1 moved into the ATT band
    expect(screen.getAllByText('CB')).toHaveLength(1); // only cb2 retains the template role
  });

  test('an empty slot renders at the template position with no name', () => {
    const lines = [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']];
    const squad: Player[] = [
      player('gk', 'GK'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'),
      player('lm', 'LM'), player('cm1', 'CM'), player('cm2', 'CM'), player('rm', 'RM'),
      player('st1', 'ST'), player('st2', 'ST'),
    ];
    const slotAssignments = ['gk', null, 'cb1', 'cb2', 'rb', 'lm', 'cm1', 'cm2', 'rm', 'st1', 'st2'];
    render(
      <FormationGrid lines={lines} slotAssignments={slotAssignments} squad={squad} teamColors={COLORS} />,
    );
    expect(screen.getByText('LB')).toBeInTheDocument();
  });
});
