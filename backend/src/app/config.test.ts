import { ALL_POSITIONS, CUP_ROUND_NAMES, cupCompetitionId } from './config.ts';

describe('config:', () => {
  test('ALL_POSITIONS lists every outfield and goalkeeper position', () => {
    expect(ALL_POSITIONS).toEqual([
      'GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST',
    ]);
  });

  test('CUP_ROUND_NAMES is ordered from first round to final', () => {
    expect(CUP_ROUND_NAMES[0]).toBe('Round 1');
    expect(CUP_ROUND_NAMES[CUP_ROUND_NAMES.length - 1]).toBe('Final');
  });

  test('cupCompetitionId derives a nation cup id', () => {
    expect(cupCompetitionId('norway')).toBe('norway-cup');
  });
});
