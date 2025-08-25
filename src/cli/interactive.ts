/**
 * Interactive REPL mode for Keyforge
 * Provides a command-line interface for extended operations
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { SessionManager } from "./session";
import { GenerateCommand } from "./commands/generate";
import { VaultCommand } from "./commands/vault";
import { PasswordCommand } from "./commands/password";
import { TOTPCommand } from "./commands/totp";
import { RecoverCommand } from "./commands/recover";
import { InitCommand } from "./commands/init";
import chalk from "chalk";

interface Command {
  name: string;
  description: string;
  usage: string;
  execute: (args: string[]) => Promise<void>;
}

export class InteractiveMode {
  private rl: readline.Interface;
  private commands: Map<string, Command>;

  constructor() {
    this.rl = readline.createInterface({ input, output });
    this.commands = new Map();
    this.setupCommands();
  }

  /**
   * Start interactive mode
   */
  static async start(): Promise<void> {
    const interactive = new InteractiveMode();
    await interactive.run();
  }

  /**
   * Setup available commands
   */
  private setupCommands(): void {
    // Core commands
    this.commands.set('init', {
      name: 'init',
      description: 'Initialize Keyforge with master passphrase',
      usage: 'init [--passphrase <pass>] [--username <user>]',
      execute: async (args) => {
        const options = this.parseArgs(args, {
          passphrase: 'p',
          username: 'u',
          'show-version': ''
        });
        await InitCommand.execute(options);
      }
    });

    this.commands.set('generate', {
      name: 'generate',
      description: 'Generate cryptographic keys',
      usage: 'generate <type> [--service <service>] [--output <file>] [--copy] [--show-private]',
      execute: async (args) => {
        if (args.length === 0) {
          console.log(chalk.red("Key type required"));
          console.log("Available types: ssh, bitcoin, ethereum");
          return;
        }
        
        const type = args[0];
        const options = this.parseArgs(args.slice(1), {
          service: 's',
          output: 'o',
          copy: 'c',
          'show-private': '',
          format: ''
        });
        
        await GenerateCommand.execute(type, options);
      }
    });

    this.commands.set('vault', {
      name: 'vault',
      description: 'Manage encrypted vault',
      usage: 'vault [action] [--storage <type>]',
      execute: async (args) => {
        const action = args[0] || 'status';
        const options = this.parseArgs(args.slice(1), {
          storage: ''
        });
        await VaultCommand.execute(action, options);
      }
    });

    this.commands.set('pass', {
      name: 'pass',
      description: 'Password manager',
      usage: 'pass <action> [site] [--username <user>] [--notes <notes>] [--generate]',
      execute: async (args) => {
        if (args.length === 0) {
          console.log(chalk.red("Action required"));
          console.log("Available actions: add, get, list, update, delete, generate");
          return;
        }
        
        const action = args[0];
        const site = args[1];
        const options = this.parseArgs(args.slice(2), {
          username: 'u',
          notes: 'n',
          tags: 't',
          generate: 'g',
          length: 'l'
        });
        
        await PasswordCommand.execute(action, site, options);
      }
    });

    this.commands.set('totp', {
      name: 'totp',
      description: 'Generate TOTP/2FA codes',
      usage: 'totp <service> [--qr] [--secret] [--add]',
      execute: async (args) => {
        if (args.length === 0) {
          console.log(chalk.red("Service name required"));
          return;
        }
        
        const service = args[0];
        const options = this.parseArgs(args.slice(1), {
          qr: '',
          secret: '',
          add: '',
          algorithm: '',
          digits: '',
          period: ''
        });
        
        await TOTPCommand.execute(service, options);
      }
    });

    this.commands.set('recover', {
      name: 'recover',
      description: 'Recover vault from passphrase',
      usage: 'recover [--from <source>] [--passphrase <pass>]',
      execute: async (args) => {
        const options = this.parseArgs(args, {
          from: '',
          passphrase: 'p',
          username: 'u'
        });
        await RecoverCommand.execute(options);
      }
    });

    // Utility commands
    this.commands.set('help', {
      name: 'help',
      description: 'Show available commands',
      usage: 'help [command]',
      execute: async (args) => {
        if (args.length > 0) {
          this.showCommandHelp(args[0]);
        } else {
          this.showHelp();
        }
      }
    });

    this.commands.set('status', {
      name: 'status',
      description: 'Show session status',
      usage: 'status',
      execute: async () => {
        const masterSeed = await SessionManager.getMasterSeed();
        if (masterSeed) {
          console.log(chalk.green("✓ Session active"));
          console.log("Master seed loaded and ready");
        } else {
          console.log(chalk.yellow("○ Session inactive"));
          console.log("Run 'init' to initialize or 'recover' to restore");
        }
      }
    });

    this.commands.set('clear', {
      name: 'clear',
      description: 'Clear session and screen',
      usage: 'clear',
      execute: async () => {
        SessionManager.clear();
        console.clear();
        console.log(chalk.cyan("Session cleared"));
      }
    });

    this.commands.set('exit', {
      name: 'exit',
      description: 'Exit interactive mode',
      usage: 'exit',
      execute: async () => {
        console.log(chalk.gray("Goodbye!"));
        process.exit(0);
      }
    });
  }

  /**
   * Run interactive mode loop
   */
  private async run(): Promise<void> {
    console.log(chalk.bold.cyan("Keyforge Interactive Mode"));
    console.log(chalk.gray("Type 'help' for available commands or 'exit' to quit"));
    console.log();

    // Check session status
    const masterSeed = await SessionManager.getMasterSeed();
    if (masterSeed) {
      console.log(chalk.green("✓ Session active"));
    } else {
      console.log(chalk.yellow("○ No active session - run 'init' or 'recover'"));
    }
    console.log();

    while (true) {
      try {
        const input = await this.rl.question(chalk.cyan("keyforge> "));
        const trimmed = input.trim();

        if (!trimmed) continue;

        const args = this.parseInput(trimmed);
        const commandName = args[0];
        const commandArgs = args.slice(1);

        const command = this.commands.get(commandName);
        if (command) {
          await command.execute(commandArgs);
        } else {
          console.log(chalk.red(`Unknown command: ${commandName}`));
          console.log("Type 'help' for available commands");
        }

        console.log(); // Add spacing after command output

      } catch (error) {
        if (error instanceof Error && error.message.includes('EOF')) {
          // Ctrl-D pressed
          console.log(chalk.gray("\nGoodbye!"));
          break;
        }
        
        console.error(chalk.red("Command error:"), error);
      }
    }

    this.rl.close();
  }

  /**
   * Parse command line input
   */
  private parseInput(input: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Parse command arguments into options
   */
  private parseArgs(args: string[], optionMap: Record<string, string>): any {
    const options: any = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const value = args[i + 1];
        
        if (optionMap[key] !== undefined) {
          if (optionMap[key] === '') {
            // Boolean flag
            options[key] = true;
          } else {
            // Value option
            options[key] = value;
            i++; // Skip next arg as it's the value
          }
        }
      } else if (arg.startsWith('-')) {
        const short = arg.slice(1);
        const longKey = Object.keys(optionMap).find(k => optionMap[k] === short);
        
        if (longKey) {
          if (optionMap[longKey] === '') {
            options[longKey] = true;
          } else {
            options[longKey] = args[i + 1];
            i++;
          }
        }
      }
    }
    
    return options;
  }

  /**
   * Show general help
   */
  private showHelp(): void {
    console.log(chalk.bold("Available Commands:"));
    console.log();

    const categories = {
      "Core Operations": ['init', 'generate', 'recover'],
      "Vault Management": ['vault', 'pass', 'totp'],
      "Utilities": ['status', 'help', 'clear', 'exit']
    };

    for (const [category, commandNames] of Object.entries(categories)) {
      console.log(chalk.bold.blue(category + ":"));
      
      for (const name of commandNames) {
        const command = this.commands.get(name);
        if (command) {
          console.log(`  ${chalk.cyan(command.name.padEnd(12))} ${command.description}`);
        }
      }
      console.log();
    }

    console.log(chalk.gray("Use 'help <command>' for detailed usage information"));
  }

  /**
   * Show help for specific command
   */
  private showCommandHelp(commandName: string): void {
    const command = this.commands.get(commandName);
    
    if (!command) {
      console.log(chalk.red(`Unknown command: ${commandName}`));
      return;
    }

    console.log(chalk.bold(`${command.name} - ${command.description}`));
    console.log();
    console.log(chalk.bold("Usage:"));
    console.log(`  ${command.usage}`);

    // Add examples for common commands
    if (commandName === 'generate') {
      console.log();
      console.log(chalk.bold("Examples:"));
      console.log("  generate ssh --service github.com");
      console.log("  generate bitcoin --service trading --copy");
      console.log("  generate ssh --output ~/.ssh/mykey --show-private");
    } else if (commandName === 'pass') {
      console.log();
      console.log(chalk.bold("Examples:"));
      console.log("  pass add gmail.com --username alice@example.com");
      console.log("  pass get gmail.com");
      console.log("  pass list");
      console.log("  pass generate --length 20");
    } else if (commandName === 'totp') {
      console.log();
      console.log(chalk.bold("Examples:"));
      console.log("  totp github.com");
      console.log("  totp google.com --qr");
      console.log("  totp newservice --add --digits 8");
    }
  }
}