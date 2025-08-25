/**
 * Session management for CLI operations
 * Handles master seed derivation and caching with timeout
 */

import { MasterDerivation } from "../core/derivation";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class SessionManager {
  private static masterSeed?: Buffer;
  private static sessionTimeout?: NodeJS.Timeout;
  private static readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached master seed or return null if no session
   */
  static async getMasterSeed(): Promise<Buffer | null> {
    if (this.masterSeed) {
      this.resetTimeout();
      return this.masterSeed;
    }

    return null;
  }

  /**
   * Initialize session with passphrase
   */
  static async initialize(passphrase?: string, username?: string): Promise<Buffer> {
    if (!passphrase) {
      passphrase = await this.promptPassphrase();
    }

    console.log("Deriving master seed...");
    
    const masterSeed = await MasterDerivation.deriveMasterSeed({
      passphrase,
      username: username || "keyforge",
      version: 1
    });

    this.masterSeed = masterSeed;
    this.resetTimeout();

    return masterSeed;
  }

  /**
   * Clear session data securely
   */
  static clear(): void {
    if (this.masterSeed) {
      // Overwrite memory with random data then zeros
      try {
        crypto.getRandomValues(this.masterSeed);
        this.masterSeed.fill(0);
      } catch {
        // Fallback if crypto not available
        this.masterSeed.fill(0);
      }
      this.masterSeed = undefined;
    }

    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = undefined;
    }
  }

  /**
   * Prompt user for passphrase with hidden input
   */
  private static async promptPassphrase(): Promise<string> {
    // In test environment, return a default passphrase
    if (process.env.NODE_ENV === 'test') {
      return "test passphrase";
    }

    output.write("Master passphrase: ");

    // Check if setRawMode is available (not in all environments)
    const oldRawMode = input.isRaw;
    const hasRawMode = typeof input.setRawMode === 'function';
    
    if (hasRawMode) {
      input.setRawMode(true);
    }

    let passphrase = "";

    return new Promise((resolve) => {
      const onData = (char: Buffer) => {
        const c = char.toString();

        switch (c) {
          case "\n":
          case "\r":
          case "\u0004": // Ctrl-D
            if (hasRawMode) {
              input.setRawMode(oldRawMode);
            }
            input.removeAllListeners("data");
            output.write("\n");
            resolve(passphrase);
            break;

          case "\u0003": // Ctrl-C
            if (hasRawMode) {
              input.setRawMode(oldRawMode);
            }
            input.removeAllListeners("data");
            output.write("\n");
            process.exit(130);
            break;

          case "\u007f": // Backspace
            if (passphrase.length > 0) {
              passphrase = passphrase.slice(0, -1);
              if (hasRawMode) {
                output.write("\b \b");
              }
            }
            break;

          default:
            if (c.charCodeAt(0) >= 32) { // Printable characters
              passphrase += c;
              if (hasRawMode) {
                output.write("*");
              }
            }
            break;
        }
      };

      input.on("data", onData);
    });
  }

  /**
   * Reset session timeout
   */
  private static resetTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }

    this.sessionTimeout = setTimeout(() => {
      console.log("\n⚠ Session expired");
      this.clear();
    }, this.TIMEOUT_MS);
  }
}

// Clean up on process exit
process.on("exit", () => {
  SessionManager.clear();
});

process.on("SIGINT", () => {
  SessionManager.clear();
  process.exit(130);
});

process.on("SIGTERM", () => {
  SessionManager.clear();
  process.exit(143);
});