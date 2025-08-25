import { test, expect, describe } from "bun:test";
import { KeyDomain, DomainDerivation } from "../../src/core/domains";

describe("DomainDerivation", () => {
  const masterSeed = Buffer.from("0".repeat(128), 'hex'); // 64 byte test seed

  test("derives different keys for different domains", () => {
    const sshKey = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0);
    const gpgKey = DomainDerivation.deriveKey(masterSeed, KeyDomain.GPG, 0);
    const walletKey = DomainDerivation.deriveKey(masterSeed, KeyDomain.WALLET_BIP39, 0);
    const vaultKey = DomainDerivation.deriveKey(masterSeed, KeyDomain.VAULT_ENCRYPT, 0);
    
    expect(sshKey.equals(gpgKey)).toBe(false);
    expect(sshKey.equals(walletKey)).toBe(false);
    expect(sshKey.equals(vaultKey)).toBe(false);
    expect(gpgKey.equals(walletKey)).toBe(false);
    expect(gpgKey.equals(vaultKey)).toBe(false);
    expect(walletKey.equals(vaultKey)).toBe(false);
  });

  test("derives different keys for same domain, different indices", () => {
    const key0 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0);
    const key1 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 1);
    const key2 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 2);
    
    expect(key0.equals(key1)).toBe(false);
    expect(key0.equals(key2)).toBe(false);
    expect(key1.equals(key2)).toBe(false);
  });

  test("derivation is deterministic", () => {
    const key1 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 5);
    const key2 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 5);
    const key3 = DomainDerivation.deriveKey(masterSeed, KeyDomain.WALLET_BIP39, 10);
    const key4 = DomainDerivation.deriveKey(masterSeed, KeyDomain.WALLET_BIP39, 10);
    
    expect(key1.equals(key2)).toBe(true);
    expect(key3.equals(key4)).toBe(true);
  });

  test("derives multiple keys efficiently", () => {
    const keys = DomainDerivation.deriveMultiple(masterSeed, KeyDomain.SSH, 10);
    
    expect(keys.length).toBe(10);
    expect(keys.every(key => key.length === 32)).toBe(true); // Default 32 bytes
    
    // Verify all keys are unique
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(keys[i].equals(keys[j])).toBe(false);
      }
    }
  });

  test("supports different key lengths", () => {
    const key16 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0, 16);
    const key32 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0, 32);
    const key64 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0, 64);
    
    expect(key16.length).toBe(16);
    expect(key32.length).toBe(32);
    expect(key64.length).toBe(64);
    
    // Same domain/index but different lengths should be different
    expect(key16.equals(key32.subarray(0, 16))).toBe(false);
    expect(key32.equals(key64.subarray(0, 32))).toBe(false);
  });

  test("handles all defined key domains", () => {
    const domains = [
      KeyDomain.SSH,
      KeyDomain.GPG,
      KeyDomain.AGE,
      KeyDomain.WALLET_BIP39,
      KeyDomain.WALLET_PAYMENT,
      KeyDomain.WALLET_MONERO,
      KeyDomain.VAULT_ENCRYPT,
      KeyDomain.VAULT_HMAC,
      KeyDomain.VAULT_IPNS,
      KeyDomain.SERVICE_TOTP,
      KeyDomain.SERVICE_API,
      KeyDomain.SERVICE_WEBAUTHN,
      KeyDomain.NOSTR,
      KeyDomain.SHAMIR,
      KeyDomain.CANARY
    ];
    
    const keys = domains.map(domain => 
      DomainDerivation.deriveKey(masterSeed, domain, 0)
    );
    
    // All keys should be different
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(keys[i].equals(keys[j])).toBe(false);
      }
    }
  });

  test("works with different master seeds", () => {
    const seed1 = Buffer.from("1".repeat(128), 'hex');
    const seed2 = Buffer.from("f".repeat(128), 'hex');
    
    const key1 = DomainDerivation.deriveKey(seed1, KeyDomain.SSH, 0);
    const key2 = DomainDerivation.deriveKey(seed2, KeyDomain.SSH, 0);
    
    expect(key1.equals(key2)).toBe(false);
  });

  test("domain strings are properly formatted", () => {
    // Test that domain enum values follow expected format
    expect(KeyDomain.SSH).toBe("keyforge:ssh:v1");
    expect(KeyDomain.GPG).toBe("keyforge:gpg:v1");
    expect(KeyDomain.WALLET_BIP39).toBe("keyforge:wallet:bip39:v1");
    expect(KeyDomain.VAULT_ENCRYPT).toBe("keyforge:vault:encrypt:v1");
    expect(KeyDomain.SERVICE_TOTP).toBe("keyforge:service:totp:v1");
    expect(KeyDomain.NOSTR).toBe("keyforge:nostr:v1");
    expect(KeyDomain.SHAMIR).toBe("keyforge:shamir:v1");
    expect(KeyDomain.CANARY).toBe("keyforge:canary:v1");
  });

  test("handles edge cases", () => {
    // Zero index
    const key0 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0);
    expect(key0.length).toBe(32);
    
    // Large index
    const keyLarge = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 999999);
    expect(keyLarge.length).toBe(32);
    expect(key0.equals(keyLarge)).toBe(false);
    
    // Minimum key length
    const key1byte = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0, 1);
    expect(key1byte.length).toBe(1);
    
    // Maximum reasonable key length
    const key256 = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0, 256);
    expect(key256.length).toBe(256);
  });

  test("derived keys have good entropy", () => {
    const key = DomainDerivation.deriveKey(masterSeed, KeyDomain.SSH, 0);
    
    // Check that key isn't all zeros or all ones
    const allZeros = Buffer.alloc(32, 0);
    const allOnes = Buffer.alloc(32, 0xFF);
    
    expect(key.equals(allZeros)).toBe(false);
    expect(key.equals(allOnes)).toBe(false);
    
    // Check for some randomness (not all bytes the same)
    const firstByte = key[0];
    const allSame = key.every(byte => byte === firstByte);
    expect(allSame).toBe(false);
  });

  test("multiple derivation matches individual derivations", () => {
    const individualKeys = [];
    for (let i = 0; i < 5; i++) {
      individualKeys.push(DomainDerivation.deriveKey(masterSeed, KeyDomain.GPG, i));
    }
    
    const multipleKeys = DomainDerivation.deriveMultiple(masterSeed, KeyDomain.GPG, 5);
    
    expect(multipleKeys.length).toBe(individualKeys.length);
    for (let i = 0; i < individualKeys.length; i++) {
      expect(multipleKeys[i].equals(individualKeys[i])).toBe(true);
    }
  });
});