import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { VaultManager } from "../../src/vault/storage";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("VaultManager", () => {
  const testSeed = Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');
  const testVaultPath = join(__dirname, "../../.test_vault");
  let vault: VaultManager;

  beforeEach(() => {
    // Clean up any existing test vault
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
    vault = new VaultManager(testSeed, testVaultPath);
  });

  afterEach(() => {
    // Clean up test vault
    if (existsSync(testVaultPath)) {
      rmSync(testVaultPath, { recursive: true, force: true });
    }
  });

  test("initializes empty vault", () => {
    expect(vault.getVaultData().version).toBe(1);
    expect(vault.getVaultData().passwords).toEqual([]);
    expect(vault.getVaultData().notes).toEqual([]);
    expect(vault.getVaultData().config.services.ssh).toEqual([]);
  });

  test("adds and retrieves passwords", async () => {
    await vault.addPassword({
      site: "example.com",
      username: "alice",
      password: "secret123",
      notes: "Test account",
      tags: ["work"]
    });

    const passwords = vault.getPasswords();
    expect(passwords).toHaveLength(1);
    expect(passwords[0].site).toBe("example.com");
    expect(passwords[0].username).toBe("alice");
    expect(passwords[0].password).toBe("secret123");

    // Get specific password
    const password = vault.getPassword("example.com");
    expect(password).toBeTruthy();
    expect(password?.username).toBe("alice");
  });

  test("updates existing passwords", async () => {
    await vault.addPassword({
      site: "example.com",
      username: "alice",
      password: "secret123",
      tags: []
    });

    await vault.updatePassword("example.com", {
      password: "newsecret456",
      notes: "Updated password"
    });

    const password = vault.getPassword("example.com");
    expect(password?.password).toBe("newsecret456");
    expect(password?.notes).toBe("Updated password");
    expect(password?.passwordHistory).toHaveLength(1);
    expect(password?.passwordHistory[0].password).toBe("secret123");
  });

  test("deletes passwords", async () => {
    await vault.addPassword({
      site: "example.com",
      username: "alice",
      password: "secret123",
      tags: []
    });

    expect(vault.getPasswords()).toHaveLength(1);

    await vault.deletePassword("example.com");
    expect(vault.getPasswords()).toHaveLength(0);
    expect(vault.getPassword("example.com")).toBeUndefined();
  });

  test("searches passwords by tags", async () => {
    await vault.addPassword({
      site: "work1.com",
      username: "alice",
      password: "pass1",
      tags: ["work", "important"]
    });

    await vault.addPassword({
      site: "personal.com",
      username: "alice",
      password: "pass2",
      tags: ["personal"]
    });

    await vault.addPassword({
      site: "work2.com",
      username: "bob",
      password: "pass3",
      tags: ["work"]
    });

    const workPasswords = vault.searchPasswords({ tags: ["work"] });
    expect(workPasswords).toHaveLength(2);
    expect(workPasswords.map(p => p.site).sort()).toEqual(["work1.com", "work2.com"]);

    const importantPasswords = vault.searchPasswords({ tags: ["important"] });
    expect(importantPasswords).toHaveLength(1);
    expect(importantPasswords[0].site).toBe("work1.com");
  });

  test("adds and retrieves secure notes", async () => {
    await vault.addNote({
      title: "Important Note",
      content: "This is sensitive information",
      attachments: []
    });

    const notes = vault.getNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Important Note");
    expect(notes[0].content).toBe("This is sensitive information");

    const note = vault.getNote(notes[0].id);
    expect(note).toBeTruthy();
    expect(note?.title).toBe("Important Note");
  });

  test("updates and deletes notes", async () => {
    const noteId = await vault.addNote({
      title: "Test Note",
      content: "Original content"
    });

    await vault.updateNote(noteId, {
      title: "Updated Note",
      content: "Updated content"
    });

    let note = vault.getNote(noteId);
    expect(note?.title).toBe("Updated Note");
    expect(note?.content).toBe("Updated content");

    await vault.deleteNote(noteId);
    expect(vault.getNote(noteId)).toBeUndefined();
  });

  test("tracks SSH key configuration", async () => {
    await vault.addSSHConfig({
      hostname: "github.com",
      publicKey: "ssh-ed25519 AAAA...test keyforge@github.com",
      fingerprint: "SHA256:test123"
    });

    const sshConfigs = vault.getSSHConfigs();
    expect(sshConfigs).toHaveLength(1);
    expect(sshConfigs[0].hostname).toBe("github.com");
    expect(sshConfigs[0].publicKey).toContain("ssh-ed25519");
  });

  test("tracks wallet configuration", async () => {
    await vault.addWalletConfig({
      service: "personal",
      type: "bitcoin",
      address: "bc1qtest...",
      xpub: "xpub123...",
      path: "m/84'/0'/0'/0/0"
    });

    const walletConfigs = vault.getWalletConfigs();
    expect(walletConfigs).toHaveLength(1);
    expect(walletConfigs[0].type).toBe("bitcoin");
    expect(walletConfigs[0].service).toBe("personal");
  });

  test("persists and loads vault data", async () => {
    await vault.addPassword({
      site: "test.com",
      username: "user",
      password: "pass",
      tags: ["test"]
    });

    await vault.addNote({
      title: "Test Note",
      content: "Test content"
    });

    // Save to disk
    await vault.save();
    expect(existsSync(testVaultPath)).toBe(true);

    // Create new vault instance and load
    const vault2 = new VaultManager(testSeed, testVaultPath);
    await vault2.load();

    // Verify data was loaded
    expect(vault2.getPasswords()).toHaveLength(1);
    expect(vault2.getPassword("test.com")?.username).toBe("user");
    expect(vault2.getNotes()).toHaveLength(1);
    expect(vault2.getNotes()[0].title).toBe("Test Note");
  });

  test("auto-saves on modifications", async () => {
    await vault.addPassword({
      site: "auto-save.com",
      username: "test",
      password: "test",
      tags: []
    });

    // Should auto-save
    expect(existsSync(testVaultPath)).toBe(true);

    // Load in new instance
    const vault2 = new VaultManager(testSeed, testVaultPath);
    await vault2.load();
    expect(vault2.getPassword("auto-save.com")).toBeTruthy();
  });

  test("calculates vault checksum", async () => {
    await vault.addPassword({
      site: "checksum-test.com",
      username: "test",
      password: "test",
      tags: []
    });

    const checksum1 = await vault.calculateChecksum();
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex

    // Modify vault
    await vault.addPassword({
      site: "checksum-test2.com",
      username: "test2",
      password: "test2",
      tags: []
    });

    const checksum2 = await vault.calculateChecksum();
    expect(checksum2).not.toBe(checksum1);
  });

  test("handles concurrent access safely", async () => {
    // Add passwords concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      vault.addPassword({
        site: `concurrent-${i}.com`,
        username: "user",
        password: `pass${i}`,
        tags: []
      })
    );

    await Promise.all(promises);

    const passwords = vault.getPasswords();
    expect(passwords).toHaveLength(10);

    // All should have unique sites
    const sites = passwords.map(p => p.site);
    const uniqueSites = new Set(sites);
    expect(uniqueSites.size).toBe(10);
  });

  test("validates vault integrity", async () => {
    await vault.addPassword({
      site: "integrity.com",
      username: "user",
      password: "pass",
      tags: []
    });

    // Should pass validation
    expect(await vault.validateIntegrity()).toBe(true);

    // Simulate corruption by directly modifying vault data
    const vaultData = vault.getVaultData();
    vaultData.metadata.checksum = "invalid";

    expect(await vault.validateIntegrity()).toBe(false);
  });

  test("generates unique IDs", () => {
    const id1 = vault.generateId();
    const id2 = vault.generateId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[a-f0-9-]{36}$/); // UUID format
  });

  test("handles malformed vault files", async () => {
    // Write invalid data to vault file
    await Bun.write(testVaultPath, "invalid json data");

    const vault2 = new VaultManager(testSeed, testVaultPath);
    
    // Should not throw and should create fresh vault
    await vault2.load();
    expect(vault2.getPasswords()).toEqual([]);
  });
});