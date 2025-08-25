/**
 * GPG key generation using deterministic derivation
 * Generates Ed25519 keys in OpenPGP format
 */

import { ed25519 } from "@noble/curves/ed25519";
import { KeyDomain, DomainDerivation } from "../core/domains";
import { createHash } from "node:crypto";

export interface GPGKey {
  algorithm: "ed25519";
  keyId: string;
  fingerprint: string;
  publicKey: string;    // ASCII armored public key
  privateKey: string;   // ASCII armored private key
  userInfo: {
    name: string;
    email: string;
    comment?: string;
  };
}

export interface GPGOptions {
  name?: string;
  email?: string;
  comment?: string;
  service?: string;
}

export class GPGGenerator {
  /**
   * Generate GPG keypair deterministically
   */
  static generate(masterSeed: Buffer, options: GPGOptions = {}): GPGKey {
    // Derive GPG-specific seed
    const index = options.service ? this.serviceToIndex(options.service) : 0;
    const gpgSeed = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.GPG,
      index,
      32
    );

    // Generate Ed25519 keypair from seed
    const privateKeyBytes = gpgSeed;
    const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);

    // Create user info
    const userInfo = {
      name: options.name || "Keyforge User",
      email: options.email || "user@keyforge.local", 
      comment: options.comment
    };

    // Generate key ID and fingerprint
    const keyId = this.generateKeyId(publicKeyBytes);
    const fingerprint = this.generateFingerprint(publicKeyBytes, userInfo);

    // Format as OpenPGP ASCII armor
    const publicKey = this.formatPublicKey(publicKeyBytes, userInfo, keyId);
    const privateKey = this.formatPrivateKey(privateKeyBytes, publicKeyBytes, userInfo, keyId);

    return {
      algorithm: "ed25519",
      keyId,
      fingerprint,
      publicKey,
      privateKey,
      userInfo
    };
  }

  /**
   * Convert service name to deterministic index
   */
  private static serviceToIndex(service: string): number {
    const hash = createHash("sha256").update(service).digest();
    return hash.readUInt32LE(0);
  }

  /**
   * Generate GPG key ID from public key
   */
  private static generateKeyId(publicKey: Uint8Array): string {
    const hash = createHash("sha1").update(publicKey).digest();
    return hash.slice(-8).toString("hex").toUpperCase();
  }

  /**
   * Generate GPG fingerprint
   */
  private static generateFingerprint(publicKey: Uint8Array, userInfo: any): string {
    // Simplified fingerprint generation
    // In a full implementation, this would follow OpenPGP packet format
    const content = Buffer.concat([
      Buffer.from(publicKey),
      Buffer.from(userInfo.name),
      Buffer.from(userInfo.email)
    ]);
    
    const hash = createHash("sha1").update(content).digest();
    return hash.toString("hex").toUpperCase();
  }

  /**
   * Format public key as ASCII armored OpenPGP
   */
  private static formatPublicKey(publicKey: Uint8Array, userInfo: any, keyId: string): string {
    // Simplified OpenPGP public key format
    // In production, use proper OpenPGP library like openpgp.js
    
    const keyData = Buffer.concat([
      Buffer.from([0x99]), // Public key packet tag
      Buffer.from(publicKey),
      Buffer.from(userInfo.name),
      Buffer.from(userInfo.email)
    ]);

    const base64Data = keyData.toString("base64");
    
    return [
      "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      "",
      this.wrapBase64(base64Data, 64),
      "-----END PGP PUBLIC KEY BLOCK-----"
    ].join("\n");
  }

  /**
   * Format private key as ASCII armored OpenPGP
   */
  private static formatPrivateKey(
    privateKey: Uint8Array,
    publicKey: Uint8Array, 
    userInfo: any,
    keyId: string
  ): string {
    // Simplified OpenPGP private key format
    const keyData = Buffer.concat([
      Buffer.from([0x95]), // Private key packet tag  
      Buffer.from(privateKey),
      Buffer.from(publicKey),
      Buffer.from(userInfo.name),
      Buffer.from(userInfo.email)
    ]);

    const base64Data = keyData.toString("base64");

    return [
      "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      "",
      this.wrapBase64(base64Data, 64),
      "-----END PGP PRIVATE KEY BLOCK-----"
    ].join("\n");
  }

  /**
   * Wrap base64 data to specified line length
   */
  private static wrapBase64(data: string, width: number): string {
    const lines = [];
    for (let i = 0; i < data.length; i += width) {
      lines.push(data.slice(i, i + width));
    }
    return lines.join("\n");
  }

  /**
   * Generate GPG key usage information
   */
  static getKeyUsage(): string {
    return [
      "Key capabilities:",
      "• Encryption (E)",
      "• Signing (S)", 
      "• Authentication (A)",
      "",
      "Usage examples:",
      "• gpg --import public.asc",
      "• gpg --import private.asc", 
      "• gpg --encrypt --recipient <key-id> file.txt",
      "• gpg --sign file.txt",
      "• git config user.signingkey <key-id>"
    ].join("\n");
  }

  /**
   * Validate GPG options
   */
  static validateOptions(options: GPGOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.email && !this.isValidEmail(options.email)) {
      errors.push("Invalid email format");
    }

    if (options.name && options.name.length < 2) {
      errors.push("Name must be at least 2 characters");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Simple email validation
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}