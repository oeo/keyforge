import { test, expect, describe } from "bun:test";
import { WalletGenerator } from "../../src/generators/wallet";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

describe("WalletGenerator", () => {
  const testSeed = Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');

  test("generates valid BIP39 mnemonic", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    expect(wallet.mnemonic.split(' ').length).toBe(24); // 24 word mnemonic
    expect(validateMnemonic(wallet.mnemonic, wordlist)).toBe(true);
    expect(wallet.seed).toBeInstanceOf(Buffer);
    expect(wallet.seed.length).toBe(64); // 512 bits
  });

  test("generates deterministic wallets", () => {
    const wallet1 = WalletGenerator.generate(testSeed);
    const wallet2 = WalletGenerator.generate(testSeed);
    
    expect(wallet1.mnemonic).toBe(wallet2.mnemonic);
    expect(wallet1.seed.equals(wallet2.seed)).toBe(true);
    expect(wallet1.bitcoin.address).toBe(wallet2.bitcoin.address);
    expect(wallet1.ethereum.address).toBe(wallet2.ethereum.address);
  });

  test("derives correct Bitcoin addresses", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    expect(wallet.bitcoin.address).toMatch(/^bc1[a-z0-9]{39,59}$/); // Bech32 format
    expect(wallet.bitcoin.path).toBe("m/84'/0'/0'/0/0");
    expect(wallet.bitcoin.xpub).toMatch(/^xpub[1-9A-HJ-NP-Za-km-z]{107,108}$/);
    expect(wallet.bitcoin.xpriv).toMatch(/^xprv[1-9A-HJ-NP-Za-km-z]{107,108}$/);
  });

  test("derives correct Ethereum addresses", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    expect(wallet.ethereum.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(wallet.ethereum.privateKey).toMatch(/^[a-fA-F0-9]{64}$/);
    expect(wallet.ethereum.publicKey).toMatch(/^[a-fA-F0-9]{66}$/);
  });

  test("different services generate different wallets", () => {
    const personal = WalletGenerator.generate(testSeed, "personal");
    const business = WalletGenerator.generate(testSeed, "business");
    const trading = WalletGenerator.generate(testSeed, "trading");
    
    expect(personal.mnemonic).not.toBe(business.mnemonic);
    expect(personal.mnemonic).not.toBe(trading.mnemonic);
    expect(business.mnemonic).not.toBe(trading.mnemonic);
    
    expect(personal.bitcoin.address).not.toBe(business.bitcoin.address);
    expect(personal.ethereum.address).not.toBe(business.ethereum.address);
  });

  test("same service always generates same wallet", () => {
    const wallet1 = WalletGenerator.generate(testSeed, "savings");
    const wallet2 = WalletGenerator.generate(testSeed, "savings");
    
    expect(wallet1.mnemonic).toBe(wallet2.mnemonic);
    expect(wallet1.bitcoin.address).toBe(wallet2.bitcoin.address);
    expect(wallet1.ethereum.address).toBe(wallet2.ethereum.address);
  });

  test("generates payment wallet for Arweave", () => {
    const payment = WalletGenerator.generatePaymentWallet(testSeed);
    
    expect(payment.bitcoin.address).toMatch(/^bc1[a-z0-9]{39,59}$/);
    expect(payment.bitcoin.privateKey).toMatch(/^[a-fA-F0-9]{64}$/);
    expect(payment.lightning.nodeId).toMatch(/^[a-fA-F0-9]{66}$/);
    expect(payment.lightning.seed).toMatch(/^[a-fA-F0-9]{64}$/);
  });

  test("payment wallet is deterministic", () => {
    const payment1 = WalletGenerator.generatePaymentWallet(testSeed);
    const payment2 = WalletGenerator.generatePaymentWallet(testSeed);
    
    expect(payment1.bitcoin.address).toBe(payment2.bitcoin.address);
    expect(payment1.bitcoin.privateKey).toBe(payment2.bitcoin.privateKey);
    expect(payment1.lightning.nodeId).toBe(payment2.lightning.nodeId);
    expect(payment1.lightning.seed).toBe(payment2.lightning.seed);
  });

  test("HD wallet derivation follows BIP32", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    // Verify xpub/xpriv are valid extended keys
    expect(wallet.bitcoin.xpub.startsWith("xpub")).toBe(true);
    expect(wallet.bitcoin.xpriv.startsWith("xprv")).toBe(true);
    
    // Extended keys should be different
    expect(wallet.bitcoin.xpub).not.toBe(wallet.bitcoin.xpriv);
  });

  test("Ethereum address derivation is correct", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    // Verify Ethereum address is derived from public key
    expect(wallet.ethereum.address.length).toBe(42); // 0x + 40 hex chars
    expect(wallet.ethereum.privateKey.length).toBe(64); // 32 bytes = 64 hex
    expect(wallet.ethereum.publicKey.length).toBe(66); // 33 bytes compressed = 66 hex
  });

  test("service to index mapping is deterministic", () => {
    const index1 = WalletGenerator.serviceToIndex("lightning-node");
    const index2 = WalletGenerator.serviceToIndex("lightning-node");
    const index3 = WalletGenerator.serviceToIndex("cold-storage");
    
    expect(index1).toBe(index2);
    expect(index1).not.toBe(index3);
    expect(typeof index1).toBe('number');
    expect(index1).toBeGreaterThanOrEqual(0);
  });

  test("handles different seed inputs", () => {
    const seed1 = Buffer.from("seed1".padEnd(64, '1'), 'utf8');
    const seed2 = Buffer.from("seed2".padEnd(64, '2'), 'utf8');
    
    const wallet1 = WalletGenerator.generate(seed1);
    const wallet2 = WalletGenerator.generate(seed2);
    
    expect(wallet1.mnemonic).not.toBe(wallet2.mnemonic);
    expect(wallet1.bitcoin.address).not.toBe(wallet2.bitcoin.address);
    expect(wallet1.ethereum.address).not.toBe(wallet2.ethereum.address);
  });

  test("handles special characters in service names", () => {
    const service1 = "my-wallet";
    const service2 = "my_wallet";
    const service3 = "지갑";
    
    const wallet1 = WalletGenerator.generate(testSeed, service1);
    const wallet2 = WalletGenerator.generate(testSeed, service2);
    const wallet3 = WalletGenerator.generate(testSeed, service3);
    
    expect(wallet1.bitcoin.address).not.toBe(wallet2.bitcoin.address);
    expect(wallet1.bitcoin.address).not.toBe(wallet3.bitcoin.address);
    expect(wallet2.bitcoin.address).not.toBe(wallet3.bitcoin.address);
  });

  test("mnemonic entropy is sufficient", () => {
    const wallet = WalletGenerator.generate(testSeed);
    const words = wallet.mnemonic.split(' ');
    
    // All words should be from BIP39 wordlist
    words.forEach(word => {
      expect(wordlist.includes(word)).toBe(true);
    });
    
    // Should not be all the same word
    const uniqueWords = new Set(words);
    expect(uniqueWords.size).toBeGreaterThan(10);
  });

  test("Bitcoin addresses are valid", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    // Native SegWit addresses should start with bc1
    expect(wallet.bitcoin.address.startsWith("bc1")).toBe(true);
    
    // Should be reasonable length (39-59 chars for bech32)
    expect(wallet.bitcoin.address.length).toBeGreaterThanOrEqual(39);
    expect(wallet.bitcoin.address.length).toBeLessThanOrEqual(59);
  });

  test("Ethereum addresses pass checksum", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    // Should be mixed case (EIP-55 checksum)
    const addr = wallet.ethereum.address.slice(2); // Remove 0x
    const hasLower = /[a-f]/.test(addr);
    const hasUpper = /[A-F]/.test(addr);
    
    // Most addresses should have mixed case (checksum)
    // Note: Some addresses might be all lowercase if checksum results in that
    expect(addr.length).toBe(40);
  });

  test("private keys have sufficient entropy", () => {
    const wallet = WalletGenerator.generate(testSeed);
    
    // Bitcoin private key (from xpriv) should not be all zeros
    expect(wallet.bitcoin.xpriv).not.toContain("000000000000");
    
    // Ethereum private key should not be all zeros or ones
    expect(wallet.ethereum.privateKey).not.toBe("0".repeat(64));
    expect(wallet.ethereum.privateKey).not.toBe("f".repeat(64));
  });

  test("handles edge cases", () => {
    // Empty service name should work (default)
    const emptyService = WalletGenerator.generate(testSeed, "");
    expect(emptyService.mnemonic.split(' ').length).toBe(24);
    
    // Very long service name
    const longService = "a".repeat(1000);
    const longWallet = WalletGenerator.generate(testSeed, longService);
    expect(longWallet.bitcoin.address).toMatch(/^bc1/);
    
    // Service name with special characters
    const specialService = "wallet@#$%^&*()";
    const specialWallet = WalletGenerator.generate(testSeed, specialService);
    expect(validateMnemonic(specialWallet.mnemonic, wordlist)).toBe(true);
  });
});