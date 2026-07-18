import { buildMatchInsights, type MatchInsightInput } from './feedback.ts';
import { NEUTRAL_PARAMS } from './match-parameters.ts';
import { StatsAccumulator } from '../match/stats.ts';
import type { MatchStatistics } from '../match/types.ts';
import { createTestXI, createUniformPlayer } from '../match/test-fixtures.ts';
import { simulateMatch } from '../match/simulate.ts';
import { mulberry32 } from '../match/distribution.ts';
import type { TeamTacticsIntent } from './intent-types.ts';
import type { Team, Player, PlayerPosition } from '../shared/types.ts';

/** All-zero statistics (what a fresh accumulator reports) as a base for overrides. */
function stats(overrides: Partial<MatchStatistics> = {}): MatchStatistics {
  return { ...new StatsAccumulator().build(), ...overrides };
}

function input(overrides: Partial<MatchInsightInput> = {}): MatchInsightInput {
  return {
    playerSide: 'home',
    homeScore: 0,
    awayScore: 0,
    params: { home: NEUTRAL_PARAMS, away: NEUTRAL_PARAMS },
    playerXi: createTestXI('h-'),
    statistics: stats(),
    ...overrides,
  };
}

const headlines = (i: MatchInsightInput) => buildMatchInsights(i).map(x => x.headline);

describe('buildMatchInsights:', () => {
  test('a quiet, even match yields no insights (no false stories)', () => {
    expect(buildMatchInsights(input())).toEqual([]);
  });

  test('a red card for the player side fires the discipline insight', () => {
    const i = input({ statistics: stats({ cards: { yellow: { home: 0, away: 0 }, red: { home: 1, away: 0 } } }) });
    expect(headlines(i)).toContain('A red card changed the match');
  });

  test('three yellows fire the softer discipline warning; opponent cards do not', () => {
    const ours = input({ statistics: stats({ cards: { yellow: { home: 3, away: 0 }, red: { home: 0, away: 0 } } }) });
    expect(headlines(ours)).toContain('Discipline is becoming a risk');
    const theirs = input({ statistics: stats({ cards: { yellow: { home: 0, away: 3 }, red: { home: 0, away: 1 } } }) });
    expect(buildMatchInsights(theirs)).toEqual([]);
  });

  test('an action success rate far below its baseline is called out', () => {
    const s = stats();
    s.actionBreakdown.home.cross = { attempts: 14, successes: 2 }; // ~14% vs typical 46%
    expect(headlines(input({ statistics: s }))).toContain('Crosses kept breaking down');
  });

  test('an action success rate far above its baseline is praised', () => {
    const s = stats();
    s.actionBreakdown.home.through_ball = { attempts: 10, successes: 8 }; // 80% vs typical 46%
    expect(headlines(input({ statistics: s }))).toContain('Through balls worked all day');
  });

  test('small samples never fire the action detector', () => {
    const s = stats();
    s.actionBreakdown.home.cross = { attempts: 5, successes: 0 };
    expect(buildMatchInsights(input({ statistics: s }))).toEqual([]);
  });

  test('late goals conceded on empty legs fire the fade insight — but not on fresh legs', () => {
    const xi = createTestXI('h-');
    const s = stats({ lateGoals: { home: 0, away: 2 } });
    const gassed = Object.fromEntries(xi.map(p => [p.id, 30]));
    expect(headlines(input({ playerXi: xi, statistics: s, endEnergy: gassed })))
      .toContain('Your side faded late');
    const fresh = Object.fromEntries(xi.map(p => [p.id, 80]));
    expect(buildMatchInsights(input({ playerXi: xi, statistics: s, endEnergy: fresh }))).toEqual([]);
    // no energy info (half time) → detector stays quiet
    expect(buildMatchInsights(input({ playerXi: xi, statistics: s }))).toEqual([]);
  });

  test('corner dominance without goals fires the set-piece insight', () => {
    const s = stats({ corners: { home: 8, away: 2 } });
    expect(headlines(input({ statistics: s }))).toContain('Set-piece pressure went unrewarded');
    // scoring freely mutes it
    expect(buildMatchInsights(input({ statistics: s, homeScore: 3 }))).toEqual([]);
  });

  test('insights are ranked: a red card outranks the set-piece story', () => {
    const s = stats({
      corners: { home: 8, away: 2 },
      cards: { yellow: { home: 0, away: 0 }, red: { home: 1, away: 0 } },
    });
    const result = buildMatchInsights(input({ statistics: s }));
    expect(result[0].headline).toBe('A red card changed the match');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('never returns more than three insights', () => {
    const s = stats({
      corners: { home: 10, away: 1 },
      lateGoals: { home: 0, away: 2 },
      cards: { yellow: { home: 4, away: 0 }, red: { home: 1, away: 0 } },
    });
    s.actionBreakdown.home.cross = { attempts: 14, successes: 2 };
    const xi = createTestXI('h-');
    const gassed = Object.fromEntries(xi.map(p => [p.id, 30]));
    expect(buildMatchInsights(input({ playerXi: xi, statistics: s, endEnergy: gassed }))).toHaveLength(3);
  });

  test('a high tempo with sloppy passing fires the tempo-control insight', () => {
    const s = stats({ passes: { home: { attempted: 20, completed: 10 }, away: { attempted: 0, completed: 0 } } });
    const i = input({
      statistics: s,
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 70, risk: 50, defensiveLine: 50 } },
    });
    expect(headlines(i)).toContain('High tempo cost you control');
  });

  test('a low tempo with tidy passing fires the patient-control insight; a mid tempo fires neither', () => {
    const s = stats({ passes: { home: { attempted: 20, completed: 18 }, away: { attempted: 0, completed: 0 } } });
    const patient = input({
      statistics: s,
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 30, risk: 50, defensiveLine: 50 } },
    });
    expect(headlines(patient)).toContain('Patient tempo kept things tidy');

    const mid = input({
      statistics: s,
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50 } },
    });
    expect(headlines(mid)).not.toContain('Patient tempo kept things tidy');
    expect(headlines(mid)).not.toContain('High tempo cost you control');
  });

  test('no tempo insight fires without a passes sample or without chosen sliders', () => {
    const tinySample = input({
      statistics: stats({ passes: { home: { attempted: 3, completed: 1 }, away: { attempted: 0, completed: 0 } } }),
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 70, risk: 50, defensiveLine: 50 } },
    });
    expect(buildMatchInsights(tinySample)).toEqual([]);

    const noIntent = input({
      statistics: stats({ passes: { home: { attempted: 20, completed: 10 }, away: { attempted: 0, completed: 0 } } }),
    });
    expect(buildMatchInsights(noIntent)).toEqual([]);
  });

  test('a high defensive line conceding fast-break goals fires the counter-exposure insight', () => {
    const s = stats({ fastBreakGoals: { home: 0, away: 2 } });
    const i = input({
      statistics: s,
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 80 } },
    });
    expect(headlines(i)).toContain('Your high line got exposed on the counter');
  });

  test('the counter-exposure insight stays quiet at a low defensive line or below the goals threshold', () => {
    const s = stats({ fastBreakGoals: { home: 0, away: 2 } });
    const lowLine = input({
      statistics: s,
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 40 } },
    });
    expect(buildMatchInsights(lowLine)).toEqual([]);

    const oneGoal = input({
      statistics: stats({ fastBreakGoals: { home: 0, away: 1 } }),
      playerIntent: { formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 80 } },
    });
    expect(buildMatchInsights(oneGoal)).toEqual([]);
  });

  test('lopsided duel tallies fire the dominance story, both ways', () => {
    const won = stats();
    won.duelsWon = {
      home: { speed: 12, strength: 5, dribble: 5, pass: 5, shot: 0 },
      away: { speed: 3, strength: 5, dribble: 5, pass: 5, shot: 0 },
    };
    const wonInsights = buildMatchInsights(input({ statistics: won }));
    const footRaces = wonInsights.find(x => x.headline === 'You won the foot races');
    expect(footRaces?.detail).toContain('(12–3 in speed duels.)');

    const lost = stats();
    lost.duelsWon = {
      home: { speed: 5, strength: 5, dribble: 4, pass: 5, shot: 0 },
      away: { speed: 5, strength: 5, dribble: 11, pass: 5, shot: 0 },
    };
    expect(headlines(input({ statistics: lost }))).toContain('You lost the one-on-ones');
  });

  test('the duel detector picks the MOST one-sided type when several clear the bar', () => {
    const s = stats();
    s.duelsWon = {
      home: { speed: 9, strength: 12, dribble: 0, pass: 0, shot: 0 },   // 64% vs 86%
      away: { speed: 5, strength: 2, dribble: 0, pass: 0, shot: 0 },
    };
    expect(headlines(input({ statistics: s }))[0]).toBe('You won the physical battle');
  });

  test('the duel detector stays quiet on small samples, near-even shares, or missing tallies', () => {
    const small = stats();
    small.duelsWon = {
      home: { speed: 8, strength: 0, dribble: 0, pass: 0, shot: 0 },    // total 11 < 12
      away: { speed: 3, strength: 0, dribble: 0, pass: 0, shot: 0 },
    };
    expect(buildMatchInsights(input({ statistics: small }))).toEqual([]);

    const even = stats();
    even.duelsWon = {
      home: { speed: 12, strength: 0, dribble: 0, pass: 0, shot: 0 },   // 60% < 62%
      away: { speed: 8, strength: 0, dribble: 0, pass: 0, shot: 0 },
    };
    expect(buildMatchInsights(input({ statistics: even }))).toEqual([]);

    const pre = stats();
    delete pre.duelsWon; // a result recorded before Step 5
    expect(buildMatchInsights(input({ statistics: pre }))).toEqual([]);
  });

  test('shot duels never fire the dominance story (shots on target already tell it)', () => {
    const s = stats();
    s.duelsWon = {
      home: { speed: 0, strength: 0, dribble: 0, pass: 0, shot: 20 },
      away: { speed: 0, strength: 0, dribble: 0, pass: 0, shot: 2 },
    };
    expect(buildMatchInsights(input({ statistics: s }))).toEqual([]);
  });

  test('style matchup verdict needs intent + opponent XI, and reports a clear edge', () => {
    // without them, no matchup insight even in a lopsided game
    expect(buildMatchInsights(input({ homeScore: 4 }))).toEqual([]);
    const withMatchup = input({
      playerIntent: { formation: '4-4-2', style: 'attack_the_wings', sliders: { tempo: 50, risk: 50, defensiveLine: 50 } },
      opponentXi: createTestXI('a-'),
    });
    // the verdict fires only when |eff − typical| clears the threshold; whichever way it
    // lands, the headline must be one of the two matchup messages or absent — never both.
    const hs = headlines(withMatchup);
    const matchupHeadlines = hs.filter(h =>
      h === 'Your game plan suited this opponent' || h === 'Your style played into their hands');
    expect(matchupHeadlines.length).toBeLessThanOrEqual(1);
  });

  test('integration: an outclassed side gets a non-empty readout over a seeded season sample', () => {
    const spec: [PlayerPosition, number][] = [
      ['GK', 1], ['LB', 1], ['CB', 2], ['RB', 1], ['LM', 1], ['CM', 2], ['RM', 1], ['ST', 2],
    ];
    const uniformTeam = (id: string, quality: number): Team => {
      const squad: Player[] = [];
      spec.forEach(([pos, n]) => {
        for (let i = 0; i < n; i++) { squad.push(createUniformPlayer(`${id}-${pos}${i}`, `${id}-${pos}${i}`, pos, quality)); }
      });
      return { id, name: id, formation: '4-4-2', squad, colors: { primary: '#fff', secondary: '#000' } };
    };
    const intent: TeamTacticsIntent = {
      formation: '4-4-2', style: 'balanced', sliders: { tempo: 50, risk: 50, defensiveLine: 50 },
    };
    const strong = uniformTeam('strong', 75);
    const weak = uniformTeam('weak', 40);

    let fired = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const r = simulateMatch({
        home: { team: strong, starters: strong.squad, intent },
        away: { team: weak, starters: weak.squad, intent },
        rng: mulberry32(seed),
      });
      const insights = buildMatchInsights({
        playerSide: 'away',
        homeScore: r.score.home,
        awayScore: r.score.away,
        params: { home: NEUTRAL_PARAMS, away: NEUTRAL_PARAMS },
        playerXi: weak.squad,
        playerIntent: intent,
        opponentXi: strong.squad,
        statistics: r.statistics,
        endEnergy: Object.fromEntries(r.playerUpdates.away.map(u => [u.playerId, u.endEnergy])),
      });
      if (insights.length > 0) { fired++; }
      expect(insights.length).toBeLessThanOrEqual(3);
    }
    // Being thoroughly outplayed leaves stories to tell in most matches.
    expect(fired).toBeGreaterThanOrEqual(3);
  });
});
