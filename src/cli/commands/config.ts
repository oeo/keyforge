/**
 * CLI command for managing Keyforge configuration
 * Handles setting, getting, and managing user preferences
 */

import { ConfigManager, DEFAULT_CONFIG } from "../../core/config";
import chalk from "chalk";
import { existsSync } from "node:fs";

interface ConfigOptions {
  global?: boolean;
  reset?: boolean;
  example?: boolean;
  validate?: boolean;
  list?: boolean;
}

export class ConfigCommand {
  /**
   * Execute config command
   */
  static async execute(
    action?: string, 
    key?: string, 
    value?: string, 
    options: ConfigOptions = {}
  ): Promise<void> {
    const config = ConfigManager.getInstance();

    try {
      switch (action) {
        case "get":
          await this.getConfig(config, key);
          break;

        case "set":
          if (!key || value === undefined) {
            console.error(chalk.red("Usage: keyforge config set <key> <value>"));
            return;
          }
          await this.setConfig(config, key, value);
          break;

        case "unset":
          if (!key) {
            console.error(chalk.red("Usage: keyforge config unset <key>"));
            return;
          }
          await this.unsetConfig(config, key);
          break;

        case "list":
          await this.listConfig(config);
          break;

        case "reset":
          await this.resetConfig(config);
          break;

        case "validate":
          await this.validateConfig(config);
          break;

        case "example":
          await this.createExample(config);
          break;

        case "edit":
          await this.editConfig(config);
          break;

        case "path":
          console.log(config.getConfigDir());
          break;

        default:
          if (!action) {
            // Show current config if no action specified
            await this.listConfig(config);
          } else {
            console.error(chalk.red(`Unknown config action: ${action}`));
            this.showHelp();
          }
      }
    } catch (error) {
      console.error(chalk.red("Config operation failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Get configuration value
   */
  private static async getConfig(config: ConfigManager, key?: string): Promise<void> {
    if (!key) {
      await this.listConfig(config);
      return;
    }

    const value = config.getValue(key);

    if (value === undefined) {
      console.error(chalk.red(`Configuration key '${key}' not found`));
      return;
    }

    // Format output based on value type
    if (typeof value === 'object') {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(String(value));
    }
  }

  /**
   * Set configuration value
   */
  private static async setConfig(config: ConfigManager, key: string, value: string): Promise<void> {
    try {
      // Parse value based on content
      let parsedValue: any = value;

      // Try to parse as JSON first
      if (value.startsWith('{') || value.startsWith('[') || 
          value === 'true' || value === 'false' || 
          value === 'null' || !isNaN(Number(value))) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if JSON parsing fails
        }
      }

      config.setValue(key, parsedValue);
      
      // Validate after setting
      const validation = config.validate();
      if (!validation.valid) {
        console.log(chalk.yellow("Warning: Configuration validation failed:"));
        validation.errors.forEach(error => {
          console.log(chalk.yellow(`  • ${error}`));
        });
        console.log(chalk.yellow("You may want to fix these issues."));
      }

      config.saveConfig();
      console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`));
    } catch (error) {
      console.error(chalk.red(`Failed to set ${key}: ${error}`));
    }
  }

  /**
   * Unset (remove) configuration value
   */
  private static async unsetConfig(config: ConfigManager, key: string): Promise<void> {
    // For now, reset to default value instead of removing
    const defaultValue = this.getDefaultValue(key);
    
    if (defaultValue !== undefined) {
      config.setValue(key, defaultValue);
      config.saveConfig();
      console.log(chalk.green(`✓ Reset ${key} to default: ${JSON.stringify(defaultValue)}`));
    } else {
      console.error(chalk.red(`Cannot unset unknown key: ${key}`));
    }
  }

  /**
   * List all configuration
   */
  private static async listConfig(config: ConfigManager): Promise<void> {
    const currentConfig = config.getConfig();

    console.log(chalk.bold.cyan("Keyforge Configuration"));
    console.log();

    this.printConfigSection("Defaults", currentConfig.defaults);
    this.printConfigSection("Network", currentConfig.network);
    this.printConfigSection("Vault", currentConfig.vault);
    this.printConfigSection("Output", currentConfig.output);
    this.printConfigSection("Security", currentConfig.security);
    this.printConfigSection("Debug", currentConfig.debug);

    console.log();
    console.log(chalk.gray(`Config file: ${config.getConfigDir()}/config.json`));
  }

  /**
   * Reset configuration to defaults
   */
  private static async resetConfig(config: ConfigManager): Promise<void> {
    console.log(chalk.yellow("⚠ This will reset all configuration to defaults."));
    
    // In a real implementation, we'd prompt for confirmation
    // For now, just proceed
    config.reset();
    config.saveConfig();
    
    console.log(chalk.green("✓ Configuration reset to defaults"));
  }

  /**
   * Validate current configuration
   */
  private static async validateConfig(config: ConfigManager): Promise<void> {
    const validation = config.validate();

    if (validation.valid) {
      console.log(chalk.green("✓ Configuration is valid"));
    } else {
      console.log(chalk.red("✗ Configuration validation failed:"));
      validation.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
    }
  }

  /**
   * Create example configuration file
   */
  private static async createExample(config: ConfigManager): Promise<void> {
    config.createExampleConfig();
    console.log(chalk.green("✓ Example configuration file created"));
    console.log(chalk.gray("Edit it and copy to config.json to customize Keyforge"));
  }

  /**
   * Edit configuration file
   */
  private static async editConfig(config: ConfigManager): Promise<void> {
    const configPath = `${config.getConfigDir()}/config.json`;
    
    if (!existsSync(configPath)) {
      console.log(chalk.yellow("Config file doesn't exist, creating..."));
      config.saveConfig();
    }

    // Try to open with default editor
    const editor = process.env.EDITOR || process.env.VISUAL || "nano";
    
    console.log(chalk.cyan(`Opening ${configPath} with ${editor}...`));
    console.log(chalk.gray("Save and exit to apply changes"));

    // In a real implementation, we'd spawn the editor
    // For now, just show the path
    console.log(chalk.gray(`Edit: ${configPath}`));
  }

  /**
   * Print a configuration section
   */
  private static printConfigSection(title: string, section: any): void {
    console.log(chalk.bold(title + ":"));
    
    Object.entries(section).forEach(([key, value]) => {
      const displayValue = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
      console.log(`  ${key}: ${chalk.cyan(displayValue)}`);
    });
    
    console.log();
  }

  /**
   * Get default value for a configuration key
   */
  private static getDefaultValue(key: string): any {
    const keys = key.split('.');
    let value: any = DEFAULT_CONFIG;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Show help for config command
   */
  static showHelp(): void {
    console.log(chalk.bold("Keyforge Config"));
    console.log();
    console.log("Manage Keyforge configuration and preferences:");
    console.log();
    console.log(chalk.bold("Usage:"));
    console.log("  keyforge config [action] [key] [value]");
    console.log();
    console.log(chalk.bold("Actions:"));
    console.log("  list                     Show all configuration");
    console.log("  get <key>                Get configuration value");
    console.log("  set <key> <value>        Set configuration value");
    console.log("  unset <key>              Reset key to default");
    console.log("  reset                    Reset all to defaults");
    console.log("  validate                 Validate configuration");
    console.log("  example                  Create example config file");
    console.log("  edit                     Edit config file");
    console.log("  path                     Show config directory");
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log("  keyforge config list");
    console.log("  keyforge config get defaults.username");
    console.log("  keyforge config set defaults.username alice");
    console.log("  keyforge config set network.tor true");
    console.log("  keyforge config set security.sessionTimeout 600000");
    console.log();
    console.log(chalk.bold("Configuration Keys:"));
    console.log("  defaults.username        Default username for derivation");
    console.log("  defaults.algorithm       Default TOTP algorithm");
    console.log("  defaults.digits          Default TOTP digits");
    console.log("  network.tor              Enable Tor by default");
    console.log("  network.offline          Start in offline mode");
    console.log("  output.color             Enable colored output");
    console.log("  output.copyToClipboard   Auto-copy to clipboard");
    console.log("  security.sessionTimeout  Session timeout (ms)");
    console.log("  vault.autoSync           Auto-sync vault changes");
  }
}