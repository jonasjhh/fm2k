import { getContrastColor, STATUS_COLORS } from './colors.ts';

describe('getContrastColor:', () => {
  it('given a light background then returns black text', () => {
    expect(getContrastColor('#FFFFFF')).toBe('#000000');
    expect(getContrastColor('#FFFF00')).toBe('#000000');
  });

  it('given a dark background then returns white text', () => {
    expect(getContrastColor('#000000')).toBe('#FFFFFF');
    expect(getContrastColor('#0000FF')).toBe('#FFFFFF');
  });
});

describe('status tokens:', () => {
  it('exposes the semantic status variants', () => {
    expect(Object.keys(STATUS_COLORS)).toEqual(
      ['playerTeam', 'champion', 'promotion', 'promotionQualifier', 'relegation', 'relegationQualifier', 'caution'],
    );
  });
});
