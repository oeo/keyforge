/**
 * Configuration management for Keyforge
 * Handles loading and saving user preferences and default options
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface KeyforgeConfig {
  // Default options
  defaults: {
    username?: string;
    format?: string;
    keyLength?: number;
    algorithm?: "SHA1" | "SHA256" | "SHA512";
    digits?: 6 | 8;
    period?: 30 | 60;
  };

  // Network settings
  network: {
    tor?: boolean;
    offline?: boolean;
    timeout?: number;
  };

  // Vault settings
  vault: {
    autoSync?: boolean;
    syncInterval?: number;
    backupLocations?: string[];
    encryption?: "ChaCha20-Poly1305";
  };

  // Output preferences
  output: {
    color?: boolean;
    verbose?: boolean;
    quiet?: boolean;
    copyToClipboard?: boolean;
  };

  // Security settings
  security: {
    sessionTimeout?: number;
    clearClipboard?: number;
    lockOnSuspend?: boolean;
    requireConfirmation?: boolean;
  };

  // Development/debug
  debug: {
    enabled?: boolean;
    logLevel?: "error" | "warn" | "info" | "debug";
    logFile?: string;
  };
}

export const DEFAULT_CONFIG: KeyforgeConfig = {
  defaults: {
    username: "keyforge",
    format: "openssh",
    keyLength: 2048,
    algorithm: "SHA1",
    digits: 6,
    period: 30
  },
  network: {
    tor: false,
    offline: false,
    timeout: 30000
  },
  vault: {
    autoSync: true,
    syncInterval: 300000, // 5 minutes
    backupLocations: ["local"],
    encryption: "ChaCha20-Poly1305"
  },
  output: {
    color: true,
    verbose: false,
    quiet: false,
    copyToClipboard: false
  },
  security: {
    sessionTimeout: 300000, // 5 minutes
    clearClipboard: 30000,  // 30 seconds
    lockOnSuspend: true,
    requireConfirmation: true
  },
  debug: {
    enabled: false,
    logLevel: "warn"
  }
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: KeyforgeConfig;
  private configPath: string;

  private constructor() {
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!this.instance) {
      this.instance = new ConfigManager();
    }
    return this.instance;
  }

  /**
   * Get configuration file path
   */
  private getConfigPath(): string {
    const configDir = process.env.KEYFORGE_CONFIG_DIR || 
                     join(homedir(), ".keyforge");
    return join(configDir, "config.json");
  }

  /**
   * Get configuration directory path
   */
  getConfigDir(): string {
    return dirname(this.configPath);
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): KeyforgeConfig {
    try {
      if (!existsSync(this.configPath)) {
        return { ...DEFAULT_CONFIG };
      }

      const configData = readFileSync(this.configPath, 'utf8');
      const userConfig = JSON.parse(configData);

      // Deep merge with defaults
      return this.mergeDeep(DEFAULT_CONFIG, userConfig);
    } catch (error) {
      console.warn("Failed to load config file, using defaults:", error);
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration to file
   */
  saveConfig(): void {
    try {
      // Ensure config directory exists
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      const configData = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, configData, 'utf8');
    } catch (error) {
      console.error("Failed to save config file:", error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): KeyforgeConfig {
    return { ...this.config };
  }

  /**
   * Get a specific config value
   */
  get<K extends keyof KeyforgeConfig>(section: K): KeyforgeConfig[K] {
    return this.config[section];
  }

  /**
   * Get a nested config value
   */
  getValue<T>(path: string): T | undefined {
    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set a config section
   */
  set<K extends keyof KeyforgeConfig>(section: K, value: Partial<KeyforgeConfig[K]>): void {
    this.config[section] = { ...this.config[section], ...value };
  }

  /**
   * Set a nested config value
   */
  setValue(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Merge default options with CLI arguments
   */
  mergeWithArgs(args: any): any {
    const defaults = this.config.defaults;
    
    return {
      ...defaults,
      ...args,
      // Handle special cases
      tor: args.tor ?? this.config.network.tor,
      offline: args.offline ?? this.config.network.offline,
      verbose: args.verbose ?? this.config.output.verbose,
      quiet: args.quiet ?? this.config.output.quiet,
      copy: args.copy ?? this.config.output.copyToClipboard,
    };
  }

  /**
   * Create example configuration file
   */
  createExampleConfig(): void {
    const examplePath = join(dirname(this.configPath), "config.example.json");
    const exampleConfig = {
      ...DEFAULT_CONFIG,
      // Add comments as keys (will be ignored but serve as documentation)
      "//": "Keyforge Configuration File",
      "//defaults": "Default values for command options",
      "//network": "Network and connectivity settings", 
      "//vault": "Vault storage and sync settings",
      "//output": "Output formatting and display preferences",
      "//security": "Security and session management",
      "//debug": "Development and debugging options"
    };

    writeFileSync(examplePath, JSON.stringify(exampleConfig, null, 2));
    console.log(`Example config created at: ${examplePath}`);
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate session timeout
    if (this.config.security.sessionTimeout && this.config.security.sessionTimeout < 60000) {
      errors.push("security.sessionTimeout must be at least 60000ms (1 minute)");
    }

    // Validate TOTP settings
    if (this.config.defaults.digits && ![6, 8].includes(this.config.defaults.digits)) {
      errors.push("defaults.digits must be 6 or 8");
    }

    if (this.config.defaults.period && ![30, 60].includes(this.config.defaults.period)) {
      errors.push("defaults.period must be 30 or 60");
    }

    // Validate algorithm
    const validAlgorithms = ["SHA1", "SHA256", "SHA512"];
    if (this.config.defaults.algorithm && !validAlgorithms.includes(this.config.defaults.algorithm)) {
      errors.push(`defaults.algorithm must be one of: ${validAlgorithms.join(", ")}`);
    }

    // Validate log level
    const validLogLevels = ["error", "warn", "info", "debug"];
    if (this.config.debug.logLevel && !validLogLevels.includes(this.config.debug.logLevel)) {
      errors.push(`debug.logLevel must be one of: ${validLogLevels.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Deep merge two objects
   */
  private mergeDeep(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}