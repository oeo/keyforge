/**
 * Vault storage manager for local file operations
 * Handles password management, secure notes, and key configuration tracking
 */

import { VaultData, VaultPassword, VaultNote, VaultConfig, EncryptedVault } from "./types";
import { VaultEncryption } from "./encryption";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

interface PasswordSearchOptions {
  tags?: string[];
  site?: string;
  username?: string;
}

export class VaultManager {
  private vault: VaultData;
  private masterSeed: Buffer;
  private vaultPath: string;

  constructor(masterSeed: Buffer, vaultPath?: string) {
    this.masterSeed = masterSeed;
    this.vaultPath = vaultPath || `${process.env.HOME}/.keyforge/vault.enc`;
    this.vault = this.initializeVault();
    this.loadVault(); // Try to load existing vault
  }

  /**
   * Load vault from encrypted file
   */
  private loadVault(): void {
    if (!existsSync(this.vaultPath)) {
      return; // No vault file exists yet
    }

    try {
      const data = readFileSync(this.vaultPath);

      // Parse encrypted vault structure
      const nonceLength = data[0];
      const nonce = Buffer.from(data.slice(1, 1 + nonceLength));
      const tagLength = data[1 + nonceLength];
      const tagStart = 2 + nonceLength;
      const tag = Buffer.from(data.slice(tagStart, tagStart + tagLength));
      const encrypted = Buffer.from(data.slice(tagStart + tagLength));

      // Decrypt and load
      this.vault = VaultEncryption.decrypt(encrypted, nonce, tag, this.masterSeed);
    } catch (error) {
      // If loading fails, keep empty vault
      this.vault = this.initializeVault();
    }
  }

  /**
   * Initialize empty vault structure
   */
  private initializeVault(): VaultData {
    const now = new Date().toISOString();
    return {
      version: 1,
      created: now,
      updated: now,
      config: {
        services: {
          ssh: [],
          gpg: [],
          wallets: [],
          totp: []
        }
      },
      passwords: [],
      notes: [],
      metadata: {
        checksum: "",
        backups: {}
      }
    };
  }

  /**
   * Get raw vault data (for testing)
   */
  getVaultData(): VaultData {
    return this.vault;
  }

  /**
   * Add password to vault
   */
  async addPassword(password: Omit<VaultPassword, "id">): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const newPassword = {
      id,
      ...password,
      created: now,
      modified: now,
      passwordHistory: []
    };

    this.vault.passwords.push(newPassword);
    this.vault.updated = now;

    await this.autoSave();
    return id;
  }

  /**
   * Get all passwords
   */
  getPasswords(): VaultData['passwords'] {
    return this.vault.passwords;
  }

  /**
   * Get password by site
   */
  getPassword(site: string): VaultData['passwords'][0] | undefined {
    return this.vault.passwords.find(p => p.site === site);
  }

  /**
   * Update existing password
   */
  async updatePassword(site: string, updates: Partial<VaultPassword>): Promise<void> {
    const password = this.vault.passwords.find(p => p.site === site);
    if (!password) {
      throw new Error(`Password for ${site} not found`);
    }

    const now = new Date().toISOString();

    // Save current password to history if password is changing
    if (updates.password && updates.password !== password.password) {
      password.passwordHistory.push({
        password: password.password,
        changed: password.modified
      });
    }

    // Apply updates
    Object.assign(password, updates, { modified: now });
    this.vault.updated = now;

    await this.autoSave();
  }

  /**
   * Delete password by site
   */
  async deletePassword(site: string): Promise<void> {
    const index = this.vault.passwords.findIndex(p => p.site === site);
    if (index === -1) {
      throw new Error(`Password for ${site} not found`);
    }

    this.vault.passwords.splice(index, 1);
    this.vault.updated = new Date().toISOString();

    await this.autoSave();
  }

  /**
   * Search passwords by criteria
   */
  searchPasswords(options: PasswordSearchOptions): VaultData['passwords'] {
    return this.vault.passwords.filter(password => {
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some(tag => password.tags.includes(tag));
        if (!hasTag) return false;
      }

      if (options.site && !password.site.includes(options.site)) {
        return false;
      }

      if (options.username && !password.username.includes(options.username)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Add secure note to vault
   */
  async addNote(note: Omit<VaultNote, "id">): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const newNote = {
      id,
      ...note,
      attachments: note.attachments || [],
      created: now,
      modified: now
    };

    this.vault.notes.push(newNote);
    this.vault.updated = now;

    await this.autoSave();
    return id;
  }

  /**
   * Get all notes
   */
  getNotes(): VaultData['notes'] {
    return this.vault.notes;
  }

  /**
   * Get note by ID
   */
  getNote(id: string): VaultData['notes'][0] | undefined {
    return this.vault.notes.find(n => n.id === id);
  }

  /**
   * Update existing note
   */
  async updateNote(id: string, updates: Partial<VaultNote>): Promise<void> {
    const note = this.vault.notes.find(n => n.id === id);
    if (!note) {
      throw new Error(`Note ${id} not found`);
    }

    const now = new Date().toISOString();
    Object.assign(note, updates, { modified: now });
    this.vault.updated = now;

    await this.autoSave();
  }

  /**
   * Delete note by ID
   */
  async deleteNote(id: string): Promise<void> {
    const index = this.vault.notes.findIndex(n => n.id === id);
    if (index === -1) {
      throw new Error(`Note ${id} not found`);
    }

    this.vault.notes.splice(index, 1);
    this.vault.updated = new Date().toISOString();

    await this.autoSave();
  }

  /**
   * Add SSH key configuration
   */
  async addSSHConfig(config: {
    hostname: string;
    publicKey: string;
    fingerprint: string;
  }): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();

    this.vault.config.services.ssh.push({
      id,
      hostname: config.hostname,
      publicKey: config.publicKey,
      fingerprint: config.fingerprint,
      created: now
    });

    this.vault.updated = now;
    await this.autoSave();
    return id;
  }

  /**
   * Get SSH configurations
   */
  getSSHConfigs(): VaultData['config']['services']['ssh'] {
    return this.vault.config.services.ssh;
  }

  /**
   * Add wallet configuration
   */
  async addWalletConfig(config: {
    service: string;
    type: "bitcoin" | "ethereum" | "monero";
    address?: string;
    xpub?: string;
    path: string;
  }): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();

    this.vault.config.services.wallets.push({
      id,
      service: config.service,
      type: config.type,
      address: config.address,
      xpub: config.xpub,
      path: config.path,
      created: now
    });

    this.vault.updated = now;
    await this.autoSave();
    return id;
  }

  /**
   * Get wallet configurations
   */
  getWalletConfigs(): VaultData['config']['services']['wallets'] {
    return this.vault.config.services.wallets;
  }

  /**
   * Save vault to disk
   */
  async save(): Promise<void> {
    // Ensure directory exists
    const dir = dirname(this.vaultPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Update checksum
    this.vault.metadata.checksum = await this.calculateChecksum();
    this.vault.updated = new Date().toISOString();

    // Encrypt and save
    const { encrypted, nonce, tag } = VaultEncryption.encrypt(this.vault, this.masterSeed);
    
    const vaultFile = Buffer.concat([
      Buffer.from([nonce.length]),  // 1 byte nonce length
      nonce,
      Buffer.from([tag.length]),    // 1 byte tag length  
      tag,
      encrypted
    ]);

    await Bun.write(this.vaultPath, vaultFile);
  }

  /**
   * Load vault from disk
   */
  async load(): Promise<void> {
    if (!existsSync(this.vaultPath)) {
      // No vault file exists, use empty vault
      return;
    }

    try {
      const vaultFile = Buffer.from(await Bun.file(this.vaultPath).arrayBuffer());

      // Parse file structure
      const nonceLength = vaultFile[0];
      const nonce = vaultFile.slice(1, 1 + nonceLength);
      const tagLength = vaultFile[1 + nonceLength];
      const tagStart = 2 + nonceLength;
      const tag = vaultFile.slice(tagStart, tagStart + tagLength);
      const encrypted = vaultFile.slice(tagStart + tagLength);

      // Decrypt and load
      this.vault = VaultEncryption.decrypt(encrypted, nonce, tag, this.masterSeed);
    } catch (error) {
      // If decryption fails, keep empty vault
      console.warn("Failed to load vault file, starting with empty vault");
      this.vault = this.initializeVault();
    }
  }

  /**
   * Auto-save vault (for convenience)
   */
  private async autoSave(): Promise<void> {
    await this.save();
  }

  /**
   * Calculate vault checksum
   */
  async calculateChecksum(): Promise<string> {
    // Create temporary vault data without checksum for calculation
    const dataForChecksum = {
      ...this.vault,
      metadata: {
        ...this.vault.metadata,
        checksum: ""
      }
    };

    const data = JSON.stringify(dataForChecksum);
    const hash = createHash("sha256").update(data).digest("hex");
    return hash;
  }

  /**
   * Validate vault integrity
   */
  async validateIntegrity(): Promise<boolean> {
    const expectedChecksum = await this.calculateChecksum();
    return this.vault.metadata.checksum === expectedChecksum;
  }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get vault data (for CLI display)
   */
  async getVault(): Promise<VaultData> {
    return this.vault;
  }

  /**
   * Sync vault to all storage backends
   */
  async sync(): Promise<void> {
    // Update timestamp and checksum
    this.vault.updated = new Date().toISOString();
    this.vault.metadata.checksum = await this.calculateChecksum();

    // Save locally first
    await this.save();

    // In a full implementation, this would sync to:
    // - Arweave via Bundlr
    // - Nostr relays
    // - IPFS
    
    // For now, just local storage
    this.vault.metadata.backups.ipfs = "local";
    
    console.log("Note: Arweave and Nostr sync require implementation");
  }

  /**
   * Recover vault from various sources
   */
  async recover(): Promise<VaultData> {
    // Try to load from local file first
    this.loadVault();
    return this.vault;
  }

  /**
   * Add SSH key configuration to vault
   */
  async addSSHKey(config: {
    hostname: string;
    publicKey: string;
    fingerprint: string;
  }): Promise<void> {
    const id = this.generateId();
    const now = new Date().toISOString();

    this.vault.config.services.ssh.push({
      id,
      hostname: config.hostname,
      publicKey: config.publicKey,
      fingerprint: config.fingerprint,
      created: now
    });

    this.vault.updated = now;
    await this.autoSave();
  }

  /**
   * Add wallet configuration to vault
   */
  async addWallet(config: {
    service: string;
    type: "bitcoin" | "ethereum" | "monero";
    xpub?: string;
    address?: string;
    path: string;
  }): Promise<void> {
    const id = this.generateId();

    this.vault.config.services.wallets.push({
      id,
      service: config.service,
      type: config.type,
      xpub: config.xpub,
      address: config.address,
      path: config.path
    });

    this.vault.updated = new Date().toISOString();
    await this.autoSave();
  }

  /**
   * Add GPG key configuration to vault
   */
  async addGPGKey(config: {
    keyId: string;
    fingerprint: string;
    userInfo: {
      name: string;
      email: string;
      comment?: string;
    };
    publicKey: string;
    service: string;
  }): Promise<void> {
    const id = this.generateId();

    this.vault.config.services.gpg.push({
      id,
      service: config.service,
      keyId: config.keyId,
      fingerprint: config.fingerprint,
      publicKey: config.publicKey,
      userInfo: config.userInfo,
      created: new Date().toISOString()
    });

    this.vault.updated = new Date().toISOString();
    await this.autoSave();
  }

  /**
   * Add TOTP configuration to vault
   */
  async addTOTP(config: {
    service: string;
    secret: string;
    algorithm?: "SHA1" | "SHA256" | "SHA512";
    digits?: 6 | 8;
    period?: 30 | 60;
  }): Promise<void> {
    const id = this.generateId();

    this.vault.config.services.totp.push({
      id,
      service: config.service,
      secret: config.secret, // This would be encrypted in production
      algorithm: config.algorithm || "SHA1",
      digits: config.digits || 6,
      period: config.period || 30
    });

    this.vault.updated = new Date().toISOString();
    await this.autoSave();
  }

  /**
   * Clear all vault data (for import replacement)
   */
  async clear(): Promise<void> {
    this.vault = this.initializeVault();
    await this.autoSave();
  }
}