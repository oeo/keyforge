import { test, expect, describe } from "bun:test";
import { SSHGenerator } from "../../src/generators/ssh";
import { createHash } from "node:crypto";

describe("SSHGenerator", () => {
  const testSeed = Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');

  test("generates valid Ed25519 SSH keypair", () => {
    const sshKey = SSHGenerator.generate(testSeed);
    
    expect(sshKey.algorithm).toBe("ed25519");
    expect(sshKey.publicKey).toMatch(/^ssh-ed25519 [A-Za-z0-9+/]+=* keyforge$/);
    expect(sshKey.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(sshKey.privateKey).toContain("END OPENSSH PRIVATE KEY");
    expect(sshKey.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+=*$/);
  });

  test("generates different keys for different hostnames", () => {
    const github = SSHGenerator.generate(testSeed, "github.com");
    const gitlab = SSHGenerator.generate(testSeed, "gitlab.com");
    
    expect(github.publicKey).not.toBe(gitlab.publicKey);
    expect(github.fingerprint).not.toBe(gitlab.fingerprint);
    expect(github.privateKey).not.toBe(gitlab.privateKey);
  });

  test("same hostname always generates same key", () => {
    const key1 = SSHGenerator.generate(testSeed, "example.com");
    const key2 = SSHGenerator.generate(testSeed, "example.com");
    
    expect(key1.publicKey).toBe(key2.publicKey);
    expect(key1.fingerprint).toBe(key2.fingerprint);
    expect(key1.privateKey).toBe(key2.privateKey);
  });

  test("no hostname generates consistent default key", () => {
    const key1 = SSHGenerator.generate(testSeed);
    const key2 = SSHGenerator.generate(testSeed);
    
    expect(key1.publicKey).toBe(key2.publicKey);
    expect(key1.publicKey).toMatch(/keyforge$/); // Default comment
  });

  test("generates keys for different seeds", () => {
    const seed1 = Buffer.from("seed1".padEnd(64, '1'), 'utf8');
    const seed2 = Buffer.from("seed2".padEnd(64, '2'), 'utf8');
    
    const key1 = SSHGenerator.generate(seed1, "test.com");
    const key2 = SSHGenerator.generate(seed2, "test.com");
    
    expect(key1.publicKey).not.toBe(key2.publicKey);
  });

  test("public key format is correct", () => {
    const sshKey = SSHGenerator.generate(testSeed, "test.com");
    
    const parts = sshKey.publicKey.split(' ');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("ssh-ed25519");
    expect(parts[2]).toBe("keyforge@test.com");
    
    // Verify base64 encoding of key data
    const keyData = Buffer.from(parts[1], 'base64');
    expect(keyData.length).toBeGreaterThan(32); // Has type header + key
  });

  test("private key format is OpenSSH compatible", () => {
    const sshKey = SSHGenerator.generate(testSeed, "test.com");
    
    expect(sshKey.privateKey.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe(true);
    expect(sshKey.privateKey.endsWith("-----END OPENSSH PRIVATE KEY-----")).toBe(true);
    
    // Extract base64 content
    const lines = sshKey.privateKey.split('\n');
    expect(lines.length).toBeGreaterThan(4); // BEGIN, content lines, END, empty
    
    const dataLines = lines.slice(1, -2); // Remove BEGIN/END and empty lines
    const data = Buffer.from(dataLines.join(''), 'base64');
    
    // Should start with openssh-key-v1 magic
    expect(data.toString('ascii', 0, 15)).toBe("openssh-key-v1\0");
  });

  test("fingerprint is SHA256 of public key", () => {
    const sshKey = SSHGenerator.generate(testSeed, "test.com");
    
    // Extract public key data
    const parts = sshKey.publicKey.split(' ');
    const keyData = Buffer.from(parts[1], 'base64');
    
    // Skip the type header, get just the Ed25519 public key (32 bytes)
    const ed25519Key = keyData.slice(keyData.length - 32);
    
    // Calculate expected fingerprint
    const hash = createHash("sha256");
    hash.update(ed25519Key);
    const expectedFingerprint = `SHA256:${hash.digest("base64").replace(/=+$/, "")}`;
    
    expect(sshKey.fingerprint).toBe(expectedFingerprint);
  });

  test("hostname to index conversion is deterministic", () => {
    // This tests internal method - may need to make it public for testing
    const index1 = SSHGenerator.hostnameToIndex("github.com");
    const index2 = SSHGenerator.hostnameToIndex("github.com"); 
    const index3 = SSHGenerator.hostnameToIndex("gitlab.com");
    
    expect(index1).toBe(index2);
    expect(index1).not.toBe(index3);
    expect(typeof index1).toBe('number');
    expect(index1).toBeGreaterThanOrEqual(0);
  });

  test("handles special characters in hostname", () => {
    const key1 = SSHGenerator.generate(testSeed, "server-1.example.com");
    const key2 = SSHGenerator.generate(testSeed, "server_2.example.com");
    const key3 = SSHGenerator.generate(testSeed, "서버.한국");
    
    expect(key1.publicKey).not.toBe(key2.publicKey);
    expect(key1.publicKey).not.toBe(key3.publicKey);
    expect(key2.publicKey).not.toBe(key3.publicKey);
    
    // All should be valid
    expect(key1.fingerprint).toMatch(/^SHA256:/);
    expect(key2.fingerprint).toMatch(/^SHA256:/);
    expect(key3.fingerprint).toMatch(/^SHA256:/);
  });

  test("keys are cryptographically valid", () => {
    const sshKey = SSHGenerator.generate(testSeed, "crypto-test.com");
    
    // Public key should be 32 bytes for Ed25519
    const parts = sshKey.publicKey.split(' ');
    const keyData = Buffer.from(parts[1], 'base64');
    const ed25519Key = keyData.slice(keyData.length - 32);
    
    expect(ed25519Key.length).toBe(32);
    
    // Should not be all zeros or all ones
    const allZeros = Buffer.alloc(32, 0);
    const allOnes = Buffer.alloc(32, 0xFF);
    expect(ed25519Key.equals(allZeros)).toBe(false);
    expect(ed25519Key.equals(allOnes)).toBe(false);
  });

  test("handles edge cases", () => {
    // Empty hostname should work (uses index 0)
    const emptyKey = SSHGenerator.generate(testSeed, "");
    expect(emptyKey.publicKey).toContain("keyforge");
    
    // Very long hostname should work
    const longHostname = "a".repeat(1000) + ".com";
    const longKey = SSHGenerator.generate(testSeed, longHostname);
    expect(longKey.fingerprint).toMatch(/^SHA256:/);
    
    // Hostname with special SSH chars should be handled
    const specialKey = SSHGenerator.generate(testSeed, "user@host:22");
    expect(specialKey.publicKey).toContain("keyforge@user@host:22");
  });
});