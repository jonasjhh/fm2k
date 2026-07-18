// Shared test fixtures for the match package's specs — one place for the standard
// 4-4-2 test squads instead of a per-file copy. Two attribute profiles exist because
// the suites were calibrated against them: `createTestPlayer` is position-aware
// (GK reflexes, defender-heavy back line), `createUniformPlayer` is flat.
// Not exported from the package index; test-only.
import type { Player, PlayerPosition, Team, Formation } from '../shared/types.ts';

/** Position-aware profile: strong GK goalkeeping/weak GK finishing, defending split by line. */
export function createTestPlayer(id: string, name: string, position: PlayerPosition): Player {
  return {
    id,
    name,
    nationality: 'norwegian',
    age: 25,
    position,
    potential: 70,
    attributes: {
      speed: 70,
      strength: 70,
      goalkeeping: position === 'GK' ? 85 : 10,
      passing: 70,
      finishing: position === 'GK' ? 30 : 70,
      technique: 70,
      defending: ['CB', 'LB', 'RB', 'DM'].includes(position) ? 85 : 50,
      stamina: 75,
    },
  };
}

/** Flat profile: every attribute = `quality` (stamina 75 kept for the 70 default). */
export function createUniformPlayer(id: string, name: string, position: PlayerPosition, quality = 70): Player {
  return {
    id, name, nationality: 'norwegian', age: 25, position, potential: quality,
    attributes: {
      speed: quality, strength: quality, passing: quality,
      finishing: quality, technique: quality, defending: quality,
      stamina: quality === 70 ? 75 : quality, goalkeeping: position === 'GK' ? quality : 10,
    },
  };
}

/** The standard 4-4-2 XI slot layout shared by every fixture team. */
const XI_SPEC: ReadonlyArray<readonly [slot: string, name: string, position: PlayerPosition]> = [
  ['gk1', 'Goalkeeper', 'GK'],
  ['lb1', 'Left Back', 'LB'],
  ['cb1', 'Centre Back 1', 'CB'],
  ['cb2', 'Centre Back 2', 'CB'],
  ['rb1', 'Right Back', 'RB'],
  ['lm1', 'Left Mid', 'LM'],
  ['cm1', 'Central Mid 1', 'CM'],
  ['cm2', 'Central Mid 2', 'CM'],
  ['rm1', 'Right Mid', 'RM'],
  ['st1', 'Striker 1', 'ST'],
  ['st2', 'Striker 2', 'ST'],
];

/** A position-aware 4-4-2 XI. `idPrefix` disambiguates ids when two teams share a match. */
export function createTestXI(idPrefix = ''): Player[] {
  return XI_SPEC.map(([slot, name, pos]) => createTestPlayer(`${idPrefix}${slot}`, name, pos));
}

export interface TestTeamOptions {
  /** Prepend to every player id (avoids id collisions between two fixture teams). */
  idPrefix?: string;
  /** Append the standard 3-player bench (sub1..sub3: CB/CM/ST). */
  withSubs?: boolean;
}

/** A full position-aware test team (4-4-2 XI, optional bench). */
export function createTestTeam(id: string, name: string, formation: Formation = '4-4-2', opts: TestTeamOptions = {}): Team {
  const prefix = opts.idPrefix ?? '';
  const squad = createTestXI(prefix);
  if (opts.withSubs) {
    squad.push(
      createTestPlayer(`${prefix}sub1`, 'Sub 1', 'CB'),
      createTestPlayer(`${prefix}sub2`, 'Sub 2', 'CM'),
      createTestPlayer(`${prefix}sub3`, 'Sub 3', 'ST'),
    );
  }
  return {
    id,
    name,
    formation,
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    squad,
    tactics: {
      attackingMentality: 'balanced',
      passingStyle: 'mixed',
      tempo: 'medium',
      width: 'balanced',
    },
  };
}

/** A flat-attribute 4-4-2 team with `${id}-` prefixed ids and position-label names. */
export function createUniformTeam(id: string, name: string): Team {
  const spec: ReadonlyArray<readonly [string, PlayerPosition]> = [
    ['gk', 'GK'], ['lb', 'LB'], ['cb1', 'CB'], ['cb2', 'CB'], ['rb', 'RB'],
    ['lm', 'LM'], ['cm1', 'CM'], ['cm2', 'CM'], ['rm', 'RM'], ['st1', 'ST'], ['st2', 'ST'],
  ];
  return {
    id,
    name,
    formation: '4-4-2',
    colors: { primary: '#FFFFFF', secondary: '#000000' },
    squad: spec.map(([slot, pos]) => createUniformPlayer(`${id}-${slot}`, slot.toUpperCase(), pos)),
  };
}
