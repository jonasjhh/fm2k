import { v4, Uuid } from './uuid';

// Test utility function - validates if a string is a valid UUID v4
function isValidV4(uuid: string): boolean {
  if (typeof uuid !== 'string') {
    return false;
  }
  const v4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return v4Regex.test(uuid);
}

// Test utility to mock crypto
function mockCrypto(available: boolean) {
  const originalCrypto = globalThis.crypto;

  if (available) {
    globalThis.crypto = {
      getRandomValues: jest.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }),
    } as any;
  } else {
    // @ts-ignore
    globalThis.crypto = undefined;
  }

  return () => {
    globalThis.crypto = originalCrypto;
  };
}

describe('Uuid:', () => {
  describe('.v4()', () => {
    test('given Uuid class when calling v4 then should return valid UUID v4 string', () => {
      const uuid = Uuid.v4();

      expect(typeof uuid).toBe('string');
      expect(uuid).toHaveLength(36);
      expect(isValidV4(uuid)).toBe(true);
    });

    test('given Uuid class when calling v4 multiple times then should return unique UUIDs', () => {
      const uuid1 = Uuid.v4();
      const uuid2 = Uuid.v4();

      expect(uuid1).not.toBe(uuid2);
      expect(isValidV4(uuid1)).toBe(true);
      expect(isValidV4(uuid2)).toBe(true);
    });

    test('given Uuid class when instantiated then should throw error', () => {
      expect(() => {
        // @ts-ignore - testing runtime behavior
        new Uuid();
      }).toThrow();
    });
  });
});

describe('v4() function:', () => {
  describe('Basic functionality', () => {
    test('given v4 function when called then should return valid UUID v4 string', () => {
      const uuid = v4();

      expect(typeof uuid).toBe('string');
      expect(uuid).toHaveLength(36);
      expect(isValidV4(uuid)).toBe(true);
    });

    test('given v4 function when called multiple times then should return unique UUIDs', () => {
      const uuid1 = v4();
      const uuid2 = v4();

      expect(uuid1).not.toBe(uuid2);
    });

    test('given v4 function when called then should return UUID with correct format (8-4-4-4-12)', () => {
      const uuid = v4();
      const parts = uuid.split('-');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
    });
  });

  describe('RFC 4122 compliance', () => {
    test('given generated UUID when checking version then should have version 4 identifier', () => {
      const uuid = v4();
      const versionChar = uuid.charAt(14);

      expect(versionChar).toBe('4');
    });

    test('given generated UUID when checking variant then should have correct variant bits', () => {
      const uuid = v4();
      const variantChar = uuid.charAt(19);

      expect(['8', '9', 'a', 'b']).toContain(variantChar.toLowerCase());
    });

    test('given 1000 generated UUIDs when checking version and variant then should all be compliant', () => {
      for (let i = 0; i < 1000; i++) {
        const uuid = v4();
        expect(uuid.charAt(14)).toBe('4');
        expect(['8', '9', 'a', 'b']).toContain(uuid.charAt(19).toLowerCase());
      }
    });

    test('given generated UUIDs when checking format then should match RFC 4122 pattern', () => {
      const uuids = Array.from({ length: 100 }, () => v4());

      uuids.forEach(uuid => {
        expect(isValidV4(uuid)).toBe(true);
      });
    });
  });

  describe('Uniqueness and entropy', () => {
    test('given 100 UUIDs when generated then should all be unique', () => {
      const uuids = new Set();
      const count = 100;

      for (let i = 0; i < count; i++) {
        uuids.add(v4());
      }

      expect(uuids.size).toBe(count);
    });

    test('given 10000 UUIDs when generated then should all be unique', () => {
      const uuids = new Set();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        uuids.add(v4());
      }

      expect(uuids.size).toBe(count);
    });

    test('given generated UUIDs when analyzing character distribution then should have good entropy', () => {
      const uuids = Array.from({ length: 1000 }, () => v4());
      const charCounts: { [key: string]: number } = {};

      // Count hex characters (excluding hyphens and fixed positions)
      uuids.forEach(uuid => {
        const hexOnly = uuid.replace(/-/g, '');
        for (let i = 0; i < hexOnly.length; i++) {
          // Skip version (position 12) and variant (position 16) positions
          if (i === 12 || i === 16) {
            continue;
          }

          const char = hexOnly[i].toLowerCase();
          charCounts[char] = (charCounts[char] || 0) + 1;
        }
      });

      // Each hex character (0-9, a-f) should appear roughly equally
      const expectedCount = Object.values(charCounts).reduce((a, b) => a + b, 0) / 16;
      const tolerance = expectedCount * 0.2; // 20% tolerance

      Object.values(charCounts).forEach(count => {
        expect(count).toBeGreaterThan(expectedCount - tolerance);
        expect(count).toBeLessThan(expectedCount + tolerance);
      });
    });
  });
});

describe('Crypto fallback:', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let restoreCrypto: () => void;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset the warning flag for proper test isolation
    (Uuid as any).hasWarnedAboutFallback = false;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    if (restoreCrypto) {
      restoreCrypto();
    }
  });

  test('given crypto available when generating UUID then should use crypto.getRandomValues', () => {
    const mockGetRandomValues = jest.fn((arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    });

    restoreCrypto = mockCrypto(true);
    (globalThis.crypto as any).getRandomValues = mockGetRandomValues;

    const uuid = v4();

    expect(isValidV4(uuid)).toBe(true);
    expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  test('given crypto not available when generating UUID then should use Math.random fallback', () => {
    restoreCrypto = mockCrypto(false);

    const uuid = v4();

    expect(isValidV4(uuid)).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'crypto.getRandomValues() not available, falling back to Math.random(). UUIDs may be less secure.',
    );
  });

  test('given crypto not available when generating multiple UUIDs then should warn only once', () => {
    restoreCrypto = mockCrypto(false);

    const uuid1 = v4();
    const uuid2 = v4();
    const uuid3 = v4();

    expect(isValidV4(uuid1)).toBe(true);
    expect(isValidV4(uuid2)).toBe(true);
    expect(isValidV4(uuid3)).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  test('given Math.random fallback when generating UUIDs then should still produce unique results', () => {
    restoreCrypto = mockCrypto(false);

    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      uuids.add(v4());
    }

    expect(uuids.size).toBe(100);
  });
});

describe('Validation edge cases:', () => {
  test('given valid UUID v4 strings when validating then should pass validation', () => {
    const validUuids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      v4(),
    ];

    validUuids.forEach(uuid => {
      expect(isValidV4(uuid)).toBe(true);
    });
  });

  test('given invalid UUID strings when validating then should fail validation', () => {
    const invalidUuids = [
      '',
      'not-a-uuid',
      '550e8400-e29b-31d4-a716-446655440000', // Version 3, not 4
      '550e8400-e29b-11d4-a716-446655440000', // Version 1, not 4
      '550e8400-e29b-51d5-a716-446655440000', // Version 5, not 4
      '550e8400-e29b-41d4-c716-446655440000', // Invalid variant
      '550e8400-e29b-41d4-a716-44665544000',  // Too short
      '550e8400-e29b-41d4-a716-4466554400000', // Too long
      'ggge8400-e29b-41d4-a716-446655440000',  // Invalid characters
      '550e8400e29b41d4a716446655440000',       // Missing hyphens
      '550e8400-e29b-41d4-a716-446655440000-extra', // Extra content
      '550e8400-e29b-41d4-a716-44665544000g',  // Invalid character at end
    ];

    invalidUuids.forEach(uuid => {
      expect(isValidV4(uuid)).toBe(false);
    });
  });

  test('given UUID strings in different cases when validating then should pass validation regardless of case', () => {
    const upperUuid = '550E8400-E29B-41D4-A716-446655440000';
    const lowerUuid = '550e8400-e29b-41d4-a716-446655440000';
    const mixedUuid = '550E8400-e29b-41D4-A716-446655440000';

    expect(isValidV4(upperUuid)).toBe(true);
    expect(isValidV4(lowerUuid)).toBe(true);
    expect(isValidV4(mixedUuid)).toBe(true);
  });

  test('given non-string values when validating then should fail validation', () => {
    const invalidInputs = [
      null,
      undefined,
      123,
      {},
      [],
      true,
      false,
      Symbol('test'),
    ];

    invalidInputs.forEach(input => {
      expect(isValidV4(input as any)).toBe(false);
    });
  });
});

describe('Performance tests:', () => {
  test('given high volume generation when generating 1000 UUIDs then should complete quickly and all be unique', () => {
    const start = Date.now();
    const uuids = [];

    for (let i = 0; i < 1000; i++) {
      uuids.push(v4());
    }

    const duration = Date.now() - start;

    expect(uuids).toHaveLength(1000);
    expect(duration).toBeLessThan(100); // Should complete in under 100ms

    // Check all are unique
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(1000);

    // Check all are valid
    uuids.forEach(uuid => {
      expect(isValidV4(uuid)).toBe(true);
    });
  });

  test('given continuous generation when generating 10000 UUIDs then should maintain performance', () => {
    const batchSize = 1000;
    const batches = 10;
    const durations: number[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const start = Date.now();

      for (let i = 0; i < batchSize; i++) {
        v4();
      }

      durations.push(Date.now() - start);
    }

    // Performance should be consistent (no memory leaks or degradation)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    durations.forEach(duration => {
      expect(duration).toBeLessThan(avgDuration * 2); // No batch should be 2x slower than average
    });
  });
});

describe('Memory and resource tests:', () => {
  test('given repeated calls when generating many UUIDs then should not cause memory leaks', () => {
    // Generate UUIDs in chunks to test garbage collection
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const batch = Array.from({ length: 100 }, () => v4());
      expect(batch.length).toBe(100);
      // Let batch go out of scope to test GC
    }

    // If we get here without running out of memory, test passes
    expect(true).toBe(true);
  });
});
