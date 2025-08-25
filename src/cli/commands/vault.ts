/**
 * CLI command for vault management operations
 * Handles sync, list, status, and other vault operations
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import chalk from "chalk";

interface VaultOptions {
  storage?: string;
}

export class VaultCommand {
  /**
   * Execute vault command
   */
  static async execute(action: string = "status", options: VaultOptions): Promise<void> {
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
        case "status":
          await this.showStatus(vaultManager);
          break;

        case "sync":
          await this.syncVault(vaultManager);
          break;

        case "list":
          await this.listContents(vaultManager);
          break;

        case "backup":
          await this.createBackup(vaultManager);
          break;

        case "restore":
          await this.restoreVault(vaultManager);
          break;

        default:
          console.error(chalk.red(`Unknown vault action: ${action}`));
          console.log("Available actions: status, sync, list, backup, restore");
          if (process.env.NODE_ENV !== 'test') {
            process.exit(1);
          }
      }

    } catch (error) {
      console.error(chalk.red("Vault operation failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Show vault status
   */
  private static async showStatus(vaultManager: VaultManager): Promise<void> {
    console.log(chalk.cyan("Vault Status:"));
    
    try {
      const vault = await vaultManager.getVault();
      
      console.log(`Version: ${vault.version}`);
      console.log(`Created: ${new Date(vault.created).toLocaleString()}`);
      console.log(`Updated: ${new Date(vault.updated).toLocaleString()}`);
      console.log();

      // Count entries
      const sshKeys = vault.config.services.ssh.length;
      const wallets = vault.config.services.wallets.length;
      const totpEntries = vault.config.services.totp.length;
      const passwords = vault.passwords.length;
      const notes = vault.notes.length;

      console.log(chalk.bold("Contents:"));
      console.log(`• SSH keys: ${sshKeys}`);
      console.log(`• Wallets: ${wallets}`);
      console.log(`• TOTP entries: ${totpEntries}`);
      console.log(`• Passwords: ${passwords}`);
      console.log(`• Notes: ${notes}`);
      console.log();

      // Show backup status
      console.log(chalk.bold("Backups:"));
      if (vault.metadata.backups.arweave) {
        console.log(chalk.green(`✓ Arweave: ${vault.metadata.backups.arweave}`));
      } else {
        console.log(chalk.yellow("• Arweave: Not synced"));
      }

      if (vault.metadata.backups.nostr?.length) {
        console.log(chalk.green(`✓ Nostr: ${vault.metadata.backups.nostr.length} relays`));
      } else {
        console.log(chalk.yellow("• Nostr: Not synced"));
      }

      if (vault.metadata.backups.ipfs) {
        console.log(chalk.green(`✓ Local: ${vault.metadata.backups.ipfs}`));
      } else {
        console.log(chalk.yellow("• Local: Not saved"));
      }

    } catch (error) {
      console.log(chalk.yellow("Vault not found - creating new vault"));
    }
  }

  /**
   * Sync vault to all storage backends
   */
  private static async syncVault(vaultManager: VaultManager): Promise<void> {
    console.log(chalk.cyan("Syncing vault..."));

    const startTime = Date.now();

    try {
      await vaultManager.sync();
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✓ Vault synced successfully (${duration}ms)`));
      
      // Show updated status
      await this.showStatus(vaultManager);

    } catch (error) {
      if (error instanceof Error && error.message.includes("funding")) {
        console.log(chalk.yellow("⚠ Arweave sync requires funding"));
        console.log("Fund your payment wallet to enable permanent storage");
      } else {
        throw error;
      }
    }
  }

  /**
   * List vault contents
   */
  private static async listContents(vaultManager: VaultManager): Promise<void> {
    try {
      const vault = await vaultManager.getVault();

      console.log(chalk.cyan("Vault Contents:"));
      console.log();

      // SSH Keys
      if (vault.config.services.ssh.length > 0) {
        console.log(chalk.bold("SSH Keys:"));
        vault.config.services.ssh.forEach(key => {
          console.log(`• ${key.hostname}`);
          console.log(chalk.gray(`  Fingerprint: ${key.fingerprint}`));
          console.log(chalk.gray(`  Created: ${new Date(key.created).toLocaleDateString()}`));
        });
        console.log();
      }

      // Wallets
      if (vault.config.services.wallets.length > 0) {
        console.log(chalk.bold("Wallets:"));
        vault.config.services.wallets.forEach(wallet => {
          console.log(`• ${wallet.service || 'Default'} (${wallet.type})`);
          console.log(chalk.gray(`  Address: ${wallet.address}`));
          console.log(chalk.gray(`  Path: ${wallet.path}`));
        });
        console.log();
      }

      // TOTP Entries
      if (vault.config.services.totp.length > 0) {
        console.log(chalk.bold("2FA/TOTP:"));
        vault.config.services.totp.forEach(totp => {
          console.log(`• ${totp.service}`);
          console.log(chalk.gray(`  Algorithm: ${totp.algorithm}, Digits: ${totp.digits}`));
        });
        console.log();
      }

      // Passwords
      if (vault.passwords.length > 0) {
        console.log(chalk.bold("Passwords:"));
        vault.passwords.forEach(pass => {
          console.log(`• ${pass.site}`);
          console.log(chalk.gray(`  Username: ${pass.username}`));
          console.log(chalk.gray(`  Modified: ${new Date(pass.modified).toLocaleDateString()}`));
        });
        console.log();
      }

      // Notes
      if (vault.notes.length > 0) {
        console.log(chalk.bold("Secure Notes:"));
        vault.notes.forEach(note => {
          console.log(`• ${note.title}`);
          console.log(chalk.gray(`  Modified: ${new Date(note.modified).toLocaleDateString()}`));
        });
        console.log();
      }

      if (vault.config.services.ssh.length === 0 && 
          vault.config.services.wallets.length === 0 && 
          vault.passwords.length === 0 && 
          vault.notes.length === 0) {
        console.log(chalk.gray("Vault is empty"));
        console.log(chalk.gray("Generate some keys or add passwords to get started"));
      }

    } catch (error) {
      console.log(chalk.yellow("No vault found"));
      console.log("Run 'keyforge generate' commands to create vault entries");
    }
  }

  /**
   * Create backup
   */
  private static async createBackup(vaultManager: VaultManager): Promise<void> {
    console.log(chalk.cyan("Creating backup..."));
    
    try {
      await vaultManager.sync();
      console.log(chalk.green("✓ Backup created successfully"));
    } catch (error) {
      console.error(chalk.red("Backup failed:"), error);
    }
  }

  /**
   * Restore vault from backup
   */
  private static async restoreVault(vaultManager: VaultManager): Promise<void> {
    console.log(chalk.cyan("Restoring vault from backup..."));
    
    try {
      const vault = await vaultManager.recover();
      console.log(chalk.green("✓ Vault restored successfully"));
      
      // Show restored contents
      await this.listContents(vaultManager);
      
    } catch (error) {
      console.error(chalk.red("Restore failed:"), error);
      console.log("Available restore sources:");
      console.log("• Local backup files");
      console.log("• Arweave permanent storage");
      console.log("• Nostr relay network");
    }
  }
}