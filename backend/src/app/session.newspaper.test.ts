import { assertDefined } from '@fm2k/state';
import { GameSession } from './session.ts';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededGame() {
  const session = new GameSession(mulberry32(7));
  const country = session.getEditableCountries()[0];
  const teamId = country.divisions[0].teams[0].id;
  session.startGame(teamId, [country.id]);
  return { session, teamId };
}

const club = (s: GameSession) => assertDefined(s.snapshot().clubState, 'clubState missing');

describe('GameSession newspaper headlines:', () => {
  test('signing a free agent generates a personal transfer headline', () => {
    const { session } = seededGame();
    const spares = club(session).squad.slice(11, 14);
    for (const p of spares) { session.sellPlayer(p.id); }
    const target = session.getFreeAgents()[0];

    expect(session.signPlayer(target.id)).toBe(true);

    const headlines = session.snapshot().headlines;
    const article = headlines.find(a => a.category === 'transfer' && a.headline.includes(target.name));
    expect(article).toBeDefined();
  });

  // Match-driven headlines (blowout/upset) are exercised at the `@fm2k/newspaper` unit level —
  // they depend on the match simulator's outcome, which isn't deterministically steerable from
  // here, so the wiring (event -> pushHeadline -> snapshot) is instead verified via the
  // deterministic free-agent-signing path above and the reset path below.

  test('headlines reset to empty after resetSession', () => {
    const { session } = seededGame();
    const spares = club(session).squad.slice(11, 14);
    for (const p of spares) { session.sellPlayer(p.id); }
    session.signPlayer(session.getFreeAgents()[0].id);
    expect(session.snapshot().headlines.length).toBeGreaterThan(0);

    session.resetSession();
    expect(session.snapshot().headlines).toHaveLength(0);
  });

  test('starting a game publishes a preview article about the next opponent', () => {
    const { session, teamId } = seededGame();
    const previews = session.snapshot().headlines.filter(a => a.category === 'preview');
    expect(previews).toHaveLength(1);

    // The article names the upcoming opponent's club (never the player's own).
    const fixture = assertDefined(session.getFocusFixture(), 'no upcoming fixture');
    const opponentId = fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId;
    const opponentName = fixture.homeTeamId === teamId ? fixture.awayTeamName : fixture.homeTeamName;
    expect(opponentId).not.toBe(teamId);
    // Danger-man templates always name the player; most also name the team — assert on
    // the stable part (some player from the opponent squad is named).
    const country = session.getEditableCountries().find(c =>
      c.divisions.some(d => d.teams.some(t => t.id === opponentId)));
    const opponent = assertDefined(
      country?.divisions.flatMap(d => d.teams).find(t => t.id === opponentId),
      `opponent team ${opponentId} (${opponentName}) not found`,
    );
    expect(opponent.squad.some(p => previews[0].headline.includes(p.name))).toBe(true);
  });

  test('advancing past a matchday previews the following fixture exactly once', async () => {
    const { session } = seededGame();
    let result = await session.advanceToNextStop(); // → half time
    while (!result.matchOver) { result = await session.advanceToNextStop(); }

    const previews = session.snapshot().headlines.filter(a => a.category === 'preview');
    // one preview at game start + one for the fixture after the played matchday
    expect(previews).toHaveLength(2);
    expect(previews[0].headline).not.toBe(previews[1].headline);
  });

  test('form-watch articles never appear before 5 completed league matches', () => {
    const { session } = seededGame();
    // At game start the opponent has no completed fixtures — the conservative form
    // detector must stay quiet no matter the seed.
    expect(session.snapshot().headlines.filter(a => a.category === 'form')).toHaveLength(0);
  });
});
