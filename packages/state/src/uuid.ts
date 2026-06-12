export class Uuid {
  private static hasWarnedAboutFallback = false;

  constructor() {
    throw new Error('Uuid cannot be instantiated. Use Uuid.v4() instead.');
  }

  static v4(): string {
    const randomBytes = this.createRandomBytes();
    const uuidBytes = this.setVersionAndVariantBits(randomBytes);
    return this.formatAsUuidString(uuidBytes);
  }

  private static createRandomBytes(): Uint8Array {
    const bytes = new Uint8Array(16);

    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    }

    return this.createMathRandomBytes(bytes.length);
  }

  private static createMathRandomBytes(length: number): Uint8Array {
    if (!this.hasWarnedAboutFallback) {
      console.warn('crypto.getRandomValues() not available, falling back to Math.random(). UUIDs may be less secure.');
      this.hasWarnedAboutFallback = true;
    }

    const bytes = new Uint8Array(length);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  private static setVersionAndVariantBits(bytes: Uint8Array): Uint8Array {
    const result = new Uint8Array(bytes);
    result[6] = (result[6] & 0x0f) | 0x40;
    result[8] = (result[8] & 0x3f) | 0x80;
    return result;
  }

  private static formatAsUuidString(bytes: Uint8Array): string {
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32),
    ].join('-');
  }
}

export const v4 = Uuid.v4.bind(Uuid);
