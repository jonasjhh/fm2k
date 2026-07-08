import { createGameDateTime } from '@fm2k/timeline';
import {
  matchHeadline, transferHeadline, injuryHeadline,
  dangerManHeadline, formWatchHeadline, bookingHeadline, injuryAvertedHeadline, returnHeadline,
  UPSET_GAP, BLOWOUT_MARGIN,
} from './headlines.ts';
import type { FormLetter } from './types.ts';

const TS = createGameDateTime(2026, 3, 1);
const rngReturning = (v: number) => () => v;

describe('matchHeadline:', () => {
  it('returns null for an unremarkable, low-stakes draw or narrow result', () => {
    expect(matchHeadline({ homeTeamName: 'A', awayTeamName: 'B', homeScore: 1, awayScore: 1, timestamp: TS })).toBeNull();
    expect(matchHeadline({ homeTeamName: 'A', awayTeamName: 'B', homeScore: 2, awayScore: 1, timestamp: TS })).toBeNull();
  });

  it('generates a blowout headline once the goal margin reaches the threshold', () => {
    const article = matchHeadline({
      homeTeamName: 'Rovers', awayTeamName: 'United', homeScore: 5, awayScore: 0, timestamp: TS,
    }, rngReturning(0));
    expect(article?.category).toBe('blowout');
    expect(article?.headline).toContain('Rovers');
    expect(article?.headline).toContain('United');
  });

  it('falls just short of blowout one goal under the margin', () => {
    expect(matchHeadline({
      homeTeamName: 'A', awayTeamName: 'B', homeScore: BLOWOUT_MARGIN - 1, awayScore: 0, timestamp: TS,
    })).toBeNull();
  });

  it('prioritises an upset over a blowout when both conditions are met', () => {
    const article = matchHeadline({
      homeTeamName: 'Minnows', awayTeamName: 'Giants', homeScore: 5, awayScore: 0,
      homePosition: 18, awayPosition: 1, timestamp: TS,
    }, rngReturning(0));
    expect(article?.category).toBe('upset');
    expect(article?.headline).toContain('Minnows');
  });

  it('requires the underdog to have actually won, not just have a position gap', () => {
    // The favourite (position 1) won here, despite the big position gap — not an upset.
    const article = matchHeadline({
      homeTeamName: 'Giants', awayTeamName: 'Minnows', homeScore: 5, awayScore: 0,
      homePosition: 1, awayPosition: 18, timestamp: TS,
    }, rngReturning(0));
    expect(article?.category).toBe('blowout');
  });

  it('does not flag an upset below the position-gap threshold', () => {
    const article = matchHeadline({
      homeTeamName: 'A', awayTeamName: 'B', homeScore: 1, awayScore: 0,
      homePosition: 5, awayPosition: 5 + UPSET_GAP - 1, timestamp: TS,
    });
    expect(article).toBeNull();
  });

  it('picks a template deterministically by rng', () => {
    const a = matchHeadline({ homeTeamName: 'A', awayTeamName: 'B', homeScore: 5, awayScore: 0, timestamp: TS }, rngReturning(0));
    const b = matchHeadline({ homeTeamName: 'A', awayTeamName: 'B', homeScore: 5, awayScore: 0, timestamp: TS }, rngReturning(0.99));
    expect(a?.headline).not.toBe(b?.headline);
  });
});

describe('transferHeadline:', () => {
  it('uses a third-person template for an AI club\'s signing', () => {
    const article = transferHeadline({
      playerName: 'Jane Doe', teamName: 'Athletic', fee: 5_000_000, isPlayerClub: false, timestamp: TS,
    }, rngReturning(0));
    expect(article.category).toBe('transfer');
    expect(article.headline).toContain('Athletic');
    expect(article.headline).not.toMatch(/^You/);
  });

  it('uses a personal template when the player\'s own club is involved', () => {
    const article = transferHeadline({
      playerName: 'Jane Doe', teamName: 'My Club', fee: 1_000_000, isPlayerClub: true, timestamp: TS,
    }, rngReturning(0));
    expect(article.headline).toContain('Jane Doe');
  });
});

describe('injuryHeadline:', () => {
  it('interpolates the player and injury type', () => {
    const article = injuryHeadline({ playerName: 'Jane Doe', injuryType: 'hamstring strain', timestamp: TS }, rngReturning(1));
    expect(article.category).toBe('injury');
    expect(article.headline).toContain('Jane Doe');
  });
});

describe('dangerManHeadline:', () => {
  it('interpolates the opposition star and picks templates deterministically by rng', () => {
    const a = dangerManHeadline({ playerName: 'Erik Berg', teamName: 'Rosenborg', position: 'ST', timestamp: TS }, rngReturning(0));
    expect(a.category).toBe('preview');
    expect(a.headline).toContain('Erik Berg');
    const b = dangerManHeadline({ playerName: 'Erik Berg', teamName: 'Rosenborg', position: 'ST', timestamp: TS }, rngReturning(0.99));
    expect(b.headline).not.toBe(a.headline);
  });
});

describe('formWatchHeadline:', () => {
  const form = (s: string): FormLetter[] => s.split('') as FormLetter[];

  it('a hot streak (4+ wins in 5) produces a form article', () => {
    const article = formWatchHeadline({ teamName: 'Rosenborg', form: form('WWWWL'), timestamp: TS }, rngReturning(0));
    expect(article?.category).toBe('form');
    expect(article?.headline).toContain('Rosenborg');
  });

  it('a slump (4+ winless in 5) produces a crisis article', () => {
    const article = formWatchHeadline({ teamName: 'Rosenborg', form: form('LDLLW'), timestamp: TS }, rngReturning(0));
    expect(article?.category).toBe('form');
  });

  it('mixed form is not a story', () => {
    expect(formWatchHeadline({ teamName: 'A', form: form('WWLLD'), timestamp: TS })).toBeNull();
    expect(formWatchHeadline({ teamName: 'A', form: form('WWWLL'), timestamp: TS })).toBeNull();
  });

  it('fewer than 5 completed matches (early season) is never a story, however good', () => {
    expect(formWatchHeadline({ teamName: 'A', form: form('WWWW'), timestamp: TS })).toBeNull();
    expect(formWatchHeadline({ teamName: 'A', form: [], timestamp: TS })).toBeNull();
  });
});

describe('bookingHeadline:', () => {
  it('names the sent-off player under the discipline category', () => {
    const article = bookingHeadline({ playerName: 'Jane Doe', timestamp: TS }, rngReturning(0));
    expect(article.category).toBe('discipline');
    expect(article.headline).toContain('Jane Doe');
  });
});

describe('injuryAvertedHeadline:', () => {
  it('frames the scare as cleared, under the injury category', () => {
    const article = injuryAvertedHeadline({ playerName: 'Jane Doe', injuryType: 'knee knock', timestamp: TS }, rngReturning(0));
    expect(article.category).toBe('injury');
    expect(article.headline).toContain('Jane Doe');
  });
});

describe('returnHeadline:', () => {
  it('celebrates the comeback with the matches missed', () => {
    const article = returnHeadline({ playerName: 'Jane Doe', matchesMissed: 6, timestamp: TS }, rngReturning(0));
    expect(article.category).toBe('injury');
    expect(article.headline).toContain('Jane Doe');
    expect(article.headline).toContain('6');
  });
});
