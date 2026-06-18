import { transferWindow, PRE_SEASON_WINDOW_LENGTH, MID_SEASON_WINDOW_LENGTH } from './transfer-window.ts';

describe('transferWindow:', () => {
  const TOTAL = 30;

  it('is open pre-season at the start', () => {
    const w = transferWindow(0, TOTAL);
    expect(w.open).toBe(true);
    expect(w.kind).toBe('pre_season');
    expect(w.closesOnMatchday).toBe(PRE_SEASON_WINDOW_LENGTH);
  });

  it('closes after the pre-season window length', () => {
    expect(transferWindow(PRE_SEASON_WINDOW_LENGTH - 1, TOTAL).open).toBe(true);
    expect(transferWindow(PRE_SEASON_WINDOW_LENGTH, TOTAL).open).toBe(false);
  });

  it('reopens for a mid-season window around the halfway point', () => {
    const mid = Math.floor(TOTAL / 2);
    expect(transferWindow(mid - 1, TOTAL).open).toBe(false);
    const w = transferWindow(mid, TOTAL);
    expect(w.open).toBe(true);
    expect(w.kind).toBe('mid_season');
    expect(transferWindow(mid + MID_SEASON_WINDOW_LENGTH - 1, TOTAL).open).toBe(true);
    expect(transferWindow(mid + MID_SEASON_WINDOW_LENGTH, TOTAL).open).toBe(false);
  });

  it('is shut in the run-in', () => {
    expect(transferWindow(TOTAL - 1, TOTAL).open).toBe(false);
  });
});
