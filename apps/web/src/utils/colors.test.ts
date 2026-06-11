import { getContrastColor, leagueRowBg, STATUS_COLORS } from './colors';

describe('getContrastColor:', () => {
  it('given a light background then returns black text', () => {
    expect(getContrastColor('#FFFFFF')).toBe('#000000');
    expect(getContrastColor('#FFFF00')).toBe('#000000'); // yellow is bright
  });

  it('given a dark background then returns white text', () => {
    expect(getContrastColor('#000000')).toBe('#FFFFFF');
    expect(getContrastColor('#0000FF')).toBe('#FFFFFF'); // blue is dark
  });
});

describe('leagueRowBg:', () => {
  const total = 20;

  it('given the player team then returns the player highlight regardless of position', () => {
    expect(leagueRowBg(true, 10, total)).toBe(STATUS_COLORS.playerTeam);
  });

  it('given a top-3 position then returns the promotion colour', () => {
    expect(leagueRowBg(false, 1, total)).toBe(STATUS_COLORS.promotion);
    expect(leagueRowBg(false, 3, total)).toBe(STATUS_COLORS.promotion);
  });

  it('given a bottom-two position then returns the relegation colour', () => {
    expect(leagueRowBg(false, 19, total)).toBe(STATUS_COLORS.relegation);
    expect(leagueRowBg(false, 20, total)).toBe(STATUS_COLORS.relegation);
  });

  it('given a mid-table position then returns undefined', () => {
    expect(leagueRowBg(false, 4, total)).toBeUndefined();
    expect(leagueRowBg(false, 18, total)).toBeUndefined();
  });
});
