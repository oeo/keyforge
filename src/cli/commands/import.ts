/**
 * CLI command for importing vault data
 * Handles importing vault from various formats (JSON, encrypted backup, etc.)
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import { VaultEncryption } from "../../vault/encryption";
import chalk from "chalk";
import { readFileSync, existsSync } from "node:fs";

interface ImportOptions {
  input?: string;
  format?: 'json' | 'encrypted' | 'backup' | 'auto';
  merge?: boolean;
  dryRun?: boolean;
}

export class ImportCommand {
  /**
   * Execute import command
   */
  static async execute(options: ImportOptions = {}): Promise<void> {
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

      const inputFile = options.input || this.promptForFile();
      
      if (!existsSync(inputFile)) {
        console.error(chalk.red(`Import file not found: ${inputFile}`));
        if (process.env.NODE_ENV !== 'test') {
          process.exit(1);
        }
        return;
      }

      console.log(chalk.cyan(`Importing vault from ${inputFile}...`));

      const vaultManager = new VaultManager(masterSeed);
      const format = options.format === 'auto' ? this.detectFormat(inputFile) : (options.format || 'auto');
      const detectedFormat = format === 'auto' ? this.detectFormat(inputFile) : format;

      // Parse import data
      let importData: any;
      switch (detectedFormat) {
        case 'json':
          importData = await this.importJSON(inputFile);
          break;

        case 'encrypted':
          importData = await this.importEncrypted(inputFile, masterSeed);
          break;

        case 'backup':
          importData = await this.importBackup(inputFile, masterSeed);
          break;

        default:
          console.error(chalk.red(`Unknown import format: ${detectedFormat}`));
          console.log("Available formats: json, encrypted, backup");
          return;
      }

      // Show preview
      this.showImportPreview(importData);

      // Dry run check
      if (options.dryRun) {
        console.log(chalk.yellow("Dry run completed. No changes made."));
        return;
      }

      // Perform import
      if (options.merge) {
        await this.mergeVault(vaultManager, importData);
      } else {
        await this.replaceVault(vaultManager, importData);
      }

      console.log(chalk.green(`✓ Vault imported successfully`));
      console.log(chalk.gray(`Import completed at ${new Date().toISOString()}`));

    } catch (error) {
      console.error(chalk.red("Import failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Import from JSON format
   */
  private static async importJSON(filePath: string): Promise<any> {
    const data = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);

    // Handle both direct vault data and wrapped export format
    if (parsed.vault) {
      return parsed.vault;
    }
    
    return parsed;
  }

  /**
   * Import from encrypted format
   */
  private static async importEncrypted(filePath: string, masterSeed: Buffer): Promise<any> {
    const data = readFileSync(filePath, 'utf8');
    const container = JSON.parse(data);

    if (container.format !== 'encrypted') {
      throw new Error('Invalid encrypted export format');
    }

    const nonce = Buffer.from(container.nonce, 'base64');
    const tag = Buffer.from(container.tag, 'base64');
    const encrypted = Buffer.from(container.data, 'base64');

    return VaultEncryption.decrypt(encrypted, nonce, tag, masterSeed);
  }

  /**
   * Import from backup format
   */
  private static async importBackup(filePath: string, masterSeed: Buffer): Promise<any> {
    const data = readFileSync(filePath, 'utf8');
    const container = JSON.parse(data);

    if (container.format !== 'keyforge-backup') {
      throw new Error('Invalid backup format');
    }

    const nonce = Buffer.from(container.nonce, 'base64');
    const tag = Buffer.from(container.tag, 'base64');
    const encrypted = Buffer.from(container.data, 'base64');

    const backupData = VaultEncryption.decrypt(encrypted, nonce, tag, masterSeed);
    
    // Backup format includes metadata, extract vault
    return backupData.vault;
  }

  /**
   * Detect format from file content
   */
  private static detectFormat(filePath: string): string {
    try {
      const data = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.format === 'encrypted') {
        return 'encrypted';
      } else if (parsed.format === 'keyforge-backup') {
        return 'backup';
      } else if (parsed.vault || parsed.version) {
        return 'json';
      }

      return 'json'; // Default fallback
    } catch (error) {
      return 'json'; // Assume JSON if detection fails
    }
  }

  /**
   * Show preview of import data
   */
  private static showImportPreview(vaultData: any): void {
    console.log();
    console.log(chalk.bold("Import Preview:"));
    console.log(`Version: ${vaultData.version || 'Unknown'}`);
    console.log(`Created: ${vaultData.created || 'Unknown'}`);
    console.log(`Updated: ${vaultData.updated || 'Unknown'}`);
    
    const sshCount = vaultData.config?.services?.ssh?.length || 0;
    const walletCount = vaultData.config?.services?.wallets?.length || 0;
    const totpCount = vaultData.config?.services?.totp?.length || 0;
    const passwordCount = vaultData.passwords?.length || 0;
    const noteCount = vaultData.notes?.length || 0;

    console.log();
    console.log(chalk.cyan("Data to import:"));
    console.log(`  SSH Keys: ${sshCount}`);
    console.log(`  Wallets: ${walletCount}`);
    console.log(`  TOTP Services: ${totpCount}`);
    console.log(`  Passwords: ${passwordCount}`);
    console.log(`  Notes: ${noteCount}`);
    console.log();
  }

  /**
   * Merge imported data with existing vault
   */
  private static async mergeVault(vaultManager: VaultManager, importData: any): Promise<void> {
    console.log(chalk.cyan("Merging with existing vault..."));

    // Get current vault
    const currentVault = await vaultManager.getVault();

    // Merge SSH keys
    if (importData.config?.services?.ssh) {
      for (const sshKey of importData.config.services.ssh) {
        // Check if key already exists
        const exists = currentVault.config.services.ssh.some(
          existing => existing.hostname === sshKey.hostname
        );

        if (!exists) {
          await vaultManager.addSSHKey({
            hostname: sshKey.hostname,
            publicKey: sshKey.publicKey,
            fingerprint: sshKey.fingerprint
          });
          console.log(chalk.gray(`  + SSH key: ${sshKey.hostname}`));
        } else {
          console.log(chalk.yellow(`  ~ SSH key already exists: ${sshKey.hostname}`));
        }
      }
    }

    // Merge wallets
    if (importData.config?.services?.wallets) {
      for (const wallet of importData.config.services.wallets) {
        const exists = currentVault.config.services.wallets.some(
          existing => existing.service === wallet.service && existing.type === wallet.type
        );

        if (!exists) {
          await vaultManager.addWallet({
            service: wallet.service,
            type: wallet.type,
            xpub: wallet.xpub,
            address: wallet.address,
            path: wallet.path
          });
          console.log(chalk.gray(`  + Wallet: ${wallet.service} (${wallet.type})`));
        } else {
          console.log(chalk.yellow(`  ~ Wallet already exists: ${wallet.service} (${wallet.type})`));
        }
      }
    }

    // Merge TOTP services
    if (importData.config?.services?.totp) {
      for (const totp of importData.config.services.totp) {
        const exists = currentVault.config.services.totp.some(
          existing => existing.service === totp.service
        );

        if (!exists) {
          await vaultManager.addTOTP({
            service: totp.service,
            secret: totp.secret,
            algorithm: totp.algorithm,
            digits: totp.digits,
            period: totp.period
          });
          console.log(chalk.gray(`  + TOTP: ${totp.service}`));
        } else {
          console.log(chalk.yellow(`  ~ TOTP already exists: ${totp.service}`));
        }
      }
    }

    // Merge passwords
    if (importData.passwords) {
      for (const password of importData.passwords) {
        const exists = currentVault.passwords.some(
          existing => existing.site === password.site
        );

        if (!exists) {
          await vaultManager.addPassword({
            site: password.site,
            username: password.username,
            password: password.password,
            notes: password.notes,
            tags: password.tags
          });
          console.log(chalk.gray(`  + Password: ${password.site}`));
        } else {
          console.log(chalk.yellow(`  ~ Password already exists: ${password.site}`));
        }
      }
    }

    // Merge notes
    if (importData.notes) {
      for (const note of importData.notes) {
        const exists = currentVault.notes.some(
          existing => existing.title === note.title
        );

        if (!exists) {
          await vaultManager.addNote({
            title: note.title,
            content: note.content
          });
          console.log(chalk.gray(`  + Note: ${note.title}`));
        } else {
          console.log(chalk.yellow(`  ~ Note already exists: ${note.title}`));
        }
      }
    }

    // Sync merged vault
    await vaultManager.sync();
  }

  /**
   * Replace current vault with imported data
   */
  private static async replaceVault(vaultManager: VaultManager, importData: any): Promise<void> {
    console.log(chalk.yellow("⚠ Replacing current vault with imported data"));
    
    // Clear current vault
    await vaultManager.clear();

    // Import all data
    if (importData.config?.services?.ssh) {
      for (const sshKey of importData.config.services.ssh) {
        await vaultManager.addSSHKey({
          hostname: sshKey.hostname,
          publicKey: sshKey.publicKey,
          fingerprint: sshKey.fingerprint
        });
      }
    }

    if (importData.config?.services?.wallets) {
      for (const wallet of importData.config.services.wallets) {
        await vaultManager.addWallet({
          service: wallet.service,
          type: wallet.type,
          xpub: wallet.xpub,
          address: wallet.address,
          path: wallet.path
        });
      }
    }

    if (importData.config?.services?.totp) {
      for (const totp of importData.config.services.totp) {
        await vaultManager.addTOTP({
          service: totp.service,
          secret: totp.secret,
          algorithm: totp.algorithm,
          digits: totp.digits,
          period: totp.period
        });
      }
    }

    if (importData.passwords) {
      for (const password of importData.passwords) {
        await vaultManager.addPassword({
          site: password.site,
          username: password.username,
          password: password.password,
          notes: password.notes,
          tags: password.tags
        });
      }
    }

    if (importData.notes) {
      for (const note of importData.notes) {
        await vaultManager.addNote({
          title: note.title,
          content: note.content
        });
      }
    }

    // Sync replaced vault
    await vaultManager.sync();
  }

  /**
   * Prompt for import file (in interactive mode)
   */
  private static promptForFile(): string {
    // In production, this would prompt the user
    // For now, return a default
    return "./keyforge-export.json";
  }

  /**
   * Show import help
   */
  static showHelp(): void {
    console.log(chalk.bold("Keyforge Import"));
    console.log();
    console.log("Import vault data from various formats:");
    console.log();
    console.log(chalk.bold("Options:"));
    console.log("  --input <file>    Input file path");
    console.log("  --format <type>   Format: json, encrypted, backup, auto");
    console.log("  --merge           Merge with existing vault (default: replace)");
    console.log("  --dry-run         Preview import without making changes");
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log("  keyforge import --input backup.json");
    console.log("  keyforge import --input encrypted.kf --format encrypted");
    console.log("  keyforge import --input backup.kf --merge --dry-run");
  }
}