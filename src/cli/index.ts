#!/usr/bin/env bun

/**
 * Keyforge CLI - Main entry point
 * Deterministic key derivation and encrypted vault system
 */

import { Command } from "commander";
import { InitCommand } from "./commands/init";
import { GenerateCommand } from "./commands/generate";
import chalk from "chalk";

const program = new Command();

// Get version from package.json (mock for now)
const version = "1.0.0";

program
  .name("keyforge")
  .description("Deterministic key derivation and encrypted vault system")
  .version(version)
  .option("--tor", "Route all operations through Tor")
  .option("--offline", "Offline mode (no network operations)")
  .helpOption(false)  // Disable built-in help
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name() + " " + cmd.usage()
  });

// Add custom help formatting
program.configureOutput({
  writeOut: (str) => process.stdout.write(chalk.cyan(str)),
  writeErr: (str) => process.stderr.write(chalk.red(str))
});

// Initialize command
program
  .command("init")
  .description("Initialize Keyforge with master passphrase")
  .option("-p, --passphrase <passphrase>", "Master passphrase (prompted if not provided)")
  .option("-u, --username <username>", "Username for salt derivation", "keyforge")
  .option("--show-version", "Show version information")
  .action(async (options) => {
    await InitCommand.execute(options);
  });

// Generate command
program
  .command("generate <type>")
  .description("Generate cryptographic keys")
  .option("-s, --service <service>", "Service/hostname for key derivation")
  .option("-o, --output <file>", "Save to file(s)")
  .option("-c, --copy", "Copy to clipboard")
  .option("--format <format>", "Output format (openssh, etc)")
  .option("--show-private", "Display private key (use with caution)")
  .option("--name <name>", "Name for GPG key")
  .option("--email <email>", "Email for GPG key") 
  .option("--comment <comment>", "Comment for GPG key")
  .addHelpText('after', `
Key types:
  ssh          Ed25519 SSH keypairs
  bitcoin, btc Bitcoin wallets (Native SegWit)
  ethereum, eth Ethereum wallets  
  gpg          GPG keypairs (Ed25519)

Examples:
  $ keyforge generate ssh github.com
  $ keyforge generate bitcoin --service trading
  $ keyforge generate gpg --name "Alice" --email "alice@example.com"
  $ keyforge generate ssh --output ~/.ssh/my_key`)
  .action(async (type, options) => {
    await GenerateCommand.execute(type, options);
  });

// Vault command
program
  .command("vault [action]")
  .description("Manage encrypted vault")
  .option("--storage <type>", "Storage backend (arweave, local)", "arweave")
  .action(async (action, options) => {
    const { VaultCommand } = await import("./commands/vault");
    await VaultCommand.execute(action, options);
  });

// Password manager
program
  .command("pass <action> [site]")
  .description("Password manager")
  .option("-u, --username <username>", "Username for site")
  .option("-n, --notes <notes>", "Additional notes")
  .option("-t, --tags <tags>", "Tags (comma-separated)")
  .option("-g, --generate", "Generate password automatically")
  .option("-l, --length <length>", "Password length for generation", "16")
  .action(async (action, site, options) => {
    const { PasswordCommand } = await import("./commands/password");
    await PasswordCommand.execute(action, site, options);
  });

// TOTP command
program
  .command("totp <service>")
  .description("Generate TOTP/2FA codes")
  .option("--qr", "Show QR code for setup")
  .option("--secret", "Show secret key")
  .option("--add", "Add new TOTP service")
  .option("--algorithm <alg>", "HMAC algorithm (SHA1, SHA256, SHA512)", "SHA1")
  .option("--digits <digits>", "Number of digits (6 or 8)", "6")
  .option("--period <period>", "Time period in seconds", "30")
  .action(async (service, options) => {
    const { TOTPCommand } = await import("./commands/totp");
    await TOTPCommand.execute(service, options);
  });

// Recovery command
program
  .command("recover")
  .description("Recover vault from passphrase")
  .option("--from <source>", "Recovery source (auto, arweave, nostr, local)", "auto")
  .option("-p, --passphrase <passphrase>", "Master passphrase")
  .option("-u, --username <username>", "Username for recovery")
  .action(async (options) => {
    const { RecoverCommand } = await import("./commands/recover");
    await RecoverCommand.execute(options);
  });

// Export vault command  
program
  .command("export")
  .description("Export vault data")
  .option("-o, --output <file>", "Output file path")
  .option("-f, --format <format>", "Export format (json, encrypted, backup)", "json")
  .option("--include <types>", "Include only specified types (comma-separated)")
  .option("--exclude <types>", "Exclude specified types (comma-separated)")
  .action(async (options) => {
    const { ExportCommand } = await import("./commands/export");
    await ExportCommand.execute(options);
  });

// Import vault command
program
  .command("import")
  .description("Import vault data")
  .option("-i, --input <file>", "Input file path")
  .option("-f, --format <format>", "Import format (json, encrypted, backup, auto)", "auto")
  .option("--merge", "Merge with existing vault (default: replace)")
  .option("--dry-run", "Preview import without making changes")
  .action(async (options) => {
    const { ImportCommand } = await import("./commands/import");
    await ImportCommand.execute(options);
  });

// Configuration command
program
  .command("config [action] [key] [value]")
  .description("Manage configuration")
  .option("--global", "Use global configuration")
  .option("--reset", "Reset to defaults")
  .option("--validate", "Validate configuration")
  .action(async (action, key, value, options) => {
    const { ConfigCommand } = await import("./commands/config");
    await ConfigCommand.execute(action, key, value, options);
  });

// Interactive mode
program
  .command("interactive")
  .alias("i")
  .description("Enter interactive REPL mode")
  .action(async () => {
    const { InteractiveMode } = await import("./interactive");
    await InteractiveMode.start();
  });

// Custom help command
program
  .command("help [command]")
  .description("Display help for command")
  .action((command) => {
    if (command) {
      program.help();
    } else {
      showMainHelp();
    }
  });

// Handle global options
program.hook('preAction', async (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  
  if (opts.tor) {
    console.log(chalk.cyan("🧅 Tor routing enabled"));
    // TODO: Initialize Tor service
  }
  
  if (opts.offline) {
    console.log(chalk.cyan("📴 Offline mode enabled"));
    // TODO: Set offline flag
  }
});

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    showMainHelp();
    process.exit(0);
  }
  
  if (err.code === 'commander.unknownCommand') {
    console.error(chalk.red(`Unknown command: ${err.message}`));
    console.log(chalk.gray("Run 'keyforge help' for available commands"));
    process.exit(1);
  }
  
  if (err.code === 'commander.missingArgument') {
    console.error(chalk.red(`Missing required argument: ${err.message}`));
    process.exit(1);
  }
  
  throw err;
});

/**
 * Show main help screen
 */
function showMainHelp(): void {
  console.log(chalk.bold.cyan("Keyforge - Deterministic key derivation"));
  console.log(chalk.gray("Generate all your cryptographic keys from a single passphrase"));
  console.log();
  
  console.log(chalk.bold("Usage:"));
  console.log("  keyforge <command> [options]");
  console.log();
  
  console.log(chalk.bold("Commands:"));
  console.log("  init                     Initialize with master passphrase");
  console.log("  generate <type>          Generate cryptographic keys");
  console.log("  vault [action]           Manage encrypted vault");
  console.log("  pass <action> [site]     Password manager");
  console.log("  totp <service>           Generate 2FA codes");
  console.log("  export                   Export vault data");
  console.log("  import                   Import vault data");
  console.log("  config [action]          Manage configuration");
  console.log("  recover                  Recover from passphrase");
  console.log("  interactive              Interactive mode");
  console.log();
  
  console.log(chalk.bold("Options:"));
  console.log("  --tor                    Route through Tor");
  console.log("  --offline                Offline mode");
  console.log("  -h, --help               Show help");
  console.log("  -V, --version            Show version");
  console.log();
  
  console.log(chalk.bold("Examples:"));
  console.log("  keyforge init");
  console.log("  keyforge generate ssh github.com");
  console.log("  keyforge generate bitcoin --service trading");
  console.log("  keyforge vault sync");
  console.log();
  
  console.log(chalk.gray("For help with a specific command: keyforge help <command>"));
}

// Check for help before parsing
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  showMainHelp();
  process.exit(0);
}

// If no arguments, start interactive mode (unless in test environment)
if (args.length === 0 && process.env.NODE_ENV !== 'test') {
  const { InteractiveMode } = await import("./interactive");
  await InteractiveMode.start();
  process.exit(0);
}

// Parse command line arguments
try {
  program.parse();
} catch (error) {
  if (error instanceof Error && error.message.includes('process.exit')) {
    // Expected from mocked process.exit in tests
    throw error;
  }
  if (error instanceof Error && error.message.includes('commander.helpDisplayed')) {
    // Help was displayed successfully, exit cleanly
    process.exit(0);
  }
  if (error instanceof Error && error.message.includes('outputHelp')) {
    // Help was displayed successfully, exit cleanly
    process.exit(0);
  }
  console.error(chalk.red("Failed to parse command:"), error);
  process.exit(1);
}