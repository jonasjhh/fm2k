import { GameSession } from './session.ts';
import { findTeamById } from '../domain/editable-country.ts';
import type { Player, PlayerAttributes } from '@fm2k/engine';

function attrs(v: number): PlayerAttributes {
  return {
    speed: v, strength: v, agility: v, passing: v, finishing: v,
    technique: v, defending: v, stamina: v, awareness: v, composure: v,
  };
}

/** First team in the default editable-country hierarchy (has a full squad). */
function firstTeam(s: GameSession) {
  for (const c of s.getEditableCountries()) {
    for (const d of c.divisions) {
      if (d.teams.length > 0) { return d.teams[0]; }
    }
  }
  throw new Error('no team found');
}

const teamOf = (s: GameSession, id: string) => findTeamById(s.getEditableCountries(), id)!;

describe('GameSession pre-game editor:', () => {
  describe('setEditableCountries / getEditableCountries', () => {
    test('stores and returns the provided countries', () => {
      const s = new GameSession();
      const one = s.getEditableCountries().slice(0, 1);
      s.setEditableCountries(one);
      expect(s.getEditableCountries()).toHaveLength(1);
    });
  });

  describe('updateTeamName', () => {
    test('trims surrounding whitespace', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      s.updateTeamName(team.id, '  New Name  ');
      expect(teamOf(s, team.id).name).toBe('New Name');
    });

    test('keeps the existing name when the new name is blank', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const original = team.name;
      s.updateTeamName(team.id, '   ');
      expect(teamOf(s, team.id).name).toBe(original);
    });
  });

  describe('updateTeamFormation', () => {
    test('sets the formation', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      s.updateTeamFormation(team.id, '4-3-3');
      expect(teamOf(s, team.id).formation).toBe('4-3-3');
    });
  });

  describe('updatePlayerData', () => {
    test('updates only the matching player', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const [p0, p1] = team.starters;
      s.updatePlayerData(team.id, p0.id, { name: 'EDITED' });

      const t = teamOf(s, team.id);
      expect(t.starters.find(p => p.id === p0.id)!.name).toBe('EDITED');
      expect(t.starters.find(p => p.id === p1.id)!.name).toBe(p1.name);
    });
  });

  describe('regeneratePlayer', () => {
    test('regenerates only the target, preserving its id and position', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const [p0, p1] = team.starters;
      s.regeneratePlayer(team.id, p0.id);

      const t = teamOf(s, team.id);
      const newP0 = t.starters.find(p => p.id === p0.id)!;
      expect(newP0.id).toBe(p0.id);
      expect(newP0.position).toBe(p0.position);
      expect(newP0).not.toBe(p0);                              // target was replaced
      expect(t.starters.find(p => p.id === p1.id)).toBe(p1);   // others untouched
    });
  });

  describe('removePlayer', () => {
    test('removes a starter and leaves substitutes intact', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const target = team.starters[0];
      const startersBefore = team.starters.length;
      const subsBefore = team.substitutes.length;

      s.removePlayer(team.id, target.id);

      const t = teamOf(s, team.id);
      expect(t.starters).toHaveLength(startersBefore - 1);
      expect(t.starters.some(p => p.id === target.id)).toBe(false);
      expect(t.substitutes).toHaveLength(subsBefore);
    });

    test('removes a substitute', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const target = team.substitutes[0];
      const subsBefore = team.substitutes.length;

      s.removePlayer(team.id, target.id);

      const t = teamOf(s, team.id);
      expect(t.substitutes).toHaveLength(subsBefore - 1);
      expect(t.substitutes.some(p => p.id === target.id)).toBe(false);
    });
  });

  describe('addGeneratedPlayer', () => {
    test('appends exactly one starter', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const before = team.starters.length;
      s.addGeneratedPlayer(team.id);
      expect(teamOf(s, team.id).starters).toHaveLength(before + 1);
    });

    test('picks the position from the injected rng (index into ALL_POSITIONS)', () => {
      // rng 0 → ALL_POSITIONS[floor(0 * 13)] = 'GK'; rng 0.99 → ALL_POSITIONS[12] = 'CF'.
      const low = new GameSession(() => 0);
      const lowTeam = firstTeam(low);
      low.addGeneratedPlayer(lowTeam.id);
      const lowAdded = teamOf(low, lowTeam.id).starters.at(-1)!;
      expect(lowAdded.position).toBe('GK');

      const high = new GameSession(() => 0.99);
      const highTeam = firstTeam(high);
      high.addGeneratedPlayer(highTeam.id);
      const highAdded = teamOf(high, highTeam.id).starters.at(-1)!;
      expect(highAdded.position).toBe('CF');
    });
  });

  describe('addPlayer', () => {
    test('appends the given player with a generated id', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      const before = team.starters.length;
      const incoming: Omit<Player, 'id'> = {
        name: 'Newbie', nationality: 'norwegian', age: 20, position: 'ST', potential: 80, attributes: attrs(75),
      };

      s.addPlayer(team.id, incoming);

      const t = teamOf(s, team.id);
      expect(t.starters).toHaveLength(before + 1);
      const added = t.starters[t.starters.length - 1];
      expect(added.name).toBe('Newbie');
      expect(added.id).toBeTruthy();
    });
  });

  describe('generateFullTeam', () => {
    test('builds 11 starters and 4 substitutes', () => {
      const s = new GameSession();
      const team = firstTeam(s);
      s.generateFullTeam(team.id);

      const t = teamOf(s, team.id);
      expect(t.starters).toHaveLength(11);
      expect(t.substitutes).toHaveLength(4);
    });
  });
});
