import { test, expect, describe } from "bun:test";
import { VaultEncryption } from "../../src/vault/encryption";
import { MasterDerivation } from "../../src/core/derivation";

describe("VaultEncryption", () => {
  const testSeed = Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');

  const sampleVaultData = {
    version: 1,
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-01T00:00:00.000Z",
    config: {
      services: {
        ssh: [],
        wallets: [],
        totp: []
      }
    },
    passwords: [
      {
        id: "test-1",
        site: "example.com",
        username: "alice",
        password: "secret123",
        notes: "Test account",
        tags: ["work"],
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        passwordHistory: []
      }
    ],
    notes: [
      {
        id: "note-1",
        title: "Test Note",
        content: "This is a test secure note",
        attachments: [],
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z"
      }
    ],
    metadata: {
      checksum: "abc123",
      backups: {}
    }
  };

  test("encrypts and decrypts vault data", () => {
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(sampleVaultData, testSeed);

    expect(encrypted).toBeInstanceOf(Buffer);
    expect(nonce).toBeInstanceOf(Buffer);
    expect(tag).toBeInstanceOf(Buffer);
    expect(nonce.length).toBe(12); // ChaCha20 nonce
    expect(tag.length).toBe(16);   // Poly1305 tag

    // Decrypt and verify
    const decrypted = VaultEncryption.decrypt(encrypted, nonce, tag, testSeed);
    expect(decrypted).toEqual(sampleVaultData);
  });

  test("encryption is deterministic with same nonce", () => {
    const fixedNonce = Buffer.alloc(12, 0x42);
    
    const result1 = VaultEncryption.encryptWithNonce(sampleVaultData, testSeed, fixedNonce);
    const result2 = VaultEncryption.encryptWithNonce(sampleVaultData, testSeed, fixedNonce);

    expect(result1.encrypted.equals(result2.encrypted)).toBe(true);
    expect(result1.tag.equals(result2.tag)).toBe(true);
  });

  test("different seeds produce different ciphertexts", () => {
    const seed1 = Buffer.from("seed1".padEnd(64, '1'), 'utf8');
    const seed2 = Buffer.from("seed2".padEnd(64, '2'), 'utf8');
    const fixedNonce = Buffer.alloc(12, 0x42);

    const result1 = VaultEncryption.encryptWithNonce(sampleVaultData, seed1, fixedNonce);
    const result2 = VaultEncryption.encryptWithNonce(sampleVaultData, seed2, fixedNonce);

    expect(result1.encrypted.equals(result2.encrypted)).toBe(false);
    expect(result1.tag.equals(result2.tag)).toBe(false);
  });

  test("tampered ciphertext fails to decrypt", () => {
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(sampleVaultData, testSeed);

    // Tamper with encrypted data
    const tamperedEncrypted = Buffer.from(encrypted);
    tamperedEncrypted[0] = tamperedEncrypted[0] ^ 0x01;

    expect(() => {
      VaultEncryption.decrypt(tamperedEncrypted, nonce, tag, testSeed);
    }).toThrow();
  });

  test("tampered tag fails to decrypt", () => {
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(sampleVaultData, testSeed);

    // Tamper with tag
    const tamperedTag = Buffer.from(tag);
    tamperedTag[0] = tamperedTag[0] ^ 0x01;

    expect(() => {
      VaultEncryption.decrypt(encrypted, nonce, tamperedTag, testSeed);
    }).toThrow();
  });

  test("wrong seed fails to decrypt", () => {
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(sampleVaultData, testSeed);
    const wrongSeed = Buffer.from("wrong_seed".padEnd(64, '0'), 'utf8');

    expect(() => {
      VaultEncryption.decrypt(encrypted, nonce, tag, wrongSeed);
    }).toThrow();
  });

  test("compresses data before encryption", () => {
    // Large vault with repetitive data
    const largeVault = {
      ...sampleVaultData,
      passwords: Array.from({ length: 100 }, (_, i) => ({
        id: `pass-${i}`,
        site: `site-${i}.com`,
        username: "user",
        password: "password123",
        notes: "Repeated note content ".repeat(10),
        tags: ["tag1", "tag2"],
        created: "2024-01-01T00:00:00.000Z",
        modified: "2024-01-01T00:00:00.000Z",
        passwordHistory: []
      }))
    };

    const { encrypted, nonce, tag } = VaultEncryption.encrypt(largeVault, testSeed);
    const originalSize = JSON.stringify(largeVault).length;

    // Compressed encrypted data should be significantly smaller
    expect(encrypted.length).toBeLessThan(originalSize * 0.5);

    // Should still decrypt correctly
    const decrypted = VaultEncryption.decrypt(encrypted, nonce, tag, testSeed);
    expect(decrypted.passwords.length).toBe(100);
  });

  test("handles empty vault data", () => {
    const emptyVault = {
      version: 1,
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-01T00:00:00.000Z",
      config: { services: { ssh: [], wallets: [], totp: [] } },
      passwords: [],
      notes: [],
      metadata: { checksum: "", backups: {} }
    };

    const { encrypted, nonce, tag } = VaultEncryption.encrypt(emptyVault, testSeed);
    const decrypted = VaultEncryption.decrypt(encrypted, nonce, tag, testSeed);

    expect(decrypted).toEqual(emptyVault);
  });

  test("encryption output is not deterministic with random nonces", () => {
    const result1 = VaultEncryption.encrypt(sampleVaultData, testSeed);
    const result2 = VaultEncryption.encrypt(sampleVaultData, testSeed);

    // Should have different nonces and therefore different ciphertexts
    expect(result1.nonce.equals(result2.nonce)).toBe(false);
    expect(result1.encrypted.equals(result2.encrypted)).toBe(false);
    expect(result1.tag.equals(result2.tag)).toBe(false);

    // But both should decrypt to same data
    const decrypted1 = VaultEncryption.decrypt(result1.encrypted, result1.nonce, result1.tag, testSeed);
    const decrypted2 = VaultEncryption.decrypt(result2.encrypted, result2.nonce, result2.tag, testSeed);

    expect(decrypted1).toEqual(decrypted2);
  });

  test("derives consistent encryption keys", () => {
    // Test that the same master seed always derives the same encryption key
    // by encrypting with a fixed nonce and comparing results
    const fixedNonce = Buffer.alloc(12, 0x55);

    const result1 = VaultEncryption.encryptWithNonce(sampleVaultData, testSeed, fixedNonce);
    const result2 = VaultEncryption.encryptWithNonce(sampleVaultData, testSeed, fixedNonce);

    expect(result1.encrypted.equals(result2.encrypted)).toBe(true);
    expect(result1.tag.equals(result2.tag)).toBe(true);
  });
});