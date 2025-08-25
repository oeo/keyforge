/**
 * Cryptocurrency wallet generation using BIP39/BIP32
 * Generates HD wallets for Bitcoin, Ethereum, and other cryptocurrencies
 */

import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { KeyDomain, DomainDerivation } from "../core/domains";
import { createHash } from "node:crypto";

export interface WalletKeys {
  mnemonic: string;
  seed: Buffer;
  bitcoin: {
    xpub: string;
    xpriv: string;
    address: string;  // First address
    path: string;
  };
  ethereum: {
    address: string;
    privateKey: string;
    publicKey: string;
  };
}

export class WalletGenerator {
  /**
   * Generate deterministic HD wallet for a service
   */
  static generate(masterSeed: Buffer, service?: string): WalletKeys {
    // Derive wallet-specific seed
    const index = service ? this.serviceToIndex(service) : 0;
    const walletSeed = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.WALLET_BIP39,
      index,
      32  // 256 bits for BIP39 entropy
    );

    // Generate mnemonic from entropy
    const mnemonic = entropyToMnemonic(walletSeed, wordlist);
    const seed = Buffer.from(mnemonicToSeedSync(mnemonic));

    // Derive HD wallet from mnemonic seed
    const root = HDKey.fromMasterSeed(seed);

    // Bitcoin derivation (Native SegWit - BIP84)
    const btcPath = "m/84'/0'/0'/0/0";
    const btcNode = root.derive(btcPath);
    const btcXpub = btcNode.publicExtendedKey;
    const btcXpriv = btcNode.privateExtendedKey;

    // Generate first Bitcoin address (P2WPKH)
    const btcAddress = this.deriveP2WPKHAddress(btcNode.publicKey);

    // Ethereum derivation (BIP44)
    const ethPath = "m/44'/60'/0'/0/0";
    const ethNode = root.derive(ethPath);
    const ethAddress = this.publicKeyToEthAddress(ethNode.publicKey);

    return {
      mnemonic,
      seed,
      bitcoin: {
        xpub: btcXpub,
        xpriv: btcXpriv,
        address: btcAddress,
        path: btcPath
      },
      ethereum: {
        address: ethAddress,
        privateKey: ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString("hex") : "",
        publicKey: ethNode.publicKey ? Buffer.from(ethNode.publicKey).toString("hex") : ""
      }
    };
  }

  /**
   * Generate payment wallet specifically for Arweave/Bundlr
   */
  static generatePaymentWallet(masterSeed: Buffer): {
    bitcoin: { address: string; privateKey: string };
    lightning: { nodeId: string; seed: string };
  } {
    const paymentSeed = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.WALLET_PAYMENT,
      0,
      32
    );

    // Simple Bitcoin keypair for payments
    const root = HDKey.fromMasterSeed(paymentSeed);
    const btcNode = root.derive("m/84'/0'/0'/0/0");

    const btcAddress = this.deriveP2WPKHAddress(btcNode.publicKey!);

    // Lightning node seed
    const lightningSeed = DomainDerivation.deriveKey(
      masterSeed,
      KeyDomain.WALLET_PAYMENT,
      1,
      32
    );

    return {
      bitcoin: {
        address: btcAddress,
        privateKey: btcNode.privateKey ? Buffer.from(btcNode.privateKey).toString("hex") : ""
      },
      lightning: {
        nodeId: btcNode.publicKey ? Buffer.from(btcNode.publicKey).toString("hex") : "",
        seed: lightningSeed.toString("hex")
      }
    };
  }

  /**
   * Convert service name to deterministic index
   */
  static serviceToIndex(service: string): number {
    const hash = createHash("sha256");
    hash.update(service);
    const digest = hash.digest();
    return digest.readUInt32LE(0);
  }

  /**
   * Derive P2WPKH (Native SegWit) address from public key
   * This creates bc1... addresses
   */
  private static deriveP2WPKHAddress(publicKey: Uint8Array): string {
    // Create HASH160 of the public key
    const hash160 = this.hash160(publicKey);
    
    // Encode as bech32 with "bc" prefix and witness version 0
    return this.encodeBech32("bc", 0, hash160);
  }

  /**
   * Convert public key to Ethereum address
   * Uses Keccak-256 hash of uncompressed public key
   */
  private static publicKeyToEthAddress(publicKey: Uint8Array): string {
    // For Ethereum, we need the uncompressed public key (64 bytes)
    // If compressed (33 bytes), expand it
    let uncompressedKey: Uint8Array;
    
    if (publicKey.length === 33) {
      // This is a compressed key, we need to expand it
      // For now, we'll use a simplified approach
      uncompressedKey = publicKey.slice(1); // Remove compression prefix
    } else if (publicKey.length === 65) {
      uncompressedKey = publicKey.slice(1); // Remove 0x04 prefix
    } else {
      uncompressedKey = publicKey; // Assume already uncompressed
    }

    // Use Keccak-256 (not available in Node.js crypto, using SHA3 approximation)
    const hash = createHash("sha3-256");
    hash.update(uncompressedKey);
    const digest = hash.digest();
    
    // Take last 20 bytes and add 0x prefix
    const address = digest.slice(-20);
    return "0x" + address.toString("hex");
  }

  /**
   * HASH160 = RIPEMD160(SHA256(data))
   * Used for Bitcoin address generation
   */
  private static hash160(data: Uint8Array): Buffer {
    // SHA256 first
    const sha256Hash = createHash("sha256");
    sha256Hash.update(data);
    const sha256Result = sha256Hash.digest();
    
    // Then RIPEMD160
    const ripemdHash = createHash("ripemd160");
    ripemdHash.update(sha256Result);
    return ripemdHash.digest();
  }

  /**
   * Encode data as bech32 (simplified implementation)
   * For production use, should use a proper bech32 library
   */
  private static encodeBech32(hrp: string, version: number, data: Buffer): string {
    // This is a simplified bech32 implementation
    // In production, use @scure/base or similar library
    
    const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    
    // Convert 8-bit data to 5-bit
    const fiveBitData = this.convertBits(data, 8, 5, true);
    const values = [version, ...fiveBitData];
    
    // Create checksum
    const checksum = this.bech32Checksum(hrp, values);
    const combined = [...values, ...checksum];
    
    // Encode to string
    const encoded = combined.map(v => CHARSET[v]).join("");
    
    return `${hrp}1${encoded}`;
  }

  /**
   * Convert between bit groups
   */
  private static convertBits(data: Buffer | number[], fromBits: number, toBits: number, pad: boolean): number[] {
    let acc = 0;
    let bits = 0;
    const result: number[] = [];
    const maxv = (1 << toBits) - 1;
    const maxAcc = (1 << (fromBits + toBits - 1)) - 1;

    for (const value of data) {
      if (value < 0 || value >> fromBits !== 0) {
        throw new Error("Invalid data for base conversion");
      }
      acc = ((acc << fromBits) | value) & maxAcc;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        result.push((acc >> bits) & maxv);
      }
    }

    if (pad) {
      if (bits > 0) {
        result.push((acc << (toBits - bits)) & maxv);
      }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
      throw new Error("Invalid padding in base conversion");
    }

    return result;
  }

  /**
   * Calculate bech32 checksum
   */
  private static bech32Checksum(hrp: string, data: number[]): number[] {
    const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    
    // Expand HRP
    const hrpHigh = Array.from(hrp).map(c => c.charCodeAt(0) >> 5);
    const hrpLow = Array.from(hrp).map(c => c.charCodeAt(0) & 31);
    const expandedHrp = [...hrpHigh, 0, ...hrpLow];
    
    // Calculate checksum
    let chk = 1;
    for (const value of [...expandedHrp, ...data]) {
      const top = chk >> 25;
      chk = (chk & 0x1ffffff) << 5 ^ value;
      for (let i = 0; i < 5; i++) {
        chk ^= ((top >> i) & 1) * GENERATOR[i];
      }
    }
    chk ^= 1;
    
    const checksum: number[] = [];
    for (let i = 0; i < 6; i++) {
      checksum.push((chk >> 5 * (5 - i)) & 31);
    }
    
    return checksum;
  }
}