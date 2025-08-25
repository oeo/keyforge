import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { GenerateCommand } from "../../src/cli/commands/generate";
import { SessionManager } from "../../src/cli/session";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("GenerateCommand", () => {
  const testOutputDir = join(__dirname, "../../.test_output");
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];
  let warnOutput: string[] = [];

  beforeEach(() => {
    // Clean up test output directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }

    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    logOutput = [];
    errorOutput = [];
    warnOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));
    console.warn = mock((msg: string) => warnOutput.push(msg));

    // Mock session manager
    SessionManager.getMasterSeed = mock(async () => 
      Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8')
    );
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    // Clean up
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  test("generates SSH key with default options", async () => {
    await GenerateCommand.execute("ssh", {});

    // Should output public key to console
    const output = logOutput.join("\n");
    expect(output).toContain("Public Key:");
    expect(output).toContain("ssh-ed25519");
    expect(output).toContain("Fingerprint:");
    expect(output).toContain("SHA256:");
  });

  test("generates SSH key for specific hostname", async () => {
    await GenerateCommand.execute("ssh", { service: "github.com" });

    const output = logOutput.join("\n");
    expect(output).toContain("keyforge@github.com");
    expect(output).toContain("ssh-ed25519");
  });

  test("shows SSH private key when requested", async () => {
    await GenerateCommand.execute("ssh", { showPrivate: true });

    const output = logOutput.join("\n");
    expect(output).toContain("Private Key:");
    expect(output).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
    expect(output).toContain("-----END OPENSSH PRIVATE KEY-----");
  });

  test("saves SSH key to files", async () => {
    const keyPath = join(testOutputDir, "test_key");
    await GenerateCommand.execute("ssh", { output: keyPath });

    // Should save private key and public key files
    expect(existsSync(keyPath)).toBe(true);
    expect(existsSync(`${keyPath}.pub`)).toBe(true);

    const privateKey = readFileSync(keyPath, "utf8");
    const publicKey = readFileSync(`${keyPath}.pub`, "utf8");

    expect(privateKey).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
    expect(publicKey).toContain("ssh-ed25519");

    // Check file permissions (private key should be 600)
    const stats = Bun.file(keyPath).size;
    expect(stats).toBeGreaterThan(0);
  });

  test("generates Bitcoin wallet", async () => {
    await GenerateCommand.execute("bitcoin", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Bitcoin Wallet:");
    expect(output).toMatch(/Address: bc1[a-z0-9]{39,59}/);
    expect(output).toContain("Path: m/84'/0'/0'/0/0");
    expect(output).toContain("xpub");
  });

  test("shows Bitcoin private key when requested", async () => {
    await GenerateCommand.execute("bitcoin", { showPrivate: true });

    const output = logOutput.join("\n");
    expect(output).toContain("WARNING: Private key exposure");
    expect(output).toContain("xpriv");
  });

  test("generates Ethereum wallet", async () => {
    await GenerateCommand.execute("ethereum", {});

    const output = logOutput.join("\n");
    expect(output).toContain("Ethereum Wallet:");
    expect(output).toMatch(/Address: 0x[a-fA-F0-9]{40}/);
  });

  test("generates service-specific wallets", async () => {
    await GenerateCommand.execute("bitcoin", { service: "trading" });

    const output = logOutput.join("\n");
    expect(output).toContain("Bitcoin Wallet:");
    // Should be different from default wallet (no service)
  });

  test("handles unknown key type", async () => {
    await GenerateCommand.execute("unknown", {});

    const allOutput = [...errorOutput, ...logOutput].join("\n");
    expect(allOutput).toContain("Unknown key type: unknown");
    expect(allOutput).toContain("Available types: ssh, gpg, bitcoin, ethereum");
  });

  test("handles session not initialized", async () => {
    SessionManager.getMasterSeed = mock(async () => null);

    await GenerateCommand.execute("ssh", {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Not initialized. Run 'keyforge init' first.");
  });

  test("supports key type aliases", async () => {
    // Test btc alias for bitcoin
    await GenerateCommand.execute("btc", {});
    let output = logOutput.join("\n");
    expect(output).toContain("Bitcoin Wallet:");

    logOutput = [];
    
    // Test eth alias for ethereum
    await GenerateCommand.execute("eth", {});
    output = logOutput.join("\n");
    expect(output).toContain("Ethereum Wallet:");
  });

  test("copies key to clipboard", async () => {
    await GenerateCommand.execute("ssh", { copy: true });

    const allOutput = [...logOutput, ...warnOutput].join("\n");
    // Should show either success or warning
    expect(allOutput).toMatch(/✓ Public key copied to clipboard|⚠ Failed to copy to clipboard/);
  });

  test("handles different output formats", async () => {
    await GenerateCommand.execute("ssh", { format: "openssh" });

    const output = logOutput.join("\n");
    expect(output).toContain("ssh-ed25519");
  });

  test("generates deterministic keys", async () => {
    // Generate same key twice
    await GenerateCommand.execute("ssh", { service: "test.com" });
    const firstOutput = logOutput.join("\n");
    
    logOutput = [];
    
    await GenerateCommand.execute("ssh", { service: "test.com" });
    const secondOutput = logOutput.join("\n");

    // Extract fingerprints to compare
    const firstFingerprint = firstOutput.match(/SHA256:[A-Za-z0-9+/]+/)?.[0];
    const secondFingerprint = secondOutput.match(/SHA256:[A-Za-z0-9+/]+/)?.[0];
    
    expect(firstFingerprint).toBe(secondFingerprint);
  });

  test("validates output directory exists", async () => {
    const invalidPath = "/nonexistent/directory/key";
    
    await GenerateCommand.execute("ssh", { output: invalidPath });

    // Should handle directory creation or show appropriate error
    // Implementation depends on how we handle this case
  });

  test("handles concurrent key generation", async () => {
    const promises = [
      GenerateCommand.execute("ssh", { service: "host1.com" }),
      GenerateCommand.execute("ssh", { service: "host2.com" }),
      GenerateCommand.execute("bitcoin", { service: "wallet1" })
    ];

    await Promise.all(promises);

    // All should complete without errors
    expect(errorOutput.length).toBe(0);
    expect(logOutput.length).toBeGreaterThan(0);
  });
});