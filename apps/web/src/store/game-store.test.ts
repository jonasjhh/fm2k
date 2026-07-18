// Integration test of the match-overlay open/close transitions against the REAL
// in-browser backend: playing or simulating the focus fixture opens the overlay,
// moving on (or explicitly closing) closes it.
vi.mock('@fm2k/toast', () => ({ showToast: vi.fn() }));

import { useGameStore } from './game-store';

const store = () => useGameStore.getState();

describe('game-store match overlay transitions:', () => {
  beforeAll(() => {
    const division = store().editableCountries[0].divisions[0];
    store().setSimDelay(0); // no ticker pacing — stream instantly
    store().startGame(division.teams[0].id, [division.id]);
    expect(store().focusFixture).not.toBeNull();
  });

  test('skipMatch (Simulate) opens the overlay on the completed fixture', async () => {
    expect(store().matchOverlayOpen).toBe(false);
    await store().skipMatch();
    expect(store().matchOverlayOpen).toBe(true);
    expect(store().focusFixture?.status).toBe('completed');
  });

  test('closeMatchOverlay and openMatchOverlay toggle it without touching the fixture', () => {
    store().closeMatchOverlay();
    expect(store().matchOverlayOpen).toBe(false);
    store().openMatchOverlay();
    expect(store().matchOverlayOpen).toBe(true);
    expect(store().focusFixture?.status).toBe('completed');
  });

  test('goToNextMatch closes the overlay and clears the ticker', () => {
    store().goToNextMatch();
    expect(store().matchOverlayOpen).toBe(false);
    expect(store().matchEvents).toEqual([]);
    expect(store().focusFixture?.status).toBe('scheduled');
  });

  test('advanceMatch (Play Match) opens the overlay and streams to the first stop', async () => {
    await store().advanceMatch();
    expect(store().matchOverlayOpen).toBe(true);
    expect(store().isStreaming).toBe(false);       // stopped at an intermission
    expect(store().focusLive).not.toBeNull();      // mid-match, not completed
    expect(store().matchEvents.length).toBeGreaterThan(0);
  });

  test('the overlay stays up through the rest of the live match', async () => {
    await store().skipMatch();                     // finish from mid-match
    expect(store().matchOverlayOpen).toBe(true);
    expect(store().focusFixture?.status).toBe('completed');
    store().goToNextMatch();
    expect(store().matchOverlayOpen).toBe(false);
  });
});
