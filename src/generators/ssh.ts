/**
 * SSH key generation using Ed25519 curves
 * Generates OpenSSH-compatible keypairs deterministically
 */

import { ed25519 } from "@noble/curves/ed25519";
import { KeyDomain, DomainDerivation } from "../core/domains";
import { createHash } from "node:crypto";

export interface SSHKey {
  algorithm: "ed25519";
  privateKey: string;  // OpenSSH format
  publicKey: string;   // ssh-ed25519 format
  fingerprint: string; // SHA256:base64
}

export class SSHGenerator {
  /**
   * Generate deterministic SSH keypair for a hostname
   */
  static generate(masterSeed: Buffer, hostname?: string): SSHKey {
    // Derive seed for this specific host
    const index = hostname ? this.hostnameToIndex(hostname) : 0;
    const seed = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.SSH,
      index,
      32
    );

    // Generate Ed25519 keypair from derived seed
    const privateKeyBytes = seed;
    const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);

    // Format as OpenSSH keys
    const sshPublic = this.formatSSHPublicKey(publicKeyBytes, hostname);
    const sshPrivate = this.formatSSHPrivateKey(privateKeyBytes, publicKeyBytes);
    const fingerprint = this.calculateFingerprint(publicKeyBytes);

    return {
      algorithm: "ed25519",
      privateKey: sshPrivate,
      publicKey: sshPublic,
      fingerprint
    };
  }

  /**
   * Convert hostname to deterministic index
   */
  static hostnameToIndex(hostname: string): number {
    const hash = createHash("sha256");
    hash.update(hostname);
    const digest = hash.digest();
    return digest.readUInt32LE(0);
  }

  /**
   * Format public key in ssh-ed25519 format
   */
  private static formatSSHPublicKey(publicKey: Uint8Array, hostname?: string): string {
    const keyType = "ssh-ed25519";
    
    // Build SSH wire format: length + type + length + key
    const keyData = Buffer.concat([
      this.writeUint32(keyType.length),   // Length of key type string
      Buffer.from(keyType, 'ascii'),      // Key type string
      this.writeUint32(publicKey.length), // Length of public key
      Buffer.from(publicKey)              // Public key bytes
    ]);

    const comment = hostname && hostname.length > 0 ? `keyforge@${hostname}` : "keyforge";
    return `${keyType} ${keyData.toString("base64")} ${comment}`;
  }

  /**
   * Format private key in OpenSSH format
   */
  private static formatSSHPrivateKey(privateKey: Uint8Array, publicKey: Uint8Array): string {
    const AUTH_MAGIC = "openssh-key-v1\0";
    const keyType = "ssh-ed25519";
    
    // OpenSSH private key consists of:
    // - Magic string
    // - Cipher name (none)
    // - KDF name (none) 
    // - KDF options (empty)
    // - Number of keys (1)
    // - Public key
    // - Private key section

    // Build private key section
    const checkInt = 0x12345678; // Random check integer
    const privateSection = Buffer.concat([
      this.writeUint32(checkInt),         // Check int 1
      this.writeUint32(checkInt),         // Check int 2 (same for unencrypted)
      this.writeString(keyType),          // Key type
      this.writeBuffer(publicKey),        // Public key
      this.writeBuffer(Buffer.concat([    // Private key (64 bytes: 32 private + 32 public)
        Buffer.from(privateKey),
        Buffer.from(publicKey)
      ])),
      this.writeString(""),               // Comment (empty)
    ]);

    // Pad private section to block size
    const padded = this.padBuffer(privateSection, 8);

    // Build full key
    const fullKey = Buffer.concat([
      Buffer.from(AUTH_MAGIC, 'binary'),
      this.writeString("none"),           // Cipher
      this.writeString("none"),           // KDF
      this.writeString(""),               // KDF options
      this.writeUint32(1),                // Number of keys
      this.writeBuffer(publicKey),        // Public key
      this.writeBuffer(padded)            // Private section
    ]);

    return [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      this.base64Wrap(fullKey.toString("base64"), 70),
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n");
  }

  /**
   * Calculate SHA256 fingerprint of public key
   */
  private static calculateFingerprint(publicKey: Uint8Array): string {
    const hash = createHash("sha256");
    hash.update(publicKey);
    const digest = hash.digest("base64");
    return `SHA256:${digest.replace(/=+$/, "")}`;
  }

  /**
   * Write 32-bit big-endian integer
   */
  private static writeUint32(value: number): Buffer {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32BE(value, 0);
    return buf;
  }

  /**
   * Write string with length prefix
   */
  private static writeString(str: string): Buffer {
    const buf = Buffer.from(str, 'utf8');
    return Buffer.concat([this.writeUint32(buf.length), buf]);
  }

  /**
   * Write buffer with length prefix
   */
  private static writeBuffer(buf: Buffer | Uint8Array): Buffer {
    const buffer = Buffer.from(buf);
    return Buffer.concat([this.writeUint32(buffer.length), buffer]);
  }

  /**
   * Pad buffer to block size with incrementing bytes
   */
  private static padBuffer(buffer: Buffer, blockSize: number): Buffer {
    const padLength = blockSize - (buffer.length % blockSize);
    if (padLength === blockSize) return buffer;
    
    const padding = Buffer.alloc(padLength);
    for (let i = 0; i < padLength; i++) {
      padding[i] = i + 1;
    }
    
    return Buffer.concat([buffer, padding]);
  }

  /**
   * Wrap base64 string to specified width
   */
  private static base64Wrap(str: string, width: number): string {
    const lines = [];
    for (let i = 0; i < str.length; i += width) {
      lines.push(str.slice(i, i + width));
    }
    return lines.join("\n");
  }
}