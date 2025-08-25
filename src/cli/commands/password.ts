/**
 * CLI command for password management operations
 * Handles add, get, list, update, delete operations
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import chalk from "chalk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

interface PasswordOptions {
  username?: string;
  notes?: string;
  tags?: string;
  generate?: boolean;
  length?: number;
}

export class PasswordCommand {
  /**
   * Execute password command
   */
  static async execute(action: string, site?: string, options: PasswordOptions = {}): Promise<void> {
    try {
      // Get master seed from session
      const masterSeed = await SessionManager.getMasterSeed();
      if (!masterSeed) {
        console.error(chalk.red("Not initialized. Run 'keyforge init' first."));
        if (process.env.NODE_ENV !== 'test') {
          process.exit(1);
        }
        return;
      }

      const vaultManager = new VaultManager(masterSeed);

      switch (action.toLowerCase()) {
        case "add":
          if (!site) {
            console.error(chalk.red("Site is required for add operation"));
            return;
          }
          await this.addPassword(vaultManager, site, options);
          break;

        case "get":
          if (!site) {
            console.error(chalk.red("Site is required for get operation"));
            return;
          }
          await this.getPassword(vaultManager, site);
          break;

        case "list":
          await this.listPasswords(vaultManager, options);
          break;

        case "update":
          if (!site) {
            console.error(chalk.red("Site is required for update operation"));
            return;
          }
          await this.updatePassword(vaultManager, site, options);
          break;

        case "delete":
        case "remove":
          if (!site) {
            console.error(chalk.red("Site is required for delete operation"));
            return;
          }
          await this.deletePassword(vaultManager, site);
          break;

        case "generate":
          await this.generatePassword(options);
          break;

        default:
          console.error(chalk.red(`Unknown password action: ${action}`));
          console.log("Available actions: add, get, list, update, delete, generate");
          if (process.env.NODE_ENV !== 'test') {
            process.exit(1);
          }
      }

    } catch (error) {
      console.error(chalk.red("Password operation failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Add new password
   */
  private static async addPassword(
    vaultManager: VaultManager, 
    site: string, 
    options: PasswordOptions
  ): Promise<void> {
    console.log(chalk.cyan(`Adding password for ${site}`));

    // Get username
    const username = options.username || await this.promptInput("Username: ");

    // Get or generate password
    let password: string;
    if (options.generate) {
      password = this.generateRandomPassword(options.length || 16);
      console.log(chalk.green(`Generated password: ${password}`));
    } else {
      password = await this.promptPassword("Password: ");
    }

    // Parse tags
    const tags = options.tags ? options.tags.split(",").map(t => t.trim()) : [];

    try {
      const id = await vaultManager.addPassword({
        site,
        username,
        password,
        notes: options.notes || "",
        tags
      });

      console.log(chalk.green(`✓ Password saved for ${site}`));
      console.log(chalk.gray(`ID: ${id}`));

      // Auto-sync vault
      await vaultManager.sync();

    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        console.log(chalk.yellow(`Password for ${site} already exists`));
        console.log("Use 'keyforge pass update' to modify existing passwords");
      } else {
        throw error;
      }
    }
  }

  /**
   * Get password for site
   */
  private static async getPassword(vaultManager: VaultManager, site: string): Promise<void> {
    const password = vaultManager.getPassword(site);

    if (!password) {
      console.log(chalk.yellow(`No password found for ${site}`));
      console.log("Available sites:");
      
      const allPasswords = vaultManager.getPasswords();
      if (allPasswords.length > 0) {
        allPasswords.forEach(p => console.log(`• ${p.site}`));
      } else {
        console.log(chalk.gray("No passwords stored"));
      }
      return;
    }

    console.log(chalk.cyan(`Password for ${site}:`));
    console.log(`Username: ${password.username}`);
    console.log(`Password: ${chalk.bold(password.password)}`);
    
    if (password.notes) {
      console.log(`Notes: ${password.notes}`);
    }
    
    if (password.tags.length > 0) {
      console.log(`Tags: ${password.tags.join(", ")}`);
    }

    console.log(chalk.gray(`Last modified: ${new Date(password.modified).toLocaleString()}`));

    // Copy to clipboard if available
    try {
      const clipboardy = await import("clipboardy");
      await clipboardy.write(password.password);
      console.log(chalk.green("✓ Password copied to clipboard"));
    } catch (error) {
      console.log(chalk.yellow("⚠ Could not copy to clipboard"));
    }
  }

  /**
   * List all passwords
   */
  private static async listPasswords(vaultManager: VaultManager, options: PasswordOptions): Promise<void> {
    const passwords = vaultManager.getPasswords();

    if (passwords.length === 0) {
      console.log(chalk.yellow("No passwords stored"));
      console.log("Use 'keyforge pass add <site>' to add passwords");
      return;
    }

    console.log(chalk.cyan(`Stored Passwords (${passwords.length}):`));
    console.log();

    passwords
      .sort((a, b) => a.site.localeCompare(b.site))
      .forEach(password => {
        console.log(`${chalk.bold(password.site)}`);
        console.log(chalk.gray(`  Username: ${password.username}`));
        
        if (password.tags.length > 0) {
          console.log(chalk.gray(`  Tags: ${password.tags.join(", ")}`));
        }
        
        console.log(chalk.gray(`  Modified: ${new Date(password.modified).toLocaleDateString()}`));
        console.log();
      });
  }

  /**
   * Update existing password
   */
  private static async updatePassword(
    vaultManager: VaultManager, 
    site: string, 
    options: PasswordOptions
  ): Promise<void> {
    const existing = vaultManager.getPassword(site);
    if (!existing) {
      console.log(chalk.yellow(`No password found for ${site}`));
      return;
    }

    console.log(chalk.cyan(`Updating password for ${site}`));
    console.log(chalk.gray(`Current username: ${existing.username}`));

    const updates: any = {};

    // Update username if provided
    if (options.username) {
      updates.username = options.username;
    }

    // Update password
    if (options.generate) {
      updates.password = this.generateRandomPassword(options.length || 16);
      console.log(chalk.green(`Generated new password: ${updates.password}`));
    } else {
      const newPassword = await this.promptPassword("New password (leave blank to keep current): ");
      if (newPassword) {
        updates.password = newPassword;
      }
    }

    // Update notes
    if (options.notes) {
      updates.notes = options.notes;
    }

    // Update tags
    if (options.tags) {
      updates.tags = options.tags.split(",").map(t => t.trim());
    }

    if (Object.keys(updates).length === 0) {
      console.log(chalk.yellow("No changes to update"));
      return;
    }

    await vaultManager.updatePassword(site, updates);
    console.log(chalk.green(`✓ Password updated for ${site}`));

    // Auto-sync vault
    await vaultManager.sync();
  }

  /**
   * Delete password
   */
  private static async deletePassword(vaultManager: VaultManager, site: string): Promise<void> {
    const existing = vaultManager.getPassword(site);
    if (!existing) {
      console.log(chalk.yellow(`No password found for ${site}`));
      return;
    }

    // Confirm deletion
    const confirm = await this.promptInput(`Delete password for ${site}? (y/N): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log("Deletion cancelled");
      return;
    }

    await vaultManager.deletePassword(site);
    console.log(chalk.green(`✓ Password deleted for ${site}`));

    // Auto-sync vault
    await vaultManager.sync();
  }

  /**
   * Generate random password
   */
  private static async generatePassword(options: PasswordOptions): Promise<void> {
    const password = this.generateRandomPassword(options.length || 16);
    
    console.log(chalk.cyan("Generated Password:"));
    console.log(chalk.bold(password));

    // Copy to clipboard
    try {
      const clipboardy = await import("clipboardy");
      await clipboardy.write(password);
      console.log(chalk.green("✓ Password copied to clipboard"));
    } catch (error) {
      console.log(chalk.yellow("⚠ Could not copy to clipboard"));
    }
  }

  /**
   * Generate random password with good entropy
   */
  private static generateRandomPassword(length: number): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    return Array.from(array, byte => charset[byte % charset.length]).join("");
  }

  /**
   * Prompt for input
   */
  private static async promptInput(prompt: string): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      // Return 'y' for confirmation prompts, otherwise default
      return prompt.includes("Delete password") ? "y" : "test_input";
    }

    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(prompt);
    rl.close();
    return answer;
  }

  /**
   * Prompt for password (hidden input)
   */
  private static async promptPassword(prompt: string): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      return "test_password"; // Mock password for tests
    }

    output.write(prompt);

    // Hide input
    if (typeof input.setRawMode === 'function') {
      const oldRawMode = input.isRaw;
      input.setRawMode(true);

      let password = "";

      return new Promise((resolve) => {
        input.on("data", function handler(char) {
          const c = char.toString();

          switch (c) {
            case "\n":
            case "\r":
            case "\u0004": // Ctrl-D
              input.setRawMode(oldRawMode);
              input.removeListener("data", handler);
              output.write("\n");
              resolve(password);
              break;

            case "\u0003": // Ctrl-C
              process.exit();
              break;

            case "\u007f": // Backspace
              if (password.length > 0) {
                password = password.slice(0, -1);
                output.write("\b \b");
              }
              break;

            default:
              password += c;
              output.write("*");
              break;
          }
        });
      });
    } else {
      // Fallback for environments without raw mode
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question(prompt);
      rl.close();
      return answer;
    }
  }
}