/**
 * Domain separation for key derivation
 * Ensures keys for different purposes are cryptographically isolated
 */

import { createHmac } from "node:crypto";

export enum KeyDomain {
  // Primary authentication domains
  SSH = "keyforge:ssh:v1",
  GPG = "keyforge:gpg:v1",
  AGE = "keyforge:age:v1",

  // Wallet domains
  WALLET_BIP39 = "keyforge:wallet:bip39:v1",
  WALLET_PAYMENT = "keyforge:wallet:payment:v1",
  WALLET_MONERO = "keyforge:wallet:monero:v1",

  // Vault domains
  VAULT_ENCRYPT = "keyforge:vault:encrypt:v1",
  VAULT_HMAC = "keyforge:vault:hmac:v1",
  VAULT_IPNS = "keyforge:vault:ipns:v1",

  // Service domains
  SERVICE_TOTP = "keyforge:service:totp:v1",
  SERVICE_API = "keyforge:service:api:v1",
  SERVICE_WEBAUTHN = "keyforge:service:webauthn:v1",

  // Special purpose domains
  NOSTR = "keyforge:nostr:v1",
  SHAMIR = "keyforge:shamir:v1",
  CANARY = "keyforge:canary:v1"
}

export class DomainDerivation {
  private static readonly EXPAND_KEY = "keyforge-expand";

  /**
   * Derive a key for a specific domain and index
   * Uses HKDF-like derivation with HMAC-SHA512
   */
  static deriveKey(
    masterSeed: Buffer,
    domain: KeyDomain,
    index: number = 0,
    keyLength: number = 32
  ): Buffer {
    // Step 1: Extract - Create PRK (Pseudo-Random Key) from master seed
    const prk = createHmac("sha512", this.EXPAND_KEY)
      .update(masterSeed)
      .digest();

    // Step 2: Expand - Create key material with domain, index, and length info
    const info = `${domain}:${index}:${keyLength}`;
    
    // HKDF-Expand using HMAC-SHA512
    const okm = createHmac("sha512", prk)
      .update(info)
      .digest();

    // Return requested key length
    if (keyLength <= okm.length) {
      return okm.subarray(0, keyLength);
    }

    // For longer keys, use multiple HMAC iterations
    return this.expandKey(prk, info, keyLength);
  }

  /**
   * Derive multiple keys for the same domain efficiently
   */
  static deriveMultiple(
    masterSeed: Buffer,
    domain: KeyDomain,
    count: number,
    keyLength: number = 32
  ): Buffer[] {
    const keys: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(this.deriveKey(masterSeed, domain, i, keyLength));
    }
    return keys;
  }

  /**
   * Expand key material for lengths > 64 bytes using HKDF-like expansion
   */
  private static expandKey(
    prk: Buffer,
    info: string,
    keyLength: number
  ): Buffer {
    const hashLen = 64; // SHA512 output length
    const n = Math.ceil(keyLength / hashLen);
    
    if (n > 255) {
      throw new Error("Key length too long for HKDF expansion");
    }

    let t = Buffer.alloc(0);
    const okmParts: Buffer[] = [];

    for (let i = 1; i <= n; i++) {
      const hmac = createHmac("sha512", prk);
      hmac.update(t);
      hmac.update(info);
      hmac.update(Buffer.from([i]));
      t = hmac.digest();
      
      okmParts.push(t);
    }

    const okm = Buffer.concat(okmParts);
    return okm.subarray(0, keyLength);
  }
}