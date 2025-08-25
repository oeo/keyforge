/**
 * CLI command for generating cryptographic keys
 * Handles SSH keys, Bitcoin/Ethereum wallets, and other key types
 */

import { SSHGenerator } from "../../generators/ssh";
import { WalletGenerator } from "../../generators/wallet";
import { GPGGenerator } from "../../generators/gpg";
import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import chalk from "chalk";
import * as clipboardy from "clipboardy";

interface GenerateOptions {
  service?: string;
  output?: string;
  copy?: boolean;
  format?: string;
  showPrivate?: boolean;
  name?: string;
  email?: string;
  comment?: string;
}

export class GenerateCommand {
  /**
   * Execute generate command
   */
  static async execute(type: string, options: GenerateOptions): Promise<void> {
    // Get master seed from session
    const masterSeed = await SessionManager.getMasterSeed();
    if (!masterSeed) {
      console.error(chalk.red("Not initialized. Run 'keyforge init' first."));
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
      return;
    }

    // Normalize type and handle aliases
    const keyType = this.normalizeKeyType(type);

    try {
      switch (keyType) {
        case "ssh":
          await this.generateSSH(masterSeed, options);
          break;

        case "bitcoin":
          await this.generateBitcoin(masterSeed, options);
          break;

        case "ethereum":
          await this.generateEthereum(masterSeed, options);
          break;

        case "gpg":
          await this.generateGPG(masterSeed, options);
          break;

        default:
          console.error(chalk.red(`Unknown key type: ${type}`));
          console.log("Available types: ssh, gpg, bitcoin, ethereum");
          if (process.env.NODE_ENV !== 'test') {
            process.exit(1);
          }
          return;
      }
    } catch (error) {
      console.error(chalk.red(`Failed to generate ${keyType} key:`), error);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
      return;
    }
  }

  /**
   * Normalize key type and handle aliases
   */
  private static normalizeKeyType(type: string): string {
    const aliases: Record<string, string> = {
      "btc": "bitcoin",
      "eth": "ethereum"
    };

    return aliases[type.toLowerCase()] || type.toLowerCase();
  }

  /**
   * Generate SSH keypair
   */
  private static async generateSSH(masterSeed: Buffer, options: GenerateOptions): Promise<void> {
    const ssh = SSHGenerator.generate(masterSeed, options.service);

    if (options.output) {
      // Save to files
      const privateFile = options.output;
      const publicFile = `${options.output}.pub`;

      // Ensure directory exists
      const dir = dirname(privateFile);
      mkdirSync(dir, { recursive: true });

      writeFileSync(privateFile, ssh.privateKey, { mode: 0o600 });
      writeFileSync(publicFile, ssh.publicKey);

      console.log(chalk.green(`✓ SSH key saved to ${privateFile}`));
    } else {
      // Display to console
      console.log(chalk.cyan("Public Key:"));
      console.log(ssh.publicKey);
      console.log(chalk.gray(`Fingerprint: ${ssh.fingerprint}`));

      if (options.showPrivate) {
        console.log(chalk.yellow("\nPrivate Key:"));
        console.log(ssh.privateKey);
      }
    }

    // Copy to clipboard
    if (options.copy) {
      try {
        await clipboardy.write(ssh.publicKey);
        console.log(chalk.green("✓ Public key copied to clipboard"));
      } catch (error) {
        console.warn(chalk.yellow("⚠ Failed to copy to clipboard"));
      }
    }

    // Track in vault
    try {
      const vaultManager = new VaultManager(masterSeed);
      await vaultManager.addSSHKey({
        hostname: options.service || 'default',
        publicKey: ssh.publicKey,
        fingerprint: ssh.fingerprint
      });
    } catch (error) {
      // Don't fail key generation if vault tracking fails
      console.warn(chalk.yellow("⚠ Could not save to vault"));
    }
  }

  /**
   * Generate Bitcoin wallet
   */
  private static async generateBitcoin(masterSeed: Buffer, options: GenerateOptions): Promise<void> {
    const wallet = WalletGenerator.generate(masterSeed, options.service);

    console.log(chalk.cyan("Bitcoin Wallet:"));
    console.log(`Address: ${chalk.bold(wallet.bitcoin.address)}`);
    console.log(`Path: ${wallet.bitcoin.path}`);

    if (options.showPrivate) {
      console.log(chalk.yellow("\nWARNING: Private key exposure"));
      console.log(`xpriv: ${wallet.bitcoin.xpriv}`);
    } else {
      console.log(`xpub: ${wallet.bitcoin.xpub}`);
    }

    if (options.copy) {
      try {
        await clipboardy.write(wallet.bitcoin.address);
        console.log(chalk.green("✓ Address copied to clipboard"));
      } catch (error) {
        console.warn(chalk.yellow("⚠ Failed to copy to clipboard"));
      }
    }

    // Track in vault
    try {
      const vaultManager = new VaultManager(masterSeed);
      await vaultManager.addWallet({
        service: options.service || 'default',
        type: 'bitcoin',
        xpub: wallet.bitcoin.xpub,
        address: wallet.bitcoin.address,
        path: wallet.bitcoin.path
      });
    } catch (error) {
      // Don't fail key generation if vault tracking fails
      console.warn(chalk.yellow("⚠ Could not save to vault"));
    }
  }

  /**
   * Generate Ethereum wallet
   */
  private static async generateEthereum(masterSeed: Buffer, options: GenerateOptions): Promise<void> {
    const wallet = WalletGenerator.generate(masterSeed, options.service);

    console.log(chalk.cyan("Ethereum Wallet:"));
    console.log(`Address: ${chalk.bold(wallet.ethereum.address)}`);

    if (options.showPrivate) {
      console.log(chalk.yellow("\nWARNING: Private key exposure"));
      console.log(`Private Key: ${wallet.ethereum.privateKey}`);
    }

    if (options.copy) {
      try {
        await clipboardy.write(wallet.ethereum.address);
        console.log(chalk.green("✓ Address copied to clipboard"));
      } catch (error) {
        console.warn(chalk.yellow("⚠ Failed to copy to clipboard"));
      }
    }

    // Track in vault
    try {
      const vaultManager = new VaultManager(masterSeed);
      await vaultManager.addWallet({
        service: options.service || 'default',
        type: 'ethereum',
        address: wallet.ethereum.address,
        path: "m/44'/60'/0'/0/0"
      });
    } catch (error) {
      // Don't fail key generation if vault tracking fails
      console.warn(chalk.yellow("⚠ Could not save to vault"));
    }
  }

  /**
   * Generate GPG key
   */
  private static async generateGPG(masterSeed: Buffer, options: GenerateOptions): Promise<void> {
    // Validate options
    const validation = GPGGenerator.validateOptions({
      name: options.name,
      email: options.email,
      comment: options.comment,
      service: options.service
    });

    if (!validation.valid) {
      validation.errors.forEach(error => {
        console.error(chalk.red(`Error: ${error}`));
      });
      return;
    }

    const gpg = GPGGenerator.generate(masterSeed, {
      name: options.name,
      email: options.email,
      comment: options.comment,
      service: options.service
    });

    if (options.output) {
      // Save to files
      const publicFile = `${options.output}.pub`;
      const privateFile = `${options.output}.sec`;

      // Ensure directory exists
      const dir = dirname(privateFile);
      mkdirSync(dir, { recursive: true });

      writeFileSync(publicFile, gpg.publicKey);
      writeFileSync(privateFile, gpg.privateKey, { mode: 0o600 });

      console.log(chalk.green(`✓ GPG key saved to ${options.output}.*`));
      console.log(chalk.gray(`Public key: ${publicFile}`));
      console.log(chalk.gray(`Private key: ${privateFile}`));
    } else {
      // Display to console
      console.log(chalk.cyan("GPG Key Generated:"));
      console.log(`Key ID: ${chalk.bold(gpg.keyId)}`);
      console.log(`Fingerprint: ${gpg.fingerprint}`);
      console.log(`User: ${gpg.userInfo.name} <${gpg.userInfo.email}>`);
      if (gpg.userInfo.comment) {
        console.log(`Comment: ${gpg.userInfo.comment}`);
      }
      console.log();

      console.log(chalk.cyan("Public Key:"));
      console.log(gpg.publicKey);
      
      if (options.showPrivate) {
        console.log(chalk.yellow("\nPrivate Key:"));
        console.log(gpg.privateKey);
      }

      console.log();
      console.log(chalk.gray("Usage:"));
      console.log(GPGGenerator.getKeyUsage());
    }

    // Copy to clipboard
    if (options.copy) {
      try {
        await clipboardy.write(gpg.publicKey);
        console.log(chalk.green("✓ Public key copied to clipboard"));
      } catch (error) {
        console.warn(chalk.yellow("⚠ Failed to copy to clipboard"));
      }
    }

    // Track in vault
    try {
      const vaultManager = new VaultManager(masterSeed);
      await vaultManager.addGPGKey({
        keyId: gpg.keyId,
        fingerprint: gpg.fingerprint,
        userInfo: gpg.userInfo,
        publicKey: gpg.publicKey,
        service: options.service || 'default'
      });
    } catch (error) {
      // Don't fail key generation if vault tracking fails
      console.warn(chalk.yellow("⚠ Could not save to vault"));
    }
  }
}