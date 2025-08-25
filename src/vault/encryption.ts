/**
 * Vault encryption using ChaCha20-Poly1305 AEAD
 * Provides authenticated encryption for vault data
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { KeyDomain, DomainDerivation } from "../core/domains";
import { VaultData, EncryptedVault } from "./types";

export class VaultEncryption {
  private static readonly NONCE_LENGTH = 12;  // ChaCha20 nonce
  private static readonly TAG_LENGTH = 16;    // Poly1305 tag

  /**
   * Encrypt vault data with random nonce
   */
  static encrypt(
    data: VaultData,
    masterSeed: Buffer
  ): EncryptedVault {
    const nonce = randomBytes(this.NONCE_LENGTH);
    return this.encryptWithNonce(data, masterSeed, nonce);
  }

  /**
   * Encrypt vault data with provided nonce (for deterministic testing)
   */
  static encryptWithNonce(
    data: VaultData,
    masterSeed: Buffer,
    nonce: Buffer
  ): EncryptedVault {
    // Derive encryption key from master seed
    const encKey = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.VAULT_ENCRYPT,
      0,
      32  // ChaCha20 key length
    );

    // Serialize and compress data
    const serialized = JSON.stringify(data);
    const compressed = this.compress(serialized);

    // Encrypt with ChaCha20-Poly1305
    const cipher = chacha20poly1305(encKey, nonce);
    const ciphertext = cipher.encrypt(compressed);

    // Split ciphertext and tag
    const encrypted = Buffer.from(ciphertext.slice(0, -this.TAG_LENGTH));
    const tag = Buffer.from(ciphertext.slice(-this.TAG_LENGTH));

    return { encrypted, nonce, tag };
  }

  /**
   * Decrypt vault data
   */
  static decrypt(
    encrypted: Buffer,
    nonce: Buffer,
    tag: Buffer,
    masterSeed: Buffer
  ): VaultData {
    // Derive same encryption key
    const encKey = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.VAULT_ENCRYPT,
      0,
      32
    );

    // Combine ciphertext and tag
    const ciphertext = Buffer.concat([encrypted, tag]);

    try {
      // Decrypt with ChaCha20-Poly1305
      const cipher = chacha20poly1305(encKey, nonce);
      const compressed = cipher.decrypt(ciphertext);

      // Decompress and parse
      const serialized = this.decompress(Buffer.from(compressed));
      return JSON.parse(serialized);
    } catch (error) {
      throw new Error("Failed to decrypt vault: invalid key or corrupted data");
    }
  }

  /**
   * Compress data using gzip
   */
  private static compress(data: string): Buffer {
    return deflateSync(Buffer.from(data, 'utf8'));
  }

  /**
   * Decompress data using gzip
   */
  private static decompress(data: Buffer): string {
    return inflateSync(data).toString('utf8');
  }
}