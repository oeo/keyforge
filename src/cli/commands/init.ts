/**
 * CLI command for initializing Keyforge with master passphrase
 * Sets up session and displays useful information
 */

import { SessionManager } from "../session";
import { WalletGenerator } from "../../generators/wallet";
import { ConfigManager } from "../../core/config";
import chalk from "chalk";

interface InitOptions {
  passphrase?: string;
  username?: string;
  showVersion?: boolean;
}

export class InitCommand {
  /**
   * Execute init command
   */
  static async execute(options: InitOptions): Promise<void> {
    try {
      // Show version if requested
      if (options.showVersion) {
        this.showVersion();
      }

      // Check if reinitializing
      const existingSession = await SessionManager.getMasterSeed();
      if (existingSession) {
        console.log(chalk.yellow("Reinitializing Keyforge session..."));
      }

      // Validate passphrase strength
      if (options.passphrase && this.isWeakPassphrase(options.passphrase)) {
        console.log(chalk.yellow("⚠ Warning: Short passphrase detected"));
        console.log(chalk.yellow("Consider using a longer passphrase for better security"));
      }

      // Use config defaults if options not provided
      const config = ConfigManager.getInstance();
      const mergedOptions = config.mergeWithArgs(options);

      // Initialize session
      const masterSeed = await SessionManager.initialize(
        mergedOptions.passphrase,
        mergedOptions.username
      );

      console.log(chalk.green("✓ Keyforge initialized successfully"));

      // Generate payment wallet info
      const paymentWallet = WalletGenerator.generatePaymentWallet(masterSeed);
      
      console.log(chalk.cyan("\nBitcoin payment address:"));
      console.log(chalk.bold(paymentWallet.bitcoin.address));
      console.log(chalk.gray("Fund this address to enable Arweave storage"));

      // Show storage cost estimate
      this.showStorageEstimate();

      // Show security recommendations
      this.showSecurityRecommendations();

      // Show usage examples
      this.showUsageExamples();

    } catch (error) {
      console.error(chalk.red("Failed to initialize Keyforge:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  /**
   * Show version information
   */
  private static showVersion(): void {
    // In a real implementation, this would read from package.json
    const version = "1.0.0"; 
    console.log(chalk.bold(`Keyforge v${version}`));
    console.log("Deterministic key derivation system");
    console.log();
  }

  /**
   * Check if passphrase is weak
   */
  private static isWeakPassphrase(passphrase: string): boolean {
    return passphrase.length < 12;
  }

  /**
   * Show storage cost estimates
   */
  private static showStorageEstimate(): void {
    console.log(chalk.cyan("\nVault storage estimate:"));
    console.log("~$0.01-0.05 for typical vault sizes");
    console.log("Permanent storage on Arweave blockchain");
  }

  /**
   * Show security recommendations
   */
  private static showSecurityRecommendations(): void {
    console.log(chalk.cyan("\nSecurity recommendations:"));
    console.log("• Use a strong, unique passphrase");
    console.log("• Consider using Tor for enhanced privacy");
    console.log("• Regular vault backups are automatic");
    console.log("• Never share your master passphrase");
  }

  /**
   * Show usage examples
   */
  private static showUsageExamples(): void {
    console.log(chalk.cyan("\nReady! Try these commands:"));
    console.log(chalk.gray("# Generate SSH key for GitHub"));
    console.log("keyforge generate ssh github.com");
    console.log();
    console.log(chalk.gray("# Generate Bitcoin wallet"));
    console.log("keyforge generate bitcoin");
    console.log();
    console.log(chalk.gray("# Access your vault"));
    console.log("keyforge vault");
    console.log();
  }
}