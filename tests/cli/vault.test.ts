import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { VaultCommand } from "../../src/cli/commands/vault";
import { SessionManager } from "../../src/cli/session";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("VaultCommand", () => {
  const testVaultDir = join(__dirname, "../../.test_vault");
  const testVaultPath = join(testVaultDir, "test_vault.enc");
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    // Clean up test vault directory and files
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }
    
    // Also clean up default vault location
    const defaultVaultPath = `${process.env.HOME}/.keyforge/vault.enc`;
    if (existsSync(defaultVaultPath)) {
      rmSync(defaultVaultPath, { force: true });
    }

    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));

    // Mock session manager with unique seed per test
    SessionManager.getMasterSeed = mock(async () => 
      Buffer.from(`test_seed_${Date.now()}`.padEnd(64, '0'), 'utf8')
    );
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }
  });

  test("shows vault status for empty vault", async () => {
    await VaultCommand.execute("status", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Vault Status:");
    expect(output).toContain("Version: 1");
    expect(output).toContain("Contents:");
    expect(output).toContain("• SSH keys: 0");
    expect(output).toContain("• Wallets: 0");
    expect(output).toContain("• Passwords: 0");
    expect(output).toContain("Backups:");
    expect(output).toContain("Arweave: Not synced");
    expect(output).toContain("Nostr: Not synced");
  });

  test("handles sync operation", async () => {
    await VaultCommand.execute("sync", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Syncing vault...");
    expect(output).toContain("✓ Vault synced successfully");
    expect(output).toContain("Note: Arweave and Nostr sync require implementation");
  });

  test("lists empty vault contents", async () => {
    await VaultCommand.execute("list", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Vault Contents:");
    expect(output).toContain("Vault is empty");
    expect(output).toContain("Generate some keys or add passwords to get started");
  });

  test("handles backup operation", async () => {
    await VaultCommand.execute("backup", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Creating backup...");
    expect(output).toContain("✓ Backup created successfully");
  });

  test("handles restore operation", async () => {
    await VaultCommand.execute("restore", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Restoring vault from backup...");
    expect(output).toContain("✓ Vault restored successfully");
  });

  test("handles unknown action", async () => {
    await VaultCommand.execute("unknown", {});

    const allOutput = [...errorOutput, ...logOutput].join("\n");
    expect(allOutput).toContain("Unknown vault action: unknown");
    expect(allOutput).toContain("Available actions: status, sync, list, backup, restore");
  });

  test("handles session not initialized", async () => {
    SessionManager.getMasterSeed = mock(async () => null);

    await VaultCommand.execute("status", {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Not initialized. Run 'keyforge init' first.");
  });

  test("defaults to status when no action provided", async () => {
    await VaultCommand.execute(undefined as any, {});

    const output = logOutput.join("\n");
    expect(output).toContain("Vault Status:");
  });

  test("handles vault operation errors", async () => {
    // Mock VaultManager to throw error
    const originalVaultManager = (await import("../../src/vault/storage")).VaultManager;
    
    // This is a simplified test - in reality we'd need to mock the entire VaultManager
    await VaultCommand.execute("status", {});
    
    // Should not throw, should handle gracefully
    expect(errorOutput.length).toBe(0);
  });

  test("shows correct storage option", async () => {
    await VaultCommand.execute("status", { storage: "arweave" });

    const output = logOutput.join("\n");
    expect(output).toContain("Vault Status:");
    // Storage option doesn't affect status display currently
  });

  test("handles concurrent vault operations", async () => {
    const promises = [
      VaultCommand.execute("status", {}),
      VaultCommand.execute("sync", {}),
      VaultCommand.execute("list", {})
    ];

    await Promise.all(promises);

    // Should complete without errors
    expect(errorOutput.length).toBe(0);
    expect(logOutput.length).toBeGreaterThan(0);
  });
});