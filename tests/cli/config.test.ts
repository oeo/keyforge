import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { ConfigCommand } from "../../src/cli/commands/config";
import { ConfigManager, DEFAULT_CONFIG } from "../../src/core/config";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("ConfigCommand", () => {
  const testConfigDir = join(__dirname, "../../.test_config");
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));

    // Set test config directory
    process.env.KEYFORGE_CONFIG_DIR = testConfigDir;
    
    // Reset singleton instance to force re-initialization
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Reset singleton instance
    (ConfigManager as any).instance = undefined;

    // Clean up test directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Clean up environment
    delete process.env.KEYFORGE_CONFIG_DIR;
  });

  test("lists default configuration", async () => {
    await ConfigCommand.execute("list");

    const output = logOutput.join("\n");
    expect(output).toContain("Keyforge Configuration");
    expect(output).toContain("Defaults:");
    expect(output).toContain("Network:");
    expect(output).toContain("Vault:");
    expect(output).toContain("Output:");
    expect(output).toContain("Security:");
    expect(output).toContain("Debug:");
  });

  test("shows configuration without action (default to list)", async () => {
    await ConfigCommand.execute();

    const output = logOutput.join("\n");
    expect(output).toContain("Keyforge Configuration");
  });

  test("gets specific configuration value", async () => {
    await ConfigCommand.execute("get", "defaults.username");

    const output = logOutput.join("\n");
    expect(output).toContain("keyforge");
  });

  test("gets nested configuration object", async () => {
    await ConfigCommand.execute("get", "defaults");

    const output = logOutput.join("\n");
    expect(output).toContain("username");
    expect(output).toContain("keyforge");
  });

  test("handles getting unknown configuration key", async () => {
    await ConfigCommand.execute("get", "unknown.key");

    const output = errorOutput.join("\n");
    expect(output).toContain("Configuration key 'unknown.key' not found");
  });

  test("sets string configuration value", async () => {
    await ConfigCommand.execute("set", "defaults.username", "alice");

    const output = logOutput.join("\n");
    expect(output).toContain('✓ Set defaults.username = "alice"');

    // Verify it was actually set
    logOutput = [];
    await ConfigCommand.execute("get", "defaults.username");
    const getOutput = logOutput.join("\n");
    expect(getOutput).toContain("alice");
  });

  test("sets boolean configuration value", async () => {
    await ConfigCommand.execute("set", "network.tor", "true");

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Set network.tor = true");

    // Verify it was actually set
    logOutput = [];
    await ConfigCommand.execute("get", "network.tor");
    const getOutput = logOutput.join("\n");
    expect(getOutput).toContain("true");
  });

  test("sets numeric configuration value", async () => {
    await ConfigCommand.execute("set", "security.sessionTimeout", "600000");

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Set security.sessionTimeout = 600000");
  });

  test("validates configuration after setting", async () => {
    await ConfigCommand.execute("set", "security.sessionTimeout", "30000");

    const output = logOutput.join("\n");
    expect(output).toContain("Warning: Configuration validation failed:");
    expect(output).toContain("security.sessionTimeout must be at least 60000ms");
  });

  test("handles set without key and value", async () => {
    await ConfigCommand.execute("set");

    const output = errorOutput.join("\n");
    expect(output).toContain("Usage: keyforge config set <key> <value>");
  });

  test("handles set without value", async () => {
    await ConfigCommand.execute("set", "defaults.username");

    const output = errorOutput.join("\n");
    expect(output).toContain("Usage: keyforge config set <key> <value>");
  });

  test("unsets configuration value (resets to default)", async () => {
    // First set a custom value
    await ConfigCommand.execute("set", "defaults.username", "alice");
    logOutput = [];

    // Then unset it
    await ConfigCommand.execute("unset", "defaults.username");

    const output = logOutput.join("\n");
    expect(output).toContain('✓ Reset defaults.username to default: "keyforge"');
  });

  test("handles unset without key", async () => {
    await ConfigCommand.execute("unset");

    const output = errorOutput.join("\n");
    expect(output).toContain("Usage: keyforge config unset <key>");
  });

  test("handles unset for unknown key", async () => {
    await ConfigCommand.execute("unset", "unknown.key");

    const output = errorOutput.join("\n");
    expect(output).toContain("Cannot unset unknown key: unknown.key");
  });

  test("resets all configuration", async () => {
    // First set some custom values
    await ConfigCommand.execute("set", "defaults.username", "alice");
    await ConfigCommand.execute("set", "network.tor", "true");
    logOutput = [];

    // Then reset all
    await ConfigCommand.execute("reset");

    const output = logOutput.join("\n");
    expect(output).toContain("⚠ This will reset all configuration to defaults.");
    expect(output).toContain("✓ Configuration reset to defaults");
  });

  test("validates configuration", async () => {
    await ConfigCommand.execute("validate");

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Configuration is valid");
  });

  test("shows validation errors", async () => {
    // Set invalid configuration first
    await ConfigCommand.execute("set", "defaults.digits", "10");
    logOutput = [];

    await ConfigCommand.execute("validate");

    const output = logOutput.join("\n");
    expect(output).toContain("✗ Configuration validation failed:");
    expect(output).toContain("defaults.digits must be 6 or 8");
  });

  test("creates example configuration", async () => {
    await ConfigCommand.execute("example");

    const output = logOutput.join("\n");
    expect(output).toContain("✓ Example configuration file created");
  });

  test("shows configuration directory path", async () => {
    await ConfigCommand.execute("path");

    const output = logOutput.join("\n");
    expect(output).toContain(testConfigDir);
  });

  test("shows edit command guidance", async () => {
    await ConfigCommand.execute("edit");

    const output = logOutput.join("\n");
    expect(output).toContain("Config file doesn't exist, creating...");
    expect(output).toContain("Opening");
    expect(output).toContain("config.json");
  });

  test("handles unknown action", async () => {
    await ConfigCommand.execute("unknown");

    const output = errorOutput.join("\n");
    expect(output).toContain("Unknown config action: unknown");
  });

  test("shows help for unknown action", async () => {
    // Mock the showHelp method to capture it being called
    const originalShowHelp = ConfigCommand.showHelp;
    let helpCalled = false;
    ConfigCommand.showHelp = mock(() => {
      helpCalled = true;
    });

    await ConfigCommand.execute("unknown");

    expect(helpCalled).toBe(true);

    // Restore original method
    ConfigCommand.showHelp = originalShowHelp;
  });
});

describe("ConfigManager", () => {
  const testConfigDir = join(__dirname, "../../.test_config_manager");

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Set test config directory
    process.env.KEYFORGE_CONFIG_DIR = testConfigDir;
    
    // Reset singleton instance to force re-initialization
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
    // Reset singleton instance
    (ConfigManager as any).instance = undefined;

    // Clean up test directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Clean up environment
    delete process.env.KEYFORGE_CONFIG_DIR;
  });

  test("loads default configuration", () => {
    const config = ConfigManager.getInstance();
    const currentConfig = config.getConfig();

    expect(currentConfig.defaults.username).toBe("keyforge");
    expect(currentConfig.network.tor).toBe(false);
    expect(currentConfig.vault.autoSync).toBe(true);
  });

  test("saves and loads configuration", () => {
    const config = ConfigManager.getInstance();
    
    config.setValue("defaults.username", "alice");
    config.setValue("network.tor", true);
    config.saveConfig();

    // Create new instance to test loading
    const config2 = new (ConfigManager as any)();
    
    expect(config2.getValue("defaults.username")).toBe("alice");
    expect(config2.getValue("network.tor")).toBe(true);
  });

  test("validates configuration correctly", () => {
    const config = ConfigManager.getInstance();

    // Valid configuration
    let validation = config.validate();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Invalid configuration
    config.setValue("security.sessionTimeout", 30000); // Too short
    config.setValue("defaults.digits", 10); // Invalid digits

    validation = config.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some(e => e.includes("sessionTimeout"))).toBe(true);
    expect(validation.errors.some(e => e.includes("digits"))).toBe(true);
  });

  test("merges with CLI arguments", () => {
    const config = ConfigManager.getInstance();
    
    config.setValue("defaults.username", "alice");
    config.setValue("network.tor", true);

    const args = {
      username: "bob", // Should override config
      format: "json"   // Should be preserved from args
    };

    const merged = config.mergeWithArgs(args);

    expect(merged.username).toBe("bob");       // CLI override
    expect(merged.format).toBe("json");        // From CLI
    expect(merged.tor).toBe(true);            // From config
  });

  test("handles nested configuration paths", () => {
    const config = ConfigManager.getInstance();

    config.setValue("deep.nested.value", "test");
    expect(config.getValue("deep.nested.value")).toBe("test");

    config.setValue("deep.nested.other", "test2");
    expect(config.getValue("deep.nested.other")).toBe("test2");
    expect(config.getValue("deep.nested.value")).toBe("test"); // Should still exist
  });

  test("resets to defaults", () => {
    const config = ConfigManager.getInstance();

    config.setValue("defaults.username", "alice");
    config.setValue("network.tor", true);
    
    expect(config.getValue("defaults.username")).toBe("alice");

    config.reset();
    
    expect(config.getValue("defaults.username")).toBe("keyforge");
    expect(config.getValue("network.tor")).toBe(false);
  });
});