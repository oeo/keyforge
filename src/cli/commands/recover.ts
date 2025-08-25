/**
 * CLI command for vault recovery operations
 * Handles recovery from passphrase, Arweave, Nostr, and local backups
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import { MasterDerivation } from "../../core/derivation";
import chalk from "chalk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

interface RecoveryOptions {
  from?: string; // "arweave" | "nostr" | "local"
  passphrase?: string;
  username?: string;
}

export class RecoverCommand {
  /**
   * Execute recovery command
   */
  static async execute(options: RecoveryOptions = {}): Promise<void> {
    try {
      console.log(chalk.cyan("Keyforge Vault Recovery"));
      console.log(chalk.gray("Recover your entire vault from your master passphrase"));
      console.log();

      // Get recovery credentials
      const passphrase = options.passphrase || await this.promptPassphrase();
      const username = options.username || await this.promptUsername();

      console.log();
      console.log(chalk.cyan("Deriving master seed..."));

      // Derive master seed
      const masterSeed = await MasterDerivation.deriveMasterSeed({
        passphrase,
        username,
        version: 1
      });

      console.log(chalk.green("✓ Master seed derived"));

      // Initialize session with recovered seed
      await SessionManager.initialize(passphrase, username);

      // Create vault manager
      const vaultManager = new VaultManager(masterSeed);

      // Attempt recovery from various sources
      const source = options.from || await this.selectRecoverySource();
      
      await this.performRecovery(vaultManager, source);

    } catch (error) {
      console.error(chalk.red("Recovery failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Perform recovery from specified source
   */
  private static async performRecovery(vaultManager: VaultManager, source: string): Promise<void> {
    console.log();
    console.log(chalk.cyan(`Attempting recovery from ${source}...`));

    try {
      let vault;

      switch (source.toLowerCase()) {
        case "arweave":
          vault = await this.recoverFromArweave(vaultManager);
          break;

        case "nostr":
          vault = await this.recoverFromNostr(vaultManager);
          break;

        case "local":
          vault = await this.recoverFromLocal(vaultManager);
          break;

        case "auto":
        default:
          vault = await this.recoverAuto(vaultManager);
          break;
      }

      console.log(chalk.green("✓ Vault recovered successfully!"));
      console.log();

      // Display recovery summary
      await this.showRecoverySummary(vault);

    } catch (error) {
      console.log(chalk.yellow(`⚠ Recovery from ${source} failed`));
      
      if (source !== "auto") {
        console.log("Trying automatic recovery from all sources...");
        await this.performRecovery(vaultManager, "auto");
      } else {
        throw new Error("Could not recover vault from any source");
      }
    }
  }

  /**
   * Recover from Arweave permanent storage
   */
  private static async recoverFromArweave(vaultManager: VaultManager): Promise<any> {
    console.log("Searching Arweave blockchain for your vault...");
    
    // In a full implementation, this would:
    // 1. Generate payment wallet from master seed
    // 2. Query Arweave GraphQL for transactions from that wallet
    // 3. Download and decrypt the latest vault
    
    console.log(chalk.yellow("Note: Arweave recovery requires full implementation"));
    throw new Error("Arweave recovery not yet implemented");
  }

  /**
   * Recover from Nostr relay network
   */
  private static async recoverFromNostr(vaultManager: VaultManager): Promise<any> {
    console.log("Searching Nostr relays for your vault...");
    
    // In a full implementation, this would:
    // 1. Derive Nostr keys from master seed
    // 2. Connect to multiple relays
    // 3. Query for vault events from your pubkey
    // 4. Download and reassemble chunked vault data
    
    console.log(chalk.yellow("Note: Nostr recovery requires full implementation"));
    throw new Error("Nostr recovery not yet implemented");
  }

  /**
   * Recover from local backup files
   */
  private static async recoverFromLocal(vaultManager: VaultManager): Promise<any> {
    console.log("Looking for local backup files...");
    
    try {
      const vault = await vaultManager.recover();
      console.log("✓ Found local vault backup");
      return vault;
    } catch (error) {
      throw new Error("No local backup found");
    }
  }

  /**
   * Auto-recovery: try all sources in order
   */
  private static async recoverAuto(vaultManager: VaultManager): Promise<any> {
    const sources = ["local", "arweave", "nostr"];
    let lastError;

    for (const source of sources) {
      try {
        console.log(`Trying ${source}...`);
        return await this.performRecoveryAttempt(vaultManager, source);
      } catch (error) {
        lastError = error;
        console.log(chalk.gray(`✗ ${source} recovery failed`));
      }
    }

    throw lastError || new Error("All recovery sources failed");
  }

  /**
   * Single recovery attempt
   */
  private static async performRecoveryAttempt(vaultManager: VaultManager, source: string): Promise<any> {
    switch (source) {
      case "local":
        return await this.recoverFromLocal(vaultManager);
      case "arweave":
        return await this.recoverFromArweave(vaultManager);
      case "nostr":
        return await this.recoverFromNostr(vaultManager);
      default:
        throw new Error(`Unknown recovery source: ${source}`);
    }
  }

  /**
   * Show recovery summary
   */
  private static async showRecoverySummary(vault: any): Promise<void> {
    console.log(chalk.bold("Recovery Summary:"));
    
    if (vault.created) {
      console.log(`• Vault created: ${new Date(vault.created).toLocaleString()}`);
      console.log(`• Last updated: ${new Date(vault.updated).toLocaleString()}`);
    }
    
    console.log();
    console.log(chalk.bold("Recovered data:"));

    // Count recovered items
    const sshKeys = vault.config?.services?.ssh?.length || 0;
    const wallets = vault.config?.services?.wallets?.length || 0;
    const totpEntries = vault.config?.services?.totp?.length || 0;
    const passwords = vault.passwords?.length || 0;
    const notes = vault.notes?.length || 0;

    console.log(`• SSH keys: ${sshKeys}`);
    console.log(`• Wallets: ${wallets}`);
    console.log(`• TOTP entries: ${totpEntries}`);
    console.log(`• Passwords: ${passwords}`);
    console.log(`• Secure notes: ${notes}`);

    const total = sshKeys + wallets + totpEntries + passwords + notes;
    
    if (total === 0) {
      console.log(chalk.yellow("No data found in vault"));
      console.log("This might be a new vault or the recovery source may be outdated");
    } else {
      console.log();
      console.log(chalk.green(`✓ Successfully recovered ${total} items`));
    }

    console.log();
    console.log(chalk.gray("You can now use all Keyforge commands normally."));
    console.log(chalk.gray("Run 'keyforge vault status' to see detailed information."));
  }

  /**
   * Select recovery source interactively
   */
  private static async selectRecoverySource(): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      return "local"; // Default for tests
    }

    console.log(chalk.bold("Recovery Sources:"));
    console.log("1. Auto (try all sources)");
    console.log("2. Local backup files");
    console.log("3. Arweave permanent storage");
    console.log("4. Nostr relay network");
    console.log();

    const rl = readline.createInterface({ input, output });
    const choice = await rl.question("Select recovery source (1-4): ");
    rl.close();

    switch (choice) {
      case "1":
        return "auto";
      case "2":
        return "local";
      case "3":
        return "arweave";
      case "4":
        return "nostr";
      default:
        console.log("Invalid choice, using auto recovery");
        return "auto";
    }
  }

  /**
   * Prompt for passphrase
   */
  private static async promptPassphrase(): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      return "test passphrase for recovery";
    }

    const rl = readline.createInterface({ input, output });

    // Hide input for passphrase
    output.write("Master passphrase: ");

    if (typeof input.setRawMode === 'function') {
      const oldRawMode = input.isRaw;
      input.setRawMode(true);

      let passphrase = "";

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
              rl.close();
              resolve(passphrase);
              break;

            case "\u0003": // Ctrl-C
              process.exit();
              break;

            case "\u007f": // Backspace
              if (passphrase.length > 0) {
                passphrase = passphrase.slice(0, -1);
                output.write("\b \b");
              }
              break;

            default:
              passphrase += c;
              output.write("*");
              break;
          }
        });
      });
    } else {
      // Fallback for environments without raw mode
      const answer = await rl.question("Master passphrase: ");
      rl.close();
      return answer;
    }
  }

  /**
   * Prompt for username
   */
  private static async promptUsername(): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      return "keyforge";
    }

    const rl = readline.createInterface({ input, output });
    const username = await rl.question("Username (keyforge): ");
    rl.close();
    
    return username || "keyforge";
  }
}