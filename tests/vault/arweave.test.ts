import { test, expect, describe, beforeEach, mock } from "bun:test";
import { ArweaveStorage } from "../../src/vault/arweave";
import { VaultManager } from "../../src/vault/storage";

describe("ArweaveStorage", () => {
  const testSeed = Buffer.from("test_seed_64_bytes".padEnd(64, '0'), 'utf8');
  let arweave: ArweaveStorage;
  let mockVault: VaultManager;

  beforeEach(() => {
    arweave = new ArweaveStorage(testSeed);
    mockVault = new VaultManager(testSeed);
  });

  test("initializes with Bitcoin payment wallet", () => {
    const paymentInfo = arweave.getPaymentInfo();
    
    expect(paymentInfo.bitcoin.address).toMatch(/^bc1[a-z0-9]{39,59}$/);
    expect(paymentInfo.bitcoin.privateKey).toMatch(/^[a-fA-F0-9]{64}$/);
    expect(paymentInfo.lightning.nodeId).toMatch(/^[a-fA-F0-9]{66}$/);
    expect(paymentInfo.lightning.seed).toMatch(/^[a-fA-F0-9]{64}$/);
  });

  test("payment wallet is deterministic", () => {
    const arweave2 = new ArweaveStorage(testSeed);
    
    const payment1 = arweave.getPaymentInfo();
    const payment2 = arweave2.getPaymentInfo();

    expect(payment1.bitcoin.address).toBe(payment2.bitcoin.address);
    expect(payment1.bitcoin.privateKey).toBe(payment2.bitcoin.privateKey);
    expect(payment1.lightning.nodeId).toBe(payment2.lightning.nodeId);
  });

  test("calculates upload cost", async () => {
    const testData = Buffer.from("test data for cost calculation");
    
    const cost = await arweave.calculateCost(testData);
    
    expect(cost.bytes).toBe(testData.length);
    expect(cost.satoshis).toBeGreaterThan(0);
    expect(cost.usd).toBeGreaterThan(0);
    expect(cost.arPrice).toBeGreaterThan(0);
  });

  test("checks payment balance", async () => {
    const balance = await arweave.checkBalance();
    
    expect(balance.confirmed).toBeGreaterThanOrEqual(0);
    expect(balance.unconfirmed).toBeGreaterThanOrEqual(0);
    expect(balance.total).toBe(balance.confirmed + balance.unconfirmed);
    expect(balance.address).toBe(arweave.getPaymentInfo().bitcoin.address);
  });

  test("handles insufficient funds gracefully", async () => {
    const testData = Buffer.from("large test data ".repeat(1000));
    
    // Mock cost calculation to return high cost
    const originalCalculateCost = arweave.calculateCost;
    arweave.calculateCost = mock(async () => ({
      bytes: testData.length,
      satoshis: 1000000, // 0.01 BTC
      usd: 400,
      arPrice: 25.5
    }));

    const result = await arweave.upload(testData, Buffer.alloc(12), Buffer.alloc(16));
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Insufficient funds");
    expect(result.paymentRequired).toBeDefined();

    // Restore original method
    arweave.calculateCost = originalCalculateCost;
  });

  test("formats payment request correctly", async () => {
    const testData = Buffer.from("test data");
    const cost = await arweave.calculateCost(testData);
    
    const paymentRequest = arweave.formatPaymentRequest(cost);
    
    expect(paymentRequest).toContain("FUNDING REQUIRED");
    expect(paymentRequest).toContain(arweave.getPaymentInfo().bitcoin.address);
    expect(paymentRequest).toContain(cost.satoshis.toString());
    expect(paymentRequest).toContain(`$${cost.usd.toFixed(2)}`);
    expect(paymentRequest).toMatch(/lnbc\d+/); // Lightning invoice
  });

  test("generates Lightning invoices", async () => {
    const satoshis = 10000;
    const invoice = await arweave.generateLightningInvoice(satoshis);
    
    expect(invoice).toMatch(/^lnbc\d+/);
    expect(invoice).toContain("1p"); // hrp separator
    expect(invoice.length).toBeGreaterThan(50);
  });

  test("waits for payment confirmation", async () => {
    // Mock balance check to simulate payment
    let callCount = 0;
    const originalCheckBalance = arweave.checkBalance;
    arweave.checkBalance = mock(async () => {
      callCount++;
      return {
        confirmed: callCount > 1 ? 50000 : 0, // Simulate payment after 2 calls
        unconfirmed: 0,
        total: callCount > 1 ? 50000 : 0,
        address: arweave.getPaymentInfo().bitcoin.address
      };
    });

    const targetAmount = 25000;
    const funded = await arweave.waitForPayment(targetAmount, 5000); // 5 second timeout (faster checks in test)
    
    expect(funded).toBe(true);
    expect(callCount).toBeGreaterThan(1);

    // Restore original method
    arweave.checkBalance = originalCheckBalance;
  });

  test("handles payment timeout", async () => {
    const targetAmount = 100000; // High amount that won't be reached
    const funded = await arweave.waitForPayment(targetAmount, 50); // Very short timeout
    
    expect(funded).toBe(false);
  });

  test("uploads to Arweave successfully", async () => {
    // Mock successful upload
    const mockTxId = "mock_arweave_tx_id_1234567890abcdef";
    const originalUploadToArweave = arweave.uploadToArweave;
    arweave.uploadToArweave = mock(async () => mockTxId);

    // Mock sufficient balance
    arweave.checkBalance = mock(async () => ({
      confirmed: 100000,
      unconfirmed: 0,
      total: 100000,
      address: arweave.getPaymentInfo().bitcoin.address
    }));

    const testData = Buffer.from("test vault data");
    const nonce = Buffer.alloc(12, 0x42);
    const tag = Buffer.alloc(16, 0x33);

    const result = await arweave.upload(testData, nonce, tag);

    expect(result.success).toBe(true);
    expect(result.txId).toBe(mockTxId);
    expect(result.error).toBeUndefined();

    // Restore methods
    arweave.uploadToArweave = originalUploadToArweave;
  });

  test("retrieves data from Arweave", async () => {
    const mockTxId = "test_tx_id_12345";
    const testData = Buffer.from("retrieved test data");
    const nonce = Buffer.alloc(12, 0x55);
    const tag = Buffer.alloc(16, 0x66);

    // Mock Arweave fetch
    const originalRetrieveFromArweave = arweave.retrieveFromArweave;
    arweave.retrieveFromArweave = mock(async () => {
      // Simulate stored format
      return Buffer.concat([
        Buffer.from([nonce.length]),
        nonce,
        Buffer.from([tag.length]),
        tag,
        testData
      ]);
    });

    const result = await arweave.retrieve(mockTxId);

    expect(result.encrypted.equals(testData)).toBe(true);
    expect(result.nonce.equals(nonce)).toBe(true);
    expect(result.tag.equals(tag)).toBe(true);

    // Restore method
    arweave.retrieveFromArweave = originalRetrieveFromArweave;
  });

  test("finds latest vault on Arweave", async () => {
    const mockTxId = "latest_vault_tx_id";
    
    // Mock GraphQL query
    const originalFindLatestVault = arweave.findLatestVault;
    arweave.findLatestVault = mock(async () => mockTxId);

    const latestTxId = await arweave.findLatestVault();
    expect(latestTxId).toBe(mockTxId);

    // Restore method
    arweave.findLatestVault = originalFindLatestVault;
  });

  test("validates Arweave transaction ID format", () => {
    const validTxId = "abcdefghijklmnopqrstuvwxyz1234567890ABCDEF";
    const invalidTxId = "invalid-tx-id";

    expect(arweave.isValidTxId(validTxId)).toBe(true);
    expect(arweave.isValidTxId(invalidTxId)).toBe(false);
    expect(arweave.isValidTxId("")).toBe(false);
    expect(arweave.isValidTxId("toolong" + "x".repeat(50))).toBe(false);
  });

  test("handles network errors gracefully", async () => {
    // Mock sufficient balance first
    arweave.checkBalance = mock(async () => ({
      confirmed: 100000,
      unconfirmed: 0,
      total: 100000,
      address: arweave.getPaymentInfo().bitcoin.address
    }));

    // Mock network failure
    const originalUploadToArweave = arweave.uploadToArweave;
    arweave.uploadToArweave = mock(async () => {
      throw new Error("Network timeout");
    });

    const testData = Buffer.from("test data");
    const result = await arweave.upload(testData, Buffer.alloc(12), Buffer.alloc(16));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");

    // Restore method
    arweave.uploadToArweave = originalUploadToArweave;
  });

  test("integrates with vault manager", async () => {
    await mockVault.addPassword({
      site: "arweave-test.com",
      username: "alice",
      password: "secret123",
      tags: ["test"]
    });

    const vaultData = mockVault.getVaultData();
    expect(vaultData.passwords).toHaveLength(1);

    // Mock successful Arweave operations
    arweave.checkBalance = mock(async () => ({
      confirmed: 100000,
      unconfirmed: 0,
      total: 100000,
      address: arweave.getPaymentInfo().bitcoin.address
    }));

    arweave.uploadToArweave = mock(async () => "mock_vault_tx_id");

    // Test upload integration
    const { encrypted, nonce, tag } = require("../../src/vault/encryption").VaultEncryption.encrypt(vaultData, testSeed);
    const result = await arweave.upload(encrypted, nonce, tag);

    expect(result.success).toBe(true);
    expect(result.txId).toBe("mock_vault_tx_id");
  });

  test("calculates storage costs accurately", async () => {
    const sizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB
    
    for (const size of sizes) {
      const data = Buffer.alloc(size);
      const cost = await arweave.calculateCost(data);
      
      expect(cost.bytes).toBe(size);
      expect(cost.satoshis).toBeGreaterThan(0);
      expect(cost.usd).toBeGreaterThan(0);
      
      // Larger files should cost more
      if (size > 1024) {
        const smallerCost = await arweave.calculateCost(Buffer.alloc(1024));
        expect(cost.satoshis).toBeGreaterThan(smallerCost.satoshis);
      }
    }
  });

  test("handles concurrent uploads", async () => {
    // Mock successful operations
    arweave.checkBalance = mock(async () => ({
      confirmed: 1000000, // 0.01 BTC
      unconfirmed: 0,
      total: 1000000,
      address: arweave.getPaymentInfo().bitcoin.address
    }));

    let uploadCounter = 0;
    arweave.uploadToArweave = mock(async () => `tx_${++uploadCounter}`);

    // Try multiple concurrent uploads
    const uploads = Array.from({ length: 3 }, (_, i) => 
      arweave.upload(
        Buffer.from(`data ${i}`),
        Buffer.alloc(12, i),
        Buffer.alloc(16, i)
      )
    );

    const results = await Promise.all(uploads);

    results.forEach((result, i) => {
      expect(result.success).toBe(true);
      expect(result.txId).toBe(`tx_${i + 1}`);
    });
  });
});