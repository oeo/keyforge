import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { PasswordCommand } from "../../src/cli/commands/password";
import { SessionManager } from "../../src/cli/session";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("PasswordCommand", () => {
  const testVaultDir = join(__dirname, "../../.test_password");
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }

    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));

    // Mock session manager with unique seed
    SessionManager.getMasterSeed = mock(async () => 
      Buffer.from(`pass_seed_${Date.now()}`.padEnd(64, '0'), 'utf8')
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

  test("adds password with username", async () => {
    await PasswordCommand.execute("add", "example.com", {
      username: "alice@example.com"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Adding password for example.com");
    expect(output).toContain("✓ Password saved for example.com");
  });

  test("adds password with generated password", async () => {
    await PasswordCommand.execute("add", "test.com", {
      username: "bob",
      generate: true,
      length: 16
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Adding password for test.com");
    expect(output).toContain("Generated password:");
    expect(output).toContain("✓ Password saved for test.com");
  });

  test("retrieves existing password", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("consistent_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    // First add a password
    await PasswordCommand.execute("add", "gmail.com", {
      username: "alice@gmail.com"
    });

    // Clear output but keep same seed
    logOutput = [];

    // Then retrieve it
    await PasswordCommand.execute("get", "gmail.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Password for gmail.com:");
    expect(output).toContain("Username: alice@gmail.com");
    expect(output).toContain("Password: test_password");
    // Clipboard may fail in test environment
    expect(output).toMatch(/(✓ Password copied to clipboard|⚠ Could not copy to clipboard)/);
  });

  test("handles password not found", async () => {
    await PasswordCommand.execute("get", "nonexistent.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("No password found for nonexistent.com");
    expect(output).toContain("Available sites:");
    expect(output).toContain("No passwords stored");
  });

  test("lists all passwords", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("list_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    // Add some passwords
    await PasswordCommand.execute("add", "site1.com", { username: "user1" });
    await PasswordCommand.execute("add", "site2.com", { username: "user2" });

    // Clear output
    logOutput = [];

    // List passwords
    await PasswordCommand.execute("list", undefined, {});

    const output = logOutput.join("\n");
    expect(output).toContain("Stored Passwords (2):");
    expect(output).toContain("site1.com");
    expect(output).toContain("site2.com");
    expect(output).toContain("Username: user1");
    expect(output).toContain("Username: user2");
  });

  test("lists empty passwords", async () => {
    await PasswordCommand.execute("list", undefined, {});

    const output = logOutput.join("\n");
    expect(output).toContain("No passwords stored");
    expect(output).toContain("Use 'keyforge pass add <site>' to add passwords");
  });

  test("updates existing password", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("update_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    // Add password first
    await PasswordCommand.execute("add", "update.com", { username: "alice" });

    // Clear output
    logOutput = [];

    // Update it
    await PasswordCommand.execute("update", "update.com", {
      username: "bob",
      generate: true
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Updating password for update.com");
    expect(output).toContain("Current username: alice");
    expect(output).toContain("Generated new password:");
    expect(output).toContain("✓ Password updated for update.com");
  });

  test("handles update non-existent password", async () => {
    await PasswordCommand.execute("update", "missing.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("No password found for missing.com");
  });

  test("deletes existing password", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("delete_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    // Add password first
    await PasswordCommand.execute("add", "delete.com", { username: "alice" });

    // Clear output and mock confirmation
    logOutput = [];

    // Delete it
    await PasswordCommand.execute("delete", "delete.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Password deleted for delete.com");
  });

  test("handles delete non-existent password", async () => {
    await PasswordCommand.execute("delete", "missing.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("No password found for missing.com");
  });

  test("generates standalone password", async () => {
    await PasswordCommand.execute("generate", undefined, { length: 20 });

    const output = logOutput.join("\n");
    expect(output).toContain("Generated Password:");
    // Clipboard may fail in test environment
    expect(output).toMatch(/(✓ Password copied to clipboard|⚠ Could not copy to clipboard)/);
  });

  test("handles missing site for add action", async () => {
    await PasswordCommand.execute("add", undefined, {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Site is required for add operation");
  });

  test("handles missing site for get action", async () => {
    await PasswordCommand.execute("get", undefined, {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Site is required for get operation");
  });

  test("handles unknown action", async () => {
    await PasswordCommand.execute("unknown", "site.com", {});

    const allOutput = [...errorOutput, ...logOutput].join("\n");
    expect(allOutput).toContain("Unknown password action: unknown");
    expect(allOutput).toContain("Available actions: add, get, list, update, delete, generate");
  });

  test("handles session not initialized", async () => {
    SessionManager.getMasterSeed = mock(async () => null);

    await PasswordCommand.execute("add", "test.com", {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Not initialized. Run 'keyforge init' first.");
  });

  test("handles password with tags and notes", async () => {
    await PasswordCommand.execute("add", "tagged.com", {
      username: "alice",
      tags: "work,important",
      notes: "Company login"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Adding password for tagged.com");
    expect(output).toContain("✓ Password saved for tagged.com");
  });

  test("supports remove alias for delete", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("remove_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    // Add password first
    await PasswordCommand.execute("add", "remove.com", { username: "alice" });

    // Clear output
    logOutput = [];

    // Remove it using alias
    await PasswordCommand.execute("remove", "remove.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Password deleted for remove.com");
  });

  test("handles concurrent password operations", async () => {
    const promises = [
      PasswordCommand.execute("add", "concurrent1.com", { username: "user1" }),
      PasswordCommand.execute("add", "concurrent2.com", { username: "user2" }),
      PasswordCommand.execute("add", "concurrent3.com", { username: "user3" })
    ];

    await Promise.all(promises);

    // Should complete without errors
    expect(errorOutput.length).toBe(0);
    expect(logOutput.length).toBeGreaterThan(0);
  });
});