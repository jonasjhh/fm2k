import {
  v4,
  v4Simple,
  shortId,
  isValidV4,
  isValidUuid,
  generateId,
  nullUuid,
} from './uuid';

describe('UUID Module', () => {
  describe('v4()', () => {
    test('should generate a valid UUID v4 string', () => {
      const uuid = v4();

      expect(typeof uuid).toBe('string');
      expect(uuid).toHaveLength(36);
      expect(isValidV4(uuid)).toBe(true);
    });

    test('should generate unique UUIDs', () => {
      const uuid1 = v4();
      const uuid2 = v4();

      expect(uuid1).not.toBe(uuid2);
    });

    test('should have correct format (8-4-4-4-12)', () => {
      const uuid = v4();
      const parts = uuid.split('-');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
    });

    test('should have version 4 identifier', () => {
      const uuid = v4();
      const versionChar = uuid.charAt(14); // Position of version in UUID

      expect(versionChar).toBe('4');
    });

    test('should have correct variant bits', () => {
      const uuid = v4();
      const variantChar = uuid.charAt(19); // Position of variant in UUID

      expect(['8', '9', 'a', 'b']).toContain(variantChar.toLowerCase());
    });

    test('should generate multiple unique UUIDs', () => {
      const uuids = new Set();
      const count = 100;

      for (let i = 0; i < count; i++) {
        uuids.add(v4());
      }

      expect(uuids.size).toBe(count);
    });
  });

  describe('v4Simple()', () => {
    test('should generate a valid UUID v4 string', () => {
      const uuid = v4Simple();

      expect(typeof uuid).toBe('string');
      expect(uuid).toHaveLength(36);
      expect(isValidV4(uuid)).toBe(true);
    });

    test('should generate unique UUIDs', () => {
      const uuid1 = v4Simple();
      const uuid2 = v4Simple();

      expect(uuid1).not.toBe(uuid2);
    });

    test('should have version 4 identifier', () => {
      const uuid = v4Simple();
      const versionChar = uuid.charAt(14);

      expect(versionChar).toBe('4');
    });

    test('should have correct variant bits', () => {
      const uuid = v4Simple();
      const variantChar = uuid.charAt(19);

      expect(['8', '9', 'a', 'b']).toContain(variantChar.toLowerCase());
    });
  });

  describe('shortId()', () => {
    test('should generate a short ID with default length', () => {
      const id = shortId();

      expect(typeof id).toBe('string');
      expect(id).toHaveLength(8);
      expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
    });

    test('should generate a short ID with custom length', () => {
      const lengths = [4, 6, 12, 16];

      lengths.forEach(length => {
        const id = shortId(length);
        expect(id).toHaveLength(length);
        expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
      });
    });

    test('should generate unique short IDs', () => {
      const id1 = shortId();
      const id2 = shortId();

      expect(id1).not.toBe(id2);
    });

    test('should contain only alphanumeric characters', () => {
      const id = shortId(20);

      expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
    });

    test('should generate multiple unique short IDs', () => {
      const ids = new Set();
      const count = 50;

      for (let i = 0; i < count; i++) {
        ids.add(shortId());
      }

      expect(ids.size).toBe(count);
    });
  });

  describe('isValidV4()', () => {
    test('should return true for valid UUID v4', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        v4(),
        v4Simple(),
      ];

      validUuids.forEach(uuid => {
        if (uuid.charAt(14) === '4') { // Only test v4 UUIDs
          expect(isValidV4(uuid)).toBe(true);
        }
      });
    });

    test('should return false for invalid UUID v4', () => {
      const invalidUuids = [
        '',
        'not-a-uuid',
        '550e8400-e29b-31d4-a716-446655440000', // Version 3, not 4
        '550e8400-e29b-11d4-a716-446655440000', // Version 1, not 4
        '550e8400-e29b-41d4-c716-446655440000', // Invalid variant
        '550e8400-e29b-41d4-a716-44665544000',  // Too short
        '550e8400-e29b-41d4-a716-4466554400000', // Too long
        'ggge8400-e29b-41d4-a716-446655440000',  // Invalid characters
        '550e8400e29b41d4a716446655440000',       // Missing hyphens
        '550e8400-e29b-41d4-a716-446655440000-extra', // Extra content
      ];

      invalidUuids.forEach(uuid => {
        expect(isValidV4(uuid)).toBe(false);
      });
    });

    test('should be case insensitive', () => {
      const upperUuid = '550E8400-E29B-41D4-A716-446655440000';
      const lowerUuid = '550e8400-e29b-41d4-a716-446655440000';

      expect(isValidV4(upperUuid)).toBe(true);
      expect(isValidV4(lowerUuid)).toBe(true);
    });
  });

  describe('isValidUuid()', () => {
    test('should return true for valid UUIDs of any version', () => {
      const validUuids = [
        '550e8400-e29b-11d1-a716-446655440000', // Version 1
        '550e8400-e29b-21d2-a716-446655440000', // Version 2
        '550e8400-e29b-31d3-a716-446655440000', // Version 3
        '550e8400-e29b-41d4-a716-446655440000', // Version 4
        '550e8400-e29b-51d5-a716-446655440000',  // Version 5
      ];

      validUuids.forEach(uuid => {
        expect(isValidUuid(uuid)).toBe(true);
      });
    });

    test('should return false for invalid UUIDs', () => {
      const invalidUuids = [
        '',
        'not-a-uuid',
        '550e8400-e29b-61d6-a716-446655440000', // Invalid version 6
        '550e8400-e29b-41d4-c716-446655440000', // Invalid variant
        '550e8400-e29b-41d4-a716-44665544000',  // Too short
        'ggge8400-e29b-41d4-a716-446655440000',  // Invalid characters
      ];

      invalidUuids.forEach(uuid => {
        expect(isValidUuid(uuid)).toBe(false);
      });
    });
  });

  describe('generateId()', () => {
    test('should generate a valid UUID v4 string', () => {
      const id = generateId();

      expect(typeof id).toBe('string');
      expect(id).toHaveLength(36);
      expect(isValidV4(id)).toBe(true);
    });

    test('should be an alias for v4()', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(isValidV4(id1)).toBe(true);
      expect(isValidV4(id2)).toBe(true);
    });
  });

  describe('nullUuid()', () => {
    test('should return a null UUID', () => {
      const nullId = nullUuid();

      expect(nullId).toBe('00000000-0000-0000-0000-000000000000');
      expect(nullId).toHaveLength(36);
    });

    test('should always return the same null UUID', () => {
      const nullId1 = nullUuid();
      const nullId2 = nullUuid();

      expect(nullId1).toBe(nullId2);
    });

    test('should be a valid UUID format but not a valid v4', () => {
      const nullId = nullUuid();

      // It has the right format but version is 0, not 4
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nullId)).toBe(true);
      expect(isValidV4(nullId)).toBe(false);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle rapid UUID generation', () => {
      const start = Date.now();
      const uuids = [];

      for (let i = 0; i < 1000; i++) {
        uuids.push(v4());
      }

      const duration = Date.now() - start;

      expect(uuids).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second

      // Check all are unique
      const uniqueUuids = new Set(uuids);
      expect(uniqueUuids.size).toBe(1000);
    });

    test('should handle edge cases for shortId', () => {
      expect(shortId(0)).toBe('');
      expect(shortId(1)).toHaveLength(1);

      const longId = shortId(100);
      expect(longId).toHaveLength(100);
      expect(/^[A-Za-z0-9]+$/.test(longId)).toBe(true);
    });

    test('should validate edge cases', () => {
      expect(isValidV4(null as any)).toBe(false);
      expect(isValidV4(undefined as any)).toBe(false);
      expect(isValidV4(123 as any)).toBe(false);
      expect(isValidUuid(null as any)).toBe(false);
      expect(isValidUuid(undefined as any)).toBe(false);
    });
  });
});
