import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { TOTPCommand } from "../../src/cli/commands/totp";
import { SessionManager } from "../../src/cli/session";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("TOTPCommand", () => {
  const testVaultDir = join(__dirname, "../../.test_totp");
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
      Buffer.from(`totp_seed_${Date.now()}`.padEnd(64, '0'), 'utf8')
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

  test("generates TOTP code for service", async () => {
    await TOTPCommand.execute("github.com", {});

    const output = logOutput.join("\n");
    expect(output).toContain("TOTP for github.com:");
    expect(output).toMatch(/\d{3} \d{3}/); // Should show formatted 6-digit code
    expect(output).toContain("Valid for");
    expect(output).toContain("seconds");
  });

  test("generates TOTP code with QR code option", async () => {
    await TOTPCommand.execute("newservice.com", { qr: true });

    const output = logOutput.join("\n");
    expect(output).toContain("TOTP for newservice.com:");
    expect(output).toMatch(/\d{3} \d{3}/);
  });

  test("generates TOTP code with secret option", async () => {
    await TOTPCommand.execute("secrettest.com", { secret: true });

    const output = logOutput.join("\n");
    expect(output).toContain("TOTP for secrettest.com:");
    expect(output).toContain("⚠ Secret (keep secure):");
    // Should contain base32 encoded secret
    expect(output).toMatch(/[A-Z2-7]+/);
  });

  test("adds new TOTP service", async () => {
    await TOTPCommand.execute("addtest.com", { add: true });

    const output = logOutput.join("\n");
    expect(output).toContain("Adding TOTP service: addtest.com");
    expect(output).toContain("✓ TOTP service added: addtest.com");
    expect(output).toContain("Setup Information:");
    expect(output).toContain("Service: addtest.com");
    expect(output).toContain("Algorithm: SHA1");
    expect(output).toContain("Digits: 6");
    expect(output).toContain("Period: 30 seconds");
  });

  test("adds TOTP service with custom settings", async () => {
    await TOTPCommand.execute("custom.com", {
      add: true,
      algorithm: "SHA256",
      digits: 8,
      period: 60
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Adding TOTP service: custom.com");
    expect(output).toContain("Algorithm: SHA256");
    expect(output).toContain("Digits: 8");
    expect(output).toContain("Period: 60 seconds");
  });

  test("generates deterministic codes", async () => {
    // Generate code twice for same service
    await TOTPCommand.execute("deterministic.com", {});
    const firstOutput = logOutput.join("\n");

    // Extract the code
    const firstCode = firstOutput.match(/(\d{3} \d{3})/)?.[1];

    // Clear output and generate again
    logOutput = [];
    await TOTPCommand.execute("deterministic.com", {});
    const secondOutput = logOutput.join("\n");
    const secondCode = secondOutput.match(/(\d{3} \d{3})/)?.[1];

    // Codes should be the same (within the same 30-second window)
    expect(firstCode).toBe(secondCode);
  });

  test("generates different codes for different services", async () => {
    // Generate codes for two different services
    await TOTPCommand.execute("service1.com", {});
    const firstOutput = logOutput.join("\n");
    const firstCode = firstOutput.match(/(\d{3} \d{3})/)?.[1];

    logOutput = [];
    await TOTPCommand.execute("service2.com", {});
    const secondOutput = logOutput.join("\n");
    const secondCode = secondOutput.match(/(\d{3} \d{3})/)?.[1];

    // Codes should be different for different services
    expect(firstCode).not.toBe(secondCode);
  });

  test("handles session not initialized", async () => {
    SessionManager.getMasterSeed = mock(async () => null);

    await TOTPCommand.execute("test.com", {});

    const output = errorOutput.join("\n");
    expect(output).toContain("Not initialized. Run 'keyforge init' first.");
  });

  test("validates TOTP code format", async () => {
    await TOTPCommand.execute("formattest.com", {});

    const output = logOutput.join("\n");
    // Should contain properly formatted 6-digit code
    const codeMatch = output.match(/(\d{3} \d{3})/);
    expect(codeMatch).toBeTruthy();
    
    if (codeMatch) {
      const code = codeMatch[1].replace(" ", "");
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  test("generates 8-digit codes when specified", async () => {
    // Use consistent master seed for this test
    const consistentSeed = Buffer.from("eight_digit_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);

    await TOTPCommand.execute("eightdigit.com", {
      add: true,
      digits: 8
    });

    // Clear output and generate code
    logOutput = [];
    await TOTPCommand.execute("eightdigit.com", {});

    const output = logOutput.join("\n");
    // Should contain properly formatted 8-digit code
    const codeMatch = output.match(/(\d{4} \d{4})/);
    expect(codeMatch).toBeTruthy();
  });

  test("uses custom period for code generation", async () => {
    await TOTPCommand.execute("customperiod.com", {
      add: true,
      period: 60
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Period: 60 seconds");
  });

  test("base32 encodes secrets correctly", async () => {
    await TOTPCommand.execute("base32test.com", { secret: true });

    const output = logOutput.join("\n");
    const secretMatch = output.match(/([A-Z2-7]{32,})/);
    expect(secretMatch).toBeTruthy();
    
    if (secretMatch) {
      const secret = secretMatch[1];
      // Base32 should only contain A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      // Should be at least 32 characters (160 bits encoded)
      expect(secret.length).toBeGreaterThanOrEqual(32);
    }
  });

  test("shows time remaining correctly", async () => {
    await TOTPCommand.execute("timetest.com", {});

    const output = logOutput.join("\n");
    const timeMatch = output.match(/Valid for (\d+) seconds/);
    expect(timeMatch).toBeTruthy();
    
    if (timeMatch) {
      const seconds = parseInt(timeMatch[1]);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(30); // Default period
    }
  });

  test("handles QR code generation gracefully", async () => {
    // QR code generation might fail in test environment
    await TOTPCommand.execute("qrtest.com", { qr: true });

    const output = logOutput.join("\n");
    expect(output).toContain("TOTP for qrtest.com:");
    // Should not throw errors even if QR generation fails
  });

  test("supports different algorithms", async () => {
    await TOTPCommand.execute("sha256test.com", {
      add: true,
      algorithm: "SHA256"
    });

    const output = logOutput.join("\n");
    expect(output).toContain("Algorithm: SHA256");
    expect(output).toContain("✓ TOTP service added: sha256test.com");
  });

  test("handles concurrent TOTP operations", async () => {
    const promises = [
      TOTPCommand.execute("concurrent1.com", {}),
      TOTPCommand.execute("concurrent2.com", {}),
      TOTPCommand.execute("concurrent3.com", { add: true })
    ];

    await Promise.all(promises);

    // Should complete without errors
    expect(errorOutput.length).toBe(0);
    expect(logOutput.length).toBeGreaterThan(0);
  });

  test("derives consistent secrets for same service", async () => {
    // Generate secret twice for same service
    await TOTPCommand.execute("consistent.com", { secret: true });
    const firstOutput = logOutput.join("\n");
    const firstSecret = firstOutput.match(/([A-Z2-7]{32,})/)?.[1];

    logOutput = [];
    await TOTPCommand.execute("consistent.com", { secret: true });
    const secondOutput = logOutput.join("\n");
    const secondSecret = secondOutput.match(/([A-Z2-7]{32,})/)?.[1];

    // Secrets should be identical for same service
    expect(firstSecret).toBe(secondSecret);
  });
});