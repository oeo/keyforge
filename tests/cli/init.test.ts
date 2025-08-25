import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { InitCommand } from "../../src/cli/commands/init";
import { SessionManager } from "../../src/cli/session";

describe("InitCommand", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));

    // Clear any existing session
    SessionManager.clear();
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clear session
    SessionManager.clear();
  });

  test("initializes with provided passphrase", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase",
      username: "alice"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Deriving master seed...");
    expect(output).toContain("✓ Keyforge initialized successfully");

    // Session should be active
    const seed = await SessionManager.getMasterSeed();
    expect(seed).toBeTruthy();
  });

  test("initializes with default username", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Keyforge initialized successfully");
  });

  test("prompts for passphrase when not provided", async () => {
    // Mock the SessionManager.initialize to simulate prompt
    const originalInitialize = SessionManager.initialize;
    SessionManager.initialize = mock(async (passphrase?: string, username?: string) => {
      expect(passphrase).toBeUndefined(); // Should be undefined, triggering prompt
      return Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');
    });

    await InitCommand.execute({});

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Keyforge initialized successfully");

    // Restore original method
    SessionManager.initialize = originalInitialize;
  });

  test("displays payment wallet information", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase",
      username: "alice"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Bitcoin payment address:");
    expect(output).toMatch(/bc1[a-z0-9]{39,59}/);
    expect(output).toContain("Fund this address to enable Arweave storage");
  });

  test("shows helpful usage instructions", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Ready! Try these commands:");
    expect(output).toContain("keyforge generate ssh github.com");
    expect(output).toContain("keyforge generate bitcoin");
    expect(output).toContain("keyforge vault");
  });

  test("handles initialization errors", async () => {
    // Mock SessionManager.initialize to throw error
    const originalInitialize = SessionManager.initialize;
    SessionManager.initialize = mock(async () => {
      throw new Error("Initialization failed");
    });

    await InitCommand.execute({
      passphrase: "test passphrase"
    });

    const output = errorOutput.join("\n");
    expect(output).toContain("Failed to initialize Keyforge");
    expect(output).toContain("Initialization failed");

    // Restore original method
    SessionManager.initialize = originalInitialize;
  });

  test("shows version information when requested", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase",
      showVersion: true
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Keyforge v");
    expect(output).toContain("Deterministic key derivation system");
  });

  test("validates passphrase strength", async () => {
    await InitCommand.execute({
      passphrase: "weak"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("⚠ Warning: Short passphrase detected");
    expect(output).toContain("Consider using a longer passphrase for better security");
  });

  test("estimates vault storage costs", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Vault storage estimate:");
    expect(output).toContain("~$0.01-0.05 for typical vault sizes");
  });

  test("handles concurrent initialization attempts", async () => {
    const promises = [
      InitCommand.execute({ passphrase: "test1" }),
      InitCommand.execute({ passphrase: "test2" }),
      InitCommand.execute({ passphrase: "test3" })
    ];

    await Promise.all(promises);

    // Should complete without errors
    expect(errorOutput.length).toBe(0);
  });

  test("reinitializes existing session", async () => {
    // Initialize first time
    await InitCommand.execute({
      passphrase: "first passphrase",
      username: "alice"
    });

    logOutput = []; // Clear output

    // Initialize again with different passphrase
    await InitCommand.execute({
      passphrase: "second passphrase",
      username: "bob"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Reinitializing Keyforge session");
    expect(output).toContain("✓ Keyforge initialized successfully");
  });

  test("shows security recommendations", async () => {
    await InitCommand.execute({
      passphrase: "test passphrase"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Security recommendations:");
    expect(output).toContain("• Use a strong, unique passphrase");
    expect(output).toContain("• Consider using Tor for enhanced privacy");
    expect(output).toContain("• Regular vault backups are automatic");
  });
});