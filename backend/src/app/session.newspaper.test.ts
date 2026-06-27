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
});
