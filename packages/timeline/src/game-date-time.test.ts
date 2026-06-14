import {
  createGameDateTime,
  addMinutes,
  addHours,
  addDays,
  compareGameDateTime,
  isAfter,
  isBefore,
  isEqual,
  formatGameDateTime,
} from './game-date-time.ts';

describe('createGameDateTime:', () => {
  describe('given valid components', () => {
    test('when created without hour and minute then defaults to midnight', () => {
      const dt = createGameDateTime(2025, 8, 15);
      expect(dt).toEqual({ year: 2025, month: 8, day: 15, hour: 0, minute: 0 });
    });

    test('when created with all components then returns correct value', () => {
      const dt = createGameDateTime(2025, 8, 15, 14, 30);
      expect(dt).toEqual({ year: 2025, month: 8, day: 15, hour: 14, minute: 30 });
    });

    test('when created then result is frozen (immutable)', () => {
      const dt = createGameDateTime(2025, 1, 1);
      expect(Object.isFrozen(dt)).toBe(true);
    });

    test('when created with boundary values then succeeds', () => {
      expect(() => createGameDateTime(2025, 1, 1, 0, 0)).not.toThrow();
      expect(() => createGameDateTime(2025, 12, 31, 23, 59)).not.toThrow();
    });
  });

  describe('given invalid components', () => {
    test('when month is 0 then throws', () => {
      expect(() => createGameDateTime(2025, 0, 1)).toThrow();
    });

    test('when month is 13 then throws', () => {
      expect(() => createGameDateTime(2025, 13, 1)).toThrow();
    });

    test('when day is 0 then throws', () => {
      expect(() => createGameDateTime(2025, 1, 0)).toThrow();
    });

    test('when day is 32 then throws', () => {
      expect(() => createGameDateTime(2025, 1, 32)).toThrow();
    });

    test('when day is invalid for month (Feb 30) then throws with a descriptive message', () => {
      expect(() => createGameDateTime(2025, 2, 30)).toThrow('Invalid game date');
    });

    test('when hour is 24 then throws', () => {
      expect(() => createGameDateTime(2025, 1, 1, 24, 0)).toThrow();
    });

    test('when hour is negative then throws', () => {
      expect(() => createGameDateTime(2025, 1, 1, -1, 0)).toThrow();
    });

    test('when minute is 60 then throws', () => {
      expect(() => createGameDateTime(2025, 1, 1, 0, 60)).toThrow();
    });

    test('when minute is negative then throws', () => {
      expect(() => createGameDateTime(2025, 1, 1, 0, -1)).toThrow();
    });
  });
});

describe('addMinutes:', () => {
  test('given a datetime when adding minutes within the same hour then advances minutes', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 0);
    expect(addMinutes(dt, 30)).toEqual(createGameDateTime(2025, 8, 15, 14, 30));
  });

  test('given a datetime when adding minutes that cross an hour boundary then advances hour', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 45);
    expect(addMinutes(dt, 30)).toEqual(createGameDateTime(2025, 8, 15, 15, 15));
  });

  test('given a datetime when adding minutes that cross a day boundary then advances day', () => {
    const dt = createGameDateTime(2025, 8, 15, 23, 45);
    expect(addMinutes(dt, 30)).toEqual(createGameDateTime(2025, 8, 16, 0, 15));
  });

  test('given a datetime when adding minutes that cross a month boundary then advances month', () => {
    const dt = createGameDateTime(2025, 8, 31, 23, 45);
    expect(addMinutes(dt, 30)).toEqual(createGameDateTime(2025, 9, 1, 0, 15));
  });

  test('given a datetime when adding minutes that cross a year boundary then advances year', () => {
    const dt = createGameDateTime(2025, 12, 31, 23, 45);
    expect(addMinutes(dt, 30)).toEqual(createGameDateTime(2026, 1, 1, 0, 15));
  });

  test('given a datetime when adding zero minutes then returns same time', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 30);
    expect(addMinutes(dt, 0)).toEqual(dt);
  });

  test('given a datetime when adding negative minutes then goes backwards in time', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 30);
    expect(addMinutes(dt, -30)).toEqual(createGameDateTime(2025, 8, 15, 14, 0));
  });
});

describe('addHours:', () => {
  test('given a datetime when adding hours within the same day then advances hours', () => {
    const dt = createGameDateTime(2025, 8, 15, 10, 0);
    expect(addHours(dt, 3)).toEqual(createGameDateTime(2025, 8, 15, 13, 0));
  });

  test('given a datetime when adding hours that cross a day boundary then advances day', () => {
    const dt = createGameDateTime(2025, 8, 15, 22, 0);
    expect(addHours(dt, 3)).toEqual(createGameDateTime(2025, 8, 16, 1, 0));
  });

  test('given a datetime when adding hours then preserves minutes', () => {
    const dt = createGameDateTime(2025, 8, 15, 10, 45);
    expect(addHours(dt, 2)).toEqual(createGameDateTime(2025, 8, 15, 12, 45));
  });
});

describe('addDays:', () => {
  test('given a datetime when adding days within the same month then advances days', () => {
    const dt = createGameDateTime(2025, 8, 15);
    expect(addDays(dt, 5)).toEqual(createGameDateTime(2025, 8, 20));
  });

  test('given a datetime when adding days that cross a month boundary then advances month', () => {
    const dt = createGameDateTime(2025, 8, 28);
    expect(addDays(dt, 5)).toEqual(createGameDateTime(2025, 9, 2));
  });

  test('given a datetime when adding days that cross a year boundary then advances year', () => {
    const dt = createGameDateTime(2025, 12, 30);
    expect(addDays(dt, 5)).toEqual(createGameDateTime(2026, 1, 4));
  });

  test('given a datetime when adding days then preserves time of day', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 30);
    expect(addDays(dt, 1)).toEqual(createGameDateTime(2025, 8, 16, 14, 30));
  });

  test('given a datetime when adding zero days then returns same date', () => {
    const dt = createGameDateTime(2025, 8, 15, 14, 30);
    expect(addDays(dt, 0)).toEqual(dt);
  });
});

describe('compareGameDateTime:', () => {
  test('given two equal datetimes then returns 0', () => {
    const a = createGameDateTime(2025, 8, 15, 14, 30);
    const b = createGameDateTime(2025, 8, 15, 14, 30);
    expect(compareGameDateTime(a, b)).toBe(0);
  });

  test('given a earlier than b by one minute then returns -1', () => {
    const a = createGameDateTime(2025, 8, 15, 14, 29);
    const b = createGameDateTime(2025, 8, 15, 14, 30);
    expect(compareGameDateTime(a, b)).toBe(-1);
  });

  test('given a later than b by one minute then returns 1', () => {
    const a = createGameDateTime(2025, 8, 15, 14, 31);
    const b = createGameDateTime(2025, 8, 15, 14, 30);
    expect(compareGameDateTime(a, b)).toBe(1);
  });

  test('given different years then compares by year', () => {
    expect(compareGameDateTime(
      createGameDateTime(2024, 8, 15),
      createGameDateTime(2025, 8, 15),
    )).toBe(-1);
  });

  test('given different months then compares by month', () => {
    expect(compareGameDateTime(
      createGameDateTime(2025, 7, 15),
      createGameDateTime(2025, 8, 15),
    )).toBe(-1);
  });

  test('given different days then compares by day', () => {
    expect(compareGameDateTime(
      createGameDateTime(2025, 8, 14),
      createGameDateTime(2025, 8, 15),
    )).toBe(-1);
  });

  test('given different hours then compares by hour', () => {
    expect(compareGameDateTime(
      createGameDateTime(2025, 8, 15, 13),
      createGameDateTime(2025, 8, 15, 14),
    )).toBe(-1);
  });
});

describe('isAfter:', () => {
  test('given a is after b then returns true', () => {
    expect(isAfter(createGameDateTime(2025, 8, 16), createGameDateTime(2025, 8, 15))).toBe(true);
  });

  test('given a is before b then returns false', () => {
    expect(isAfter(createGameDateTime(2025, 8, 14), createGameDateTime(2025, 8, 15))).toBe(false);
  });

  test('given a equals b then returns false', () => {
    expect(isAfter(createGameDateTime(2025, 8, 15), createGameDateTime(2025, 8, 15))).toBe(false);
  });
});

describe('isBefore:', () => {
  test('given a is before b then returns true', () => {
    expect(isBefore(createGameDateTime(2025, 8, 14), createGameDateTime(2025, 8, 15))).toBe(true);
  });

  test('given a is after b then returns false', () => {
    expect(isBefore(createGameDateTime(2025, 8, 16), createGameDateTime(2025, 8, 15))).toBe(false);
  });

  test('given a equals b then returns false', () => {
    expect(isBefore(createGameDateTime(2025, 8, 15), createGameDateTime(2025, 8, 15))).toBe(false);
  });
});

describe('isEqual:', () => {
  test('given identical datetimes then returns true', () => {
    expect(isEqual(
      createGameDateTime(2025, 8, 15, 14, 30),
      createGameDateTime(2025, 8, 15, 14, 30),
    )).toBe(true);
  });

  test('given datetimes differing by one minute then returns false', () => {
    expect(isEqual(
      createGameDateTime(2025, 8, 15, 14, 30),
      createGameDateTime(2025, 8, 15, 14, 31),
    )).toBe(false);
  });
});

describe('formatGameDateTime:', () => {
  test('given a midnight datetime then formats with padded zeros', () => {
    expect(formatGameDateTime(createGameDateTime(2025, 1, 5))).toBe('5 Jan 2025 00:00');
  });

  test('given an afternoon datetime then formats correctly', () => {
    expect(formatGameDateTime(createGameDateTime(2025, 8, 15, 14, 30))).toBe('15 Aug 2025 14:30');
  });

  test('given single-digit hour and minute then pads with zeros', () => {
    expect(formatGameDateTime(createGameDateTime(2025, 3, 7, 9, 5))).toBe('7 Mar 2025 09:05');
  });

  test('given a December datetime then formats month correctly', () => {
    expect(formatGameDateTime(createGameDateTime(2025, 12, 25, 12, 0))).toBe('25 Dec 2025 12:00');
  });

  test('given each month then formats with correct abbreviation', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((name, i) => {
      expect(formatGameDateTime(createGameDateTime(2025, i + 1, 1))).toContain(name);
    });
  });
});
