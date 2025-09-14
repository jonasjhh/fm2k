/**
 * Generates a UUID v4 (random) compliant identifier
 * Based on RFC 4122 specification
 * @returns A UUID v4 string in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export function v4(): string {
  // Use crypto.getRandomValues if available (browser/Node.js with crypto), fallback to Math.random
  const getRandomValues = (() => {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      return (arr: Uint8Array) => globalThis.crypto.getRandomValues(arr);
    }
    // Fallback for environments without crypto.getRandomValues
    return (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    };
  })();

  const bytes = new Uint8Array(16);
  getRandomValues(bytes);

  // Set version (4) and variant bits according to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Convert to hex string with proper formatting
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Generates a UUID v4 using a simpler algorithm
 * Less cryptographically secure but faster and smaller
 * @returns A UUID v4 string
 */
export function v4Simple(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generates a short, URL-safe unique identifier
 * Not RFC 4122 compliant but useful for shorter IDs
 * @param length The length of the generated ID (default: 8)
 * @returns A short unique identifier
 */
export function shortId(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  const getRandomValues = (() => {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      return (arr: Uint8Array) => globalThis.crypto.getRandomValues(arr);
    }
    return (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    };
  })();

  const bytes = new Uint8Array(length);
  getRandomValues(bytes);

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

/**
 * Validates if a string is a valid UUID v4
 * @param uuid The string to validate
 * @returns True if the string is a valid UUID v4
 */
export function isValidV4(uuid: string): boolean {
  const v4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return v4Regex.test(uuid);
}

/**
 * Validates if a string is a valid UUID (any version)
 * @param uuid The string to validate
 * @returns True if the string is a valid UUID
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Generates a UUID v4 identifier
 * Alias for v4() for backward compatibility
 * @returns A UUID v4 string
 */
export function generateId(): string {
  return v4();
}

/**
 * Generates a null UUID (all zeros)
 * Useful for testing and placeholder values
 * @returns A null UUID string
 */
export function nullUuid(): string {
  return '00000000-0000-0000-0000-000000000000';
}
