/**
 * Type definitions for the encrypted vault system
 */

export interface VaultData {
  version: number;
  created: string;  // ISO 8601 timestamp
  updated: string;  // ISO 8601 timestamp

  // Configuration tracking - what keys have been generated
  config: {
    services: {
      ssh: Array<{
        id: string;
        hostname: string;
        publicKey: string;
        fingerprint: string;
        created: string;
      }>;

      gpg: Array<{
        id: string;
        service: string;
        keyId: string;
        fingerprint: string;
        publicKey: string;
        userInfo: {
          name: string;
          email: string;
          comment?: string;
        };
        created: string;
      }>;

      wallets: Array<{
        id: string;
        service: string;
        type: "bitcoin" | "ethereum" | "monero";
        xpub?: string;
        address?: string;
        path: string;
        created: string;
      }>;

      totp: Array<{
        id: string;
        service: string;
        secret: string;  // Will be encrypted within vault
        algorithm: "SHA1" | "SHA256" | "SHA512";
        digits: 6 | 8;
        period: 30 | 60;
        created: string;
      }>;
    };
  };

  // Password manager entries
  passwords: Array<{
    id: string;
    site: string;
    username: string;
    password: string;  // Will be encrypted within vault
    notes?: string;
    tags: string[];
    created: string;
    modified: string;
    passwordHistory: Array<{
      password: string;
      changed: string;
    }>;
  }>;

  // Secure notes
  notes: Array<{
    id: string;
    title: string;
    content: string;  // Will be encrypted within vault
    attachments: Array<{
      name: string;
      mimeType: string;
      size: number;
      arweaveId?: string;
      data?: string;  // Base64 for small files
    }>;
    created: string;
    modified: string;
  }>;

  // Metadata
  metadata: {
    checksum: string;
    previousVersion?: string;  // Arweave TX ID or other reference
    backups: {
      arweave?: string;
      nostr?: string[];
      ipfs?: string;
      local?: string;
    };
  };
}

export interface EncryptedVault {
  encrypted: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

export interface VaultPassword {
  id: string;
  site: string;
  username: string;
  password: string;
  notes?: string;
  tags: string[];
}

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data?: string;
  }>;
}

export interface VaultConfig {
  ssh: VaultData['config']['services']['ssh'];
  gpg: VaultData['config']['services']['gpg'];
  wallets: VaultData['config']['services']['wallets'];
  totp: VaultData['config']['services']['totp'];
}