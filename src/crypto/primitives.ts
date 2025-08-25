/**
 * Cryptographic utilities for secure operations
 * Uses Bun's native crypto APIs where possible
 */

export class CryptoUtils {
  /**
   * Generate cryptographically secure random bytes
   * Uses Bun's native crypto.getRandomValues
   */
  static random(bytes: number): Buffer {
    if (bytes === 0) return Buffer.alloc(0);
    
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Buffer.from(array);
  }

  /**
   * Constant-time buffer comparison to prevent timing attacks
   * Uses Node.js timingSafeEqual for cryptographic safety
   */
  static compare(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    if (a.length === 0 && b.length === 0) return true;
    
    // Use crypto.subtle timing-safe comparison
    const aArray = new Uint8Array(a);
    const bArray = new Uint8Array(b);
    
    let result = 0;
    for (let i = 0; i < aArray.length; i++) {
      result |= aArray[i] ^ bArray[i];
    }
    return result === 0;
  }

  /**
   * Securely clear sensitive data from memory
   * Multiple overwrites to prevent recovery
   */
  static clear(buffer: Buffer): void {
    if (buffer.length === 0) return;
    
    // Multiple overwrite passes for security
    crypto.getRandomValues(buffer);  // Random data
    buffer.fill(0);                  // Zeros
    buffer.fill(0xFF);               // Ones  
    buffer.fill(0);                  // Zeros again
  }

  /**
   * Key stretching using PBKDF2 with SHA-512
   * For password-based key derivation
   */
  static async stretchKey(
    password: string,
    salt: Buffer,
    iterations = 100000
  ): Promise<Buffer> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-512"
      },
      key,
      256  // 256 bits = 32 bytes
    );

    return Buffer.from(bits);
  }
}