/**
 * CLI command for TOTP/2FA code generation and management
 * Handles generating TOTP codes, adding services, and displaying QR codes
 */

import { SessionManager } from "../session";
import { VaultManager } from "../../vault/storage";
import { DomainDerivation, KeyDomain } from "../../core/domains";
import chalk from "chalk";
import { createHmac } from "node:crypto";

interface TOTPOptions {
  qr?: boolean;
  secret?: boolean;
  add?: boolean;
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  digits?: 6 | 8;
  period?: 30 | 60;
}

export class TOTPCommand {
  /**
   * Execute TOTP command
   */
  static async execute(service: string, options: TOTPOptions = {}): Promise<void> {
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

      if (options.add) {
        await this.addTOTPService(vaultManager, service, options);
      } else {
        await this.generateTOTPCode(vaultManager, masterSeed, service, options);
      }

    } catch (error) {
      console.error(chalk.red("TOTP operation failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Generate TOTP code for service
   */
  private static async generateTOTPCode(
    vaultManager: VaultManager,
    masterSeed: Buffer,
    service: string,
    options: TOTPOptions
  ): Promise<void> {
    // Check if service already exists in vault
    const vault = await vaultManager.getVault();
    const existingTOTP = vault.config.services.totp.find(t => t.service === service);

    // Use stored settings if available, otherwise use options/defaults
    const algorithm = options.algorithm || existingTOTP?.algorithm || "SHA1";
    const digits = options.digits || existingTOTP?.digits || 6;
    const period = options.period || existingTOTP?.period || 30;

    // Derive TOTP secret deterministically
    const secret = this.deriveSecret(masterSeed, service);

    // Generate current TOTP code
    const code = this.generateTOTP(secret, algorithm, digits, period);
    const timeRemaining = this.getTimeRemaining(period);

    console.log(chalk.cyan(`TOTP for ${service}:`));
    console.log();
    console.log(chalk.bold.green(`  ${this.formatTOTPCode(code, digits)}`));
    console.log();
    console.log(chalk.gray(`Valid for ${timeRemaining} seconds`));

    // Show QR code if requested
    if (options.qr) {
      await this.showQRCode(service, secret, algorithm, digits, period);
    }

    // Show secret if requested
    if (options.secret) {
      console.log();
      console.log(chalk.yellow("⚠ Secret (keep secure):"));
      console.log(chalk.gray(this.base32Encode(secret)));
    }

    // Add to vault if not already there
    try {
      await vaultManager.addTOTP({
        service,
        secret: secret.toString('base64'), // Store base64 encoded
        algorithm,
        digits,
        period
      });
    } catch (error) {
      // May already exist, that's fine
    }
  }

  /**
   * Add TOTP service to vault
   */
  private static async addTOTPService(
    vaultManager: VaultManager,
    service: string,
    options: TOTPOptions
  ): Promise<void> {
    console.log(chalk.cyan(`Adding TOTP service: ${service}`));

    const algorithm = options.algorithm || "SHA1";
    const digits = options.digits || 6;
    const period = options.period || 30;

    // Generate secret
    const secret = crypto.getRandomValues(new Uint8Array(20));

    await vaultManager.addTOTP({
      service,
      secret: Buffer.from(secret).toString('base64'),
      algorithm,
      digits,
      period
    });

    console.log(chalk.green(`✓ TOTP service added: ${service}`));
    
    // Show setup information
    console.log();
    console.log(chalk.bold("Setup Information:"));
    console.log(`Service: ${service}`);
    console.log(`Algorithm: ${algorithm}`);
    console.log(`Digits: ${digits}`);
    console.log(`Period: ${period} seconds`);
    console.log();

    // Show QR code for setup
    await this.showQRCode(service, Buffer.from(secret), algorithm, digits, period);

    // Auto-sync vault
    await vaultManager.sync();
  }

  /**
   * Derive deterministic TOTP secret from master seed
   */
  private static deriveSecret(masterSeed: Buffer, service: string): Buffer {
    // Create service-specific index
    const serviceHash = createHmac('sha256', service).digest();
    const index = serviceHash.readUInt32LE(0);

    return DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.SERVICE_TOTP,
      index,
      20 // 20 bytes = 160 bits for TOTP secret
    );
  }

  /**
   * Generate TOTP code using HMAC-based algorithm
   */
  private static generateTOTP(
    secret: Buffer,
    algorithm: string = "SHA1",
    digits: number = 6,
    period: number = 30
  ): string {
    // Calculate time counter
    const time = Math.floor(Date.now() / 1000);
    const counter = Math.floor(time / period);

    // Convert counter to 8-byte big-endian
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

    // Generate HMAC
    const hmacAlgorithm = algorithm.toLowerCase().replace('sha', 'sha');
    const hmac = createHmac(hmacAlgorithm, secret);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);

    // Generate final code
    const finalCode = code % Math.pow(10, digits);
    return finalCode.toString().padStart(digits, '0');
  }

  /**
   * Get time remaining for current period
   */
  private static getTimeRemaining(period: number = 30): number {
    const time = Math.floor(Date.now() / 1000);
    return period - (time % period);
  }

  /**
   * Format TOTP code for display
   */
  private static formatTOTPCode(code: string, digits: number): string {
    if (digits === 6) {
      return `${code.slice(0, 3)} ${code.slice(3)}`;
    } else if (digits === 8) {
      return `${code.slice(0, 4)} ${code.slice(4)}`;
    }
    return code;
  }

  /**
   * Show QR code for TOTP setup
   */
  private static async showQRCode(
    service: string,
    secret: Buffer,
    algorithm: string,
    digits: number,
    period: number
  ): Promise<void> {
    try {
      const qrcode = await import("qrcode-terminal");
      
      // Generate otpauth URL
      const secretBase32 = this.base32Encode(secret);
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(service)}?secret=${secretBase32}&algorithm=${algorithm}&digits=${digits}&period=${period}&issuer=Keyforge`;

      console.log();
      console.log(chalk.bold("QR Code for authenticator app:"));
      console.log();

      qrcode.generate(otpauthUrl, { small: true }, (qr) => {
        console.log(qr);
      });

      console.log();
      console.log(chalk.gray("Manual entry:"));
      console.log(chalk.gray(`Secret: ${secretBase32}`));
      console.log();

    } catch (error) {
      console.log(chalk.yellow("⚠ Could not generate QR code"));
      console.log(chalk.gray("Install qrcode-terminal package for QR code support"));
    }
  }

  /**
   * Base32 encode for TOTP secrets
   */
  private static base32Encode(buffer: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let result = "";

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        bits -= 5;
        result += alphabet[(value >>> bits) & 31];
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }

    // Add padding
    while (result.length % 8 !== 0) {
      result += "=";
    }

    return result;
  }

  /**
   * List all TOTP services
   */
  static async listServices(vaultManager: VaultManager): Promise<void> {
    const vault = await vaultManager.getVault();
    const totpServices = vault.config.services.totp;

    if (totpServices.length === 0) {
      console.log(chalk.yellow("No TOTP services configured"));
      console.log("Use 'keyforge totp <service>' to generate codes");
      return;
    }

    console.log(chalk.cyan(`TOTP Services (${totpServices.length}):`));
    console.log();

    totpServices
      .sort((a, b) => a.service.localeCompare(b.service))
      .forEach(totp => {
        console.log(`${chalk.bold(totp.service)}`);
        console.log(chalk.gray(`  Algorithm: ${totp.algorithm}, Digits: ${totp.digits}, Period: ${totp.period}s`));
      });
  }
}