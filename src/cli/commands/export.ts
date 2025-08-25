/**
 * CLI command for exporting vault data
 * Handles exporting vault to various formats (JSON, encrypted backup, etc.)
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import { VaultEncryption } from "../../vault/encryption";
import chalk from "chalk";
import { writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

interface ExportOptions {
  output?: string;
  format?: 'json' | 'encrypted' | 'backup';
  include?: string[];
  exclude?: string[];
}

export class ExportCommand {
  /**
   * Execute export command
   */
  static async execute(options: ExportOptions = {}): Promise<void> {
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
      const format = options.format || 'json';
      const outputFile = options.output || this.getDefaultOutputFile(format);

      console.log(chalk.cyan(`Exporting vault to ${format} format...`));

      switch (format) {
        case 'json':
          await this.exportJSON(vaultManager, outputFile, options);
          break;

        case 'encrypted':
          await this.exportEncrypted(vaultManager, masterSeed, outputFile, options);
          break;

        case 'backup':
          await this.exportBackup(vaultManager, masterSeed, outputFile, options);
          break;

        default:
          console.error(chalk.red(`Unknown export format: ${format}`));
          console.log("Available formats: json, encrypted, backup");
          return;
      }

      console.log(chalk.green(`✓ Vault exported to ${outputFile}`));
      console.log(chalk.gray(`File size: ${this.getFileSize(outputFile)}`));

    } catch (error) {
      console.error(chalk.red("Export failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Export vault as JSON (readable format)
   */
  private static async exportJSON(
    vaultManager: VaultManager,
    outputFile: string,
    options: ExportOptions
  ): Promise<void> {
    const vault = await vaultManager.getVault();
    const exportData = this.filterVaultData(vault, options);

    // Create readable JSON
    const jsonData = {
      exportInfo: {
        version: "1.0.0",
        exported: new Date().toISOString(),
        format: "json",
        note: "This is a readable export of your Keyforge vault. Keep it secure!"
      },
      vault: exportData
    };

    this.ensureDirectoryExists(outputFile);
    writeFileSync(outputFile, JSON.stringify(jsonData, null, 2));
  }

  /**
   * Export vault as encrypted backup
   */
  private static async exportEncrypted(
    vaultManager: VaultManager,
    masterSeed: Buffer,
    outputFile: string,
    options: ExportOptions
  ): Promise<void> {
    const vault = await vaultManager.getVault();
    const exportData = this.filterVaultData(vault, options);

    // Encrypt the export data
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(exportData, masterSeed);

    // Create export container
    const container = {
      version: "1.0.0",
      format: "encrypted",
      exported: new Date().toISOString(),
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };

    this.ensureDirectoryExists(outputFile);
    writeFileSync(outputFile, JSON.stringify(container));
  }

  /**
   * Export vault as complete backup (includes metadata)
   */
  private static async exportBackup(
    vaultManager: VaultManager,
    masterSeed: Buffer,
    outputFile: string,
    options: ExportOptions
  ): Promise<void> {
    const vault = await vaultManager.getVault();
    
    // Create comprehensive backup
    const backupData = {
      vault: this.filterVaultData(vault, options),
      metadata: {
        exported: new Date().toISOString(),
        exportVersion: "1.0.0",
        vaultVersion: vault.version,
        checksum: vault.metadata.checksum,
        originalCreated: vault.created,
        originalUpdated: vault.updated
      }
    };

    // Encrypt backup
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(backupData, masterSeed);

    // Create backup container
    const container = {
      format: "keyforge-backup",
      version: "1.0.0",
      exported: new Date().toISOString(),
      encryption: "ChaCha20-Poly1305",
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };

    this.ensureDirectoryExists(outputFile);
    writeFileSync(outputFile, JSON.stringify(container));
  }

  /**
   * Filter vault data based on include/exclude options
   */
  private static filterVaultData(vault: any, options: ExportOptions): any {
    const data = JSON.parse(JSON.stringify(vault)); // Deep copy

    // Apply include filter
    if (options.include && options.include.length > 0) {
      const filtered: any = {
        version: data.version,
        created: data.created,
        updated: data.updated,
        config: { services: { ssh: [], wallets: [], totp: [] } },
        passwords: [],
        notes: [],
        metadata: data.metadata
      };

      if (options.include.includes('ssh')) {
        filtered.config.services.ssh = data.config.services.ssh;
      }
      if (options.include.includes('wallets')) {
        filtered.config.services.wallets = data.config.services.wallets;
      }
      if (options.include.includes('totp')) {
        filtered.config.services.totp = data.config.services.totp;
      }
      if (options.include.includes('passwords')) {
        filtered.passwords = data.passwords;
      }
      if (options.include.includes('notes')) {
        filtered.notes = data.notes;
      }

      return filtered;
    }

    // Apply exclude filter
    if (options.exclude && options.exclude.length > 0) {
      if (options.exclude.includes('ssh')) {
        data.config.services.ssh = [];
      }
      if (options.exclude.includes('wallets')) {
        data.config.services.wallets = [];
      }
      if (options.exclude.includes('totp')) {
        data.config.services.totp = [];
      }
      if (options.exclude.includes('passwords')) {
        data.passwords = [];
      }
      if (options.exclude.includes('notes')) {
        data.notes = [];
      }
    }

    return data;
  }

  /**
   * Get default output filename
   */
  private static getDefaultOutputFile(format: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = format === 'json' ? 'json' : 'kf';
    return `keyforge-export-${timestamp}.${extension}`;
  }

  /**
   * Ensure output directory exists
   */
  private static ensureDirectoryExists(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get human-readable file size
   */
  private static getFileSize(filePath: string): string {
    if (!existsSync(filePath)) return "0 bytes";
    
    const stats = Bun.file(filePath);
    const bytes = stats.size || 0;

    if (bytes === 0) return "0 bytes";
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Show export help
   */
  static showHelp(): void {
    console.log(chalk.bold("Keyforge Export"));
    console.log();
    console.log("Export your vault data in various formats:");
    console.log();
    console.log(chalk.bold("Formats:"));
    console.log("  json        Readable JSON format (not encrypted)");
    console.log("  encrypted   Encrypted export (same as vault format)");
    console.log("  backup      Complete backup with metadata");
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log("  keyforge export --format json --output vault.json");
    console.log("  keyforge export --format encrypted --include passwords,ssh");
    console.log("  keyforge export --format backup --exclude notes");
    console.log();
    console.log(chalk.bold("Include/Exclude:"));
    console.log("  ssh, wallets, totp, passwords, notes");
  }
}