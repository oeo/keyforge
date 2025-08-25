/**
 * Arweave permanent storage with Bitcoin payment integration
 * Uses Bundlr network for fast uploads paid with Bitcoin
 */

import { WalletGenerator } from "../generators/wallet";
import { createHash } from "node:crypto";

export interface PaymentInfo {
  bitcoin: {
    address: string;
    privateKey: string;
  };
  lightning: {
    nodeId: string;
    seed: string;
  };
}

export interface UploadCost {
  bytes: number;
  satoshis: number;
  usd: number;
  arPrice: number;
}

export interface Balance {
  confirmed: number;
  unconfirmed: number;
  total: number;
  address: string;
}

export interface UploadResult {
  success: boolean;
  txId?: string;
  error?: string;
  paymentRequired?: {
    amount: number;
    address: string;
    invoice?: string;
  };
}

export class ArweaveStorage {
  private masterSeed: Buffer;
  private paymentWallet: PaymentInfo;

  constructor(masterSeed: Buffer) {
    this.masterSeed = masterSeed;
    this.paymentWallet = WalletGenerator.generatePaymentWallet(masterSeed);
  }

  /**
   * Get payment wallet information
   */
  getPaymentInfo(): PaymentInfo {
    return this.paymentWallet;
  }

  /**
   * Calculate upload cost for data
   */
  async calculateCost(data: Buffer): Promise<UploadCost> {
    const bytes = data.length;
    
    // Mock cost calculation - in production this would query Bundlr API
    // Arweave cost is approximately $5/GB as of 2024
    const arPriceUSD = 25.5; // AR token price in USD
    const costPerByte = 5 / (1024 * 1024 * 1024); // $5 per GB
    const usd = bytes * costPerByte;
    const btcPriceUSD = 43000; // BTC price in USD
    const satoshis = Math.ceil((usd / btcPriceUSD) * 100000000);

    // Ensure minimum cost scaling with size
    const minSatoshis = 546 + Math.floor(bytes / 1000); // Base + per KB

    return {
      bytes,
      satoshis: Math.max(minSatoshis, satoshis),
      usd: Math.max(0.01, usd),
      arPrice: arPriceUSD
    };
  }

  /**
   * Check Bitcoin balance for payment wallet
   */
  async checkBalance(): Promise<Balance> {
    const address = this.paymentWallet.bitcoin.address;
    
    try {
      // Mock balance check - in production would query Bitcoin node/API
      // For testing, return zero balance
      return {
        confirmed: 0,
        unconfirmed: 0,
        total: 0,
        address
      };
    } catch (error) {
      return {
        confirmed: 0,
        unconfirmed: 0,
        total: 0,
        address
      };
    }
  }

  /**
   * Upload encrypted vault data to Arweave
   */
  async upload(
    encrypted: Buffer,
    nonce: Buffer,
    tag: Buffer
  ): Promise<UploadResult> {
    try {
      // Calculate cost
      const totalData = Buffer.concat([
        Buffer.from([nonce.length]),
        nonce,
        Buffer.from([tag.length]),
        tag,
        encrypted
      ]);
      
      const cost = await this.calculateCost(totalData);
      const balance = await this.checkBalance();

      // Check if we have sufficient funds
      if (balance.total < cost.satoshis) {
        const shortfall = cost.satoshis - balance.total;
        const invoice = await this.generateLightningInvoice(shortfall);
        
        return {
          success: false,
          error: `Insufficient funds. Need ${shortfall} more satoshis.`,
          paymentRequired: {
            amount: shortfall,
            address: this.paymentWallet.bitcoin.address,
            invoice
          }
        };
      }

      // Upload to Arweave
      const txId = await this.uploadToArweave(totalData);
      
      return {
        success: true,
        txId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Retrieve vault data from Arweave
   */
  async retrieve(txId?: string): Promise<{
    encrypted: Buffer;
    nonce: Buffer;
    tag: Buffer;
  }> {
    if (!txId) {
      txId = await this.findLatestVault();
    }

    const data = await this.retrieveFromArweave(txId);

    // Parse stored format
    const nonceLength = data[0];
    const nonce = data.slice(1, 1 + nonceLength);
    const tagLength = data[1 + nonceLength];
    const tagStart = 2 + nonceLength;
    const tag = data.slice(tagStart, tagStart + tagLength);
    const encrypted = data.slice(tagStart + tagLength);

    return { encrypted, nonce, tag };
  }

  /**
   * Wait for payment confirmation
   */
  async waitForPayment(targetAmount: number, timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const balance = await this.checkBalance();
      
      if (balance.total >= targetAmount) {
        return true;
      }

      // Wait 1 second before next check (configurable for testing)
      const checkInterval = process.env.NODE_ENV === 'test' ? 1000 : 5000;
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false; // Timeout
  }

  /**
   * Generate Lightning invoice for amount
   */
  async generateLightningInvoice(satoshis: number): Promise<string> {
    // Mock Lightning invoice generation
    // In production, this would connect to a Lightning node
    const nodeId = this.paymentWallet.lightning.nodeId;
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Create a realistic-looking mock invoice (proper length)
    const invoice = `lnbc${satoshis}n1p${timestamp}pp5${nodeId.slice(0, 30)}additional_data`;
    return invoice;
  }

  /**
   * Format payment request for display
   */
  formatPaymentRequest(cost: UploadCost): string {
    // Generate a mock lightning invoice sync for display
    const mockInvoice = `lnbc${cost.satoshis}n1p${Date.now()}pp5mock`;
    
    return `
╔════════════════════════════════════════════════════════╗
║                  FUNDING REQUIRED                       ║
╠════════════════════════════════════════════════════════╣
║                                                          ║
║  Send Bitcoin to fund Arweave storage:                  ║
║                                                          ║
║  Address: ${this.paymentWallet.bitcoin.address.padEnd(42)} ║
║  Amount:  ${cost.satoshis.toString().padEnd(10)} satoshis                 ║
║           (~$${cost.usd.toFixed(2).padEnd(8)})                           ║
║                                                          ║
║  Or pay with Lightning:                                 ║
║  ${mockInvoice.slice(0, 50)} ║
║                                                          ║
║  Waiting for payment...                                 ║
║                                                          ║
╚════════════════════════════════════════════════════════╝`;
  }

  /**
   * Validate Arweave transaction ID format
   */
  isValidTxId(txId: string): boolean {
    if (!txId || typeof txId !== 'string') return false;
    if (txId.length < 32 || txId.length > 45) return false; // Arweave TX IDs are typically 43 chars
    return /^[a-zA-Z0-9_-]+$/.test(txId);
  }

  /**
   * Upload data to Arweave (mock implementation)
   */
  async uploadToArweave(data: Buffer): Promise<string> {
    // Mock Arweave upload - in production would use Bundlr client
    const hash = createHash('sha256').update(data).digest('hex');
    return `mock_tx_${hash.slice(0, 16)}`;
  }

  /**
   * Retrieve data from Arweave (mock implementation)
   */
  async retrieveFromArweave(txId: string): Promise<Buffer> {
    if (!this.isValidTxId(txId)) {
      throw new Error('Invalid transaction ID');
    }
    
    // Mock retrieval - in production would fetch from Arweave
    throw new Error('No data found for transaction ID');
  }

  /**
   * Find latest vault transaction on Arweave
   */
  async findLatestVault(): Promise<string> {
    // Mock GraphQL query to find latest vault
    // In production would query Arweave GraphQL endpoint
    return 'mock_latest_vault_tx_id';
  }
}