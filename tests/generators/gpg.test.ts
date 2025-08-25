import { expect, test, describe } from "bun:test";
import { GPGGenerator } from "../../src/generators/gpg";
import { MasterDerivation } from "../../src/core/derivation";

describe("GPGGenerator", () => {
  const testSeed = Buffer.from("test_master_seed_32_bytes_exactly!!", "utf8");

  test("generates deterministic GPG keys", async () => {
    const gpg1 = GPGGenerator.generate(testSeed, {
      name: "Alice Test",
      email: "alice@example.com",
      service: "github.com"
    });

    const gpg2 = GPGGenerator.generate(testSeed, {
      name: "Alice Test", 
      email: "alice@example.com",
      service: "github.com"
    });

    expect(gpg1.keyId).toBe(gpg2.keyId);
    expect(gpg1.fingerprint).toBe(gpg2.fingerprint);
    expect(gpg1.publicKey).toBe(gpg2.publicKey);
    expect(gpg1.privateKey).toBe(gpg2.privateKey);
  });

  test("generates different keys for different services", async () => {
    const github = GPGGenerator.generate(testSeed, {
      name: "Alice Test",
      email: "alice@example.com", 
      service: "github.com"
    });

    const gitlab = GPGGenerator.generate(testSeed, {
      name: "Alice Test",
      email: "alice@example.com",
      service: "gitlab.com"
    });

    expect(github.keyId).not.toBe(gitlab.keyId);
    expect(github.fingerprint).not.toBe(gitlab.fingerprint);
    expect(github.publicKey).not.toBe(gitlab.publicKey);
  });

  test("generates valid GPG key structure", async () => {
    const gpg = GPGGenerator.generate(testSeed, {
      name: "Test User",
      email: "test@example.com",
      comment: "Test key"
    });

    expect(gpg.algorithm).toBe("ed25519");
    expect(gpg.keyId).toMatch(/^[A-F0-9]{16}$/);
    expect(gpg.fingerprint).toMatch(/^[A-F0-9]{40}$/);
    expect(gpg.publicKey).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
    expect(gpg.publicKey).toContain("-----END PGP PUBLIC KEY BLOCK-----");
    expect(gpg.privateKey).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
    expect(gpg.privateKey).toContain("-----END PGP PRIVATE KEY BLOCK-----");
    
    expect(gpg.userInfo.name).toBe("Test User");
    expect(gpg.userInfo.email).toBe("test@example.com");
    expect(gpg.userInfo.comment).toBe("Test key");
  });

  test("uses defaults for missing user info", async () => {
    const gpg = GPGGenerator.generate(testSeed, {});

    expect(gpg.userInfo.name).toBe("Keyforge User");
    expect(gpg.userInfo.email).toBe("user@keyforge.local");
    expect(gpg.userInfo.comment).toBeUndefined();
  });

  test("validates options correctly", () => {
    const valid = GPGGenerator.validateOptions({
      name: "Alice",
      email: "alice@example.com"
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalidEmail = GPGGenerator.validateOptions({
      name: "Alice",
      email: "not-an-email"
    });
    expect(invalidEmail.valid).toBe(false);
    expect(invalidEmail.errors).toContain("Invalid email format");

    const shortName = GPGGenerator.validateOptions({
      name: "A",
      email: "alice@example.com"
    });
    expect(shortName.valid).toBe(false);
    expect(shortName.errors).toContain("Name must be at least 2 characters");
  });

  test("generates key usage information", () => {
    const usage = GPGGenerator.getKeyUsage();
    expect(usage).toContain("Key capabilities:");
    expect(usage).toContain("Encryption (E)");
    expect(usage).toContain("Signing (S)");
    expect(usage).toContain("Authentication (A)");
    expect(usage).toContain("gpg --import");
    expect(usage).toContain("git config user.signingkey");
  });

  test("generates different keys for same user info but different services", async () => {
    const service1 = GPGGenerator.generate(testSeed, {
      name: "Same User",
      email: "same@example.com",
      service: "service1"
    });

    const service2 = GPGGenerator.generate(testSeed, {
      name: "Same User", 
      email: "same@example.com",
      service: "service2"
    });

    expect(service1.keyId).not.toBe(service2.keyId);
    expect(service1.publicKey).not.toBe(service2.publicKey);
    
    // But user info should be the same
    expect(service1.userInfo.name).toBe(service2.userInfo.name);
    expect(service1.userInfo.email).toBe(service2.userInfo.email);
  });

  test("works with real master seed", async () => {
    const masterSeed = await MasterDerivation.deriveMasterSeed({
      passphrase: "test passphrase",
      username: "testuser", 
      version: 1
    });

    const gpg = GPGGenerator.generate(masterSeed, {
      name: "Real Test",
      email: "real@test.com"
    });

    expect(gpg.keyId).toMatch(/^[A-F0-9]{16}$/);
    expect(gpg.publicKey).toContain("PGP PUBLIC KEY");
    expect(gpg.privateKey).toContain("PGP PRIVATE KEY");
  });
});