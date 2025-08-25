import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { GenerateCommand } from "../../src/cli/commands/generate";
import { SessionManager } from "../../src/cli/session";
import { MasterDerivation } from "../../src/core/derivation";
import * as clipboardy from "clipboardy";

// Mock clipboard
const mockClipboardWrite = mock(() => Promise.resolve());
mock.module("clipboardy", () => ({
  write: mockClipboardWrite
}));

describe("GPG CLI Generation", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  let logOutput: string[] = [];
  let errorOutput: string[] = [];
  let warnOutput: string[] = [];

  beforeEach(async () => {
    // Reset output arrays
    logOutput = [];
    errorOutput = [];
    warnOutput = [];

    // Mock console methods
    console.log = (...args: any[]) => logOutput.push(args.join(" "));
    console.error = (...args: any[]) => errorOutput.push(args.join(" "));
    console.warn = (...args: any[]) => warnOutput.push(args.join(" "));

    // Clear session
    SessionManager.clear();

    // Initialize with test master seed
    const masterSeed = await MasterDerivation.deriveMasterSeed({
      passphrase: "test passphrase",
      username: "test", 
      version: 1
    });

    // Set up session (using private method for testing)
    (SessionManager as any).masterSeed = masterSeed;
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    // Clear session
    SessionManager.clear();
  });

  test("generates GPG key with all options", async () => {
    await GenerateCommand.execute("gpg", {
      name: "Alice Test",
      email: "alice@example.com", 
      comment: "Test GPG key",
      service: "github.com"
    });

    const output = logOutput.join("\n");

    expect(output).toContain("GPG Key Generated:");
    expect(output).toContain("Key ID:");
    expect(output).toContain("Fingerprint:");
    expect(output).toContain("User: Alice Test <alice@example.com>");
    expect(output).toContain("Comment: Test GPG key");
    expect(output).toContain("Public Key:");
    expect(output).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
    expect(output).toContain("Usage:");
    expect(output).toContain("gpg --import");
  });

  test("generates GPG key with minimal options", async () => {
    await GenerateCommand.execute("gpg", {});

    const output = logOutput.join("\n");

    expect(output).toContain("GPG Key Generated:");
    expect(output).toContain("User: Keyforge User <user@keyforge.local>");
    expect(output).not.toContain("Comment:");
  });

  test("shows private key with --show-private", async () => {
    await GenerateCommand.execute("gpg", {
      name: "Test User",
      email: "test@example.com",
      showPrivate: true
    });

    const output = logOutput.join("\n");

    expect(output).toContain("Private Key:");
    expect(output).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
  });

  test("copies public key to clipboard with --copy", async () => {
    await GenerateCommand.execute("gpg", {
      name: "Test User", 
      email: "test@example.com",
      copy: true
    });

    const allOutput = [...logOutput, ...warnOutput].join("\n");
    // Should show either success or warning message
    expect(allOutput).toMatch(/✓ Public key copied to clipboard|⚠ Failed to copy to clipboard/);
  });

  test("validates email format", async () => {
    await GenerateCommand.execute("gpg", {
      name: "Test User",
      email: "invalid-email"
    });

    const output = errorOutput.join("\n");
    expect(output).toContain("Invalid email format");
    
    // Should not generate key if validation fails
    const logStr = logOutput.join("\n"); 
    expect(logStr).not.toContain("GPG Key Generated:");
  });

  test("validates name length", async () => {
    await GenerateCommand.execute("gpg", {
      name: "A",
      email: "test@example.com"
    });

    const output = errorOutput.join("\n");
    expect(output).toContain("Name must be at least 2 characters");
  });

  test("saves to files with --output", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    // Create temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyforge-test-"));
    const outputPath = path.join(tmpDir, "test-key");

    try {
      await GenerateCommand.execute("gpg", {
        name: "Test User",
        email: "test@example.com",
        output: outputPath
      });

      // Check files were created
      const publicFile = `${outputPath}.pub`;
      const privateFile = `${outputPath}.sec`;

      expect(fs.existsSync(publicFile)).toBe(true);
      expect(fs.existsSync(privateFile)).toBe(true);

      // Check content
      const publicContent = fs.readFileSync(publicFile, "utf8");
      const privateContent = fs.readFileSync(privateFile, "utf8");

      expect(publicContent).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
      expect(privateContent).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");

      // Check file permissions (private key should be 600)
      const privateStats = fs.statSync(privateFile);
      expect(privateStats.mode & 0o777).toBe(0o600);

      expect(logOutput.join("\n")).toContain("✓ GPG key saved to");

    } finally {
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("handles session not initialized", async () => {
    // Clear session to simulate uninitialized state
    SessionManager.clear();

    await GenerateCommand.execute("gpg", {
      name: "Test User",
      email: "test@example.com"
    });

    const output = errorOutput.join("\n");
    expect(output).toContain("Not initialized. Run 'keyforge init' first.");
  });

  test("generates deterministic keys for same service", async () => {
    // Generate key twice with same parameters
    await GenerateCommand.execute("gpg", {
      name: "Test User",
      email: "test@example.com", 
      service: "github.com"
    });

    const output1 = logOutput.join("\n");
    const keyId1 = output1.match(/Key ID: ([A-F0-9]{16})/)?.[1];

    // Reset output and generate again
    logOutput = [];
    
    await GenerateCommand.execute("gpg", {
      name: "Test User",
      email: "test@example.com",
      service: "github.com" 
    });

    const output2 = logOutput.join("\n");
    const keyId2 = output2.match(/Key ID: ([A-F0-9]{16})/)?.[1];

    expect(keyId1).toBe(keyId2);
  });
});