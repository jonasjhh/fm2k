import { activePlayerWeight, selectActivePlayer } from './action-selector.ts';
import { BallPosition } from './types.ts';
import { Player, Position } from '../shared/types.ts';

function createTestPlayer(id: string, position: Position): Player {
  return {
    id,
    name: id,
    nationality: 'norwegian',
    age: 25,
    position,
    potential: 70,
    attributes: {
      speed: 70,
      strength: 70,
      agility: position === 'GK' ? 85 : 70,
      passing: 70,
      finishing: position === 'GK' ? 30 : 70,
      technique: 70,
      defending: ['CB', 'LB', 'RB', 'CDM'].includes(position) ? 85 : 50,
      stamina: 75,
      awareness: 70,
      composure: 70,
    },
  };
}

// A full XI mirroring the match-simulator test team (4-4-2).
function createTestXI(): Player[] {
  const spec: [string, Position][] = [
    ['gk1', 'GK'],
    ['cb1', 'CB'], ['cb2', 'CB'], ['lb1', 'LB'], ['rb1', 'RB'],
    ['cm1', 'CM'], ['cm2', 'CM'], ['lm1', 'LM'], ['rm1', 'RM'],
    ['st1', 'ST'], ['st2', 'ST'],
  ];
  return spec.map(([id, pos]) => createTestPlayer(id, pos));
}

const ALL_ZONES: BallPosition['zone'][] = [
  'home_box', 'home_third', 'middle_third', 'away_third', 'away_box',
];

describe('activePlayerWeight:', () => {
  const st = createTestPlayer('st', 'ST');
  const cb = createTestPlayer('cb', 'CB');
  const gk = createTestPlayer('gk', 'GK');

  it('favours attackers in the attacking box', () => {
    const ball: BallPosition = { zone: 'away_box', side: 'center' };
    expect(activePlayerWeight(st, ball)).toBeGreaterThan(activePlayerWeight(cb, ball));
  });

  it('favours defenders in the own box', () => {
    const ball: BallPosition = { zone: 'home_box', side: 'center' };
    expect(activePlayerWeight(cb, ball)).toBeGreaterThan(activePlayerWeight(st, ball));
  });

  it('gives the GK weight only in the own box', () => {
    expect(activePlayerWeight(gk, { zone: 'home_box', side: 'center' })).toBeGreaterThan(0);
    for (const zone of ALL_ZONES.filter(z => z !== 'home_box')) {
      expect(activePlayerWeight(gk, { zone, side: 'center' })).toBe(0);
    }
  });

  it('favours the matching flank over centre over the opposite flank', () => {
    const lm = createTestPlayer('lm', 'LM');
    const cm = createTestPlayer('cm', 'CM');
    const rm = createTestPlayer('rm', 'RM');
    const ball: BallPosition = { zone: 'middle_third', side: 'left' };
    expect(activePlayerWeight(lm, ball)).toBeGreaterThan(activePlayerWeight(cm, ball));
    expect(activePlayerWeight(cm, ball)).toBeGreaterThan(activePlayerWeight(rm, ball));
  });
});

describe('selectActivePlayer:', () => {
  function sample(ball: BallPosition, n = 4000): Record<string, number> {
    const xi = createTestXI();
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const p = selectActivePlayer(xi, ball);
      if (p) { counts[p.position] = (counts[p.position] ?? 0) + 1; }
    }
    return counts;
  }

  it('selects attackers far more than defenders in the attacking box', () => {
    const counts = sample({ zone: 'away_box', side: 'center' });
    const att = (counts.ST ?? 0);
    const def = (counts.CB ?? 0) + (counts.LB ?? 0) + (counts.RB ?? 0);
    expect(att).toBeGreaterThan(def);
    expect(counts.GK ?? 0).toBe(0);
  });

  it('selects defenders most often in the own box and occasionally the GK', () => {
    const counts = sample({ zone: 'home_box', side: 'center' });
    const def = (counts.CB ?? 0) + (counts.LB ?? 0) + (counts.RB ?? 0);
    const att = (counts.ST ?? 0);
    expect(def).toBeGreaterThan(att);
    expect(counts.GK ?? 0).toBeGreaterThan(0);
  });

  it('favours the matching flank in midfield', () => {
    const counts = sample({ zone: 'middle_third', side: 'left' });
    expect(counts.LM ?? 0).toBeGreaterThan(counts.RM ?? 0);
  });

  it('never selects the GK outside the own box', () => {
    for (const zone of ALL_ZONES.filter(z => z !== 'home_box')) {
      const counts = sample({ zone, side: 'center' }, 1000);
      expect(counts.GK ?? 0).toBe(0);
    }
  });

  it('returns players deterministically with an injected rng', () => {
    const xi = createTestXI();
    const ball: BallPosition = { zone: 'middle_third', side: 'center' };
    // rng=0 always picks the first weighted candidate in iteration order.
    const first = selectActivePlayer(xi, ball, () => 0);
    expect(first).toBe(selectActivePlayer(xi, ball, () => 0));
  });
});
