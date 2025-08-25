#!/usr/bin/env bun

/**
 * Build script for Keyforge standalone binary distribution
 * Creates optimized executables for multiple platforms
 */

import { existsSync, rmSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

interface BuildTarget {
  platform: string;
  arch: string;
  extension: string;
  description: string;
}

const BUILD_TARGETS: BuildTarget[] = [
  {
    platform: "linux",
    arch: "x64", 
    extension: "",
    description: "Linux x86_64"
  },
  {
    platform: "darwin",
    arch: "x64",
    extension: "",
    description: "macOS Intel"
  },
  {
    platform: "darwin", 
    arch: "arm64",
    extension: "",
    description: "macOS Apple Silicon"
  },
  {
    platform: "win32",
    arch: "x64",
    extension: ".exe",
    description: "Windows x86_64"
  }
];

class KeyforgeBuilder {
  private distDir = "dist";
  private sourceFile = "src/cli/index.ts";

  async build(targets?: string[]): Promise<void> {
    console.log(chalk.bold.cyan("🔨 Building Keyforge binaries"));
    console.log();

    // Clean dist directory
    await this.cleanDist();

    // Determine which targets to build
    const targetsToBuild = targets && targets.length > 0 
      ? BUILD_TARGETS.filter(t => targets.includes(`${t.platform}-${t.arch}`))
      : BUILD_TARGETS;

    if (targetsToBuild.length === 0) {
      console.error(chalk.red("No valid targets specified"));
      process.exit(1);
    }

    // Build each target
    for (const target of targetsToBuild) {
      await this.buildTarget(target);
    }

    // Create checksums
    await this.createChecksums();

    // Show completion summary
    this.showSummary(targetsToBuild);
  }

  private async cleanDist(): Promise<void> {
    if (existsSync(this.distDir)) {
      console.log(chalk.gray("Cleaning dist directory..."));
      rmSync(this.distDir, { recursive: true, force: true });
    }

    mkdirSync(this.distDir, { recursive: true });
  }

  private async buildTarget(target: BuildTarget): Promise<void> {
    const outputName = `keyforge-${target.platform}-${target.arch}${target.extension}`;
    const outputPath = join(this.distDir, outputName);

    console.log(chalk.cyan(`Building ${target.description}...`));

    try {
      // Build with Bun's native compilation
      const buildProcess = Bun.spawn([
        "bun",
        "build",
        this.sourceFile,
        "--compile",
        "--minify",
        "--target=bun",
        `--outfile=${outputPath}`,
        "--define:process.env.NODE_ENV=\"production\""
      ], {
        stdio: ["pipe", "pipe", "pipe"]
      });

      const result = await buildProcess.exited;

      if (result === 0) {
        // Make executable on Unix systems
        if (target.platform !== "win32") {
          chmodSync(outputPath, 0o755);
        }

        const stats = await Bun.file(outputPath).size;
        const sizeMB = (stats / 1024 / 1024).toFixed(1);
        console.log(chalk.green(`  ✓ ${outputName} (${sizeMB} MB)`));
      } else {
        const stderr = await new Response(buildProcess.stderr).text();
        throw new Error(`Build failed: ${stderr}`);
      }

    } catch (error) {
      console.error(chalk.red(`  ✗ Failed to build ${target.description}`));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  private async createChecksums(): Promise<void> {
    console.log(chalk.cyan("Creating checksums..."));

    const checksumFile = join(this.distDir, "checksums.txt");
    const checksums: string[] = [];

    const files = await Array.fromAsync(
      new Bun.Glob("keyforge-*").scan(this.distDir)
    );

    for (const file of files) {
      const filePath = join(this.distDir, file);
      const fileData = await Bun.file(filePath).arrayBuffer();
      
      // Calculate SHA256 hash
      const hashArray = await crypto.subtle.digest("SHA-256", fileData);
      const hashHex = Array.from(new Uint8Array(hashArray))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      checksums.push(`${hashHex}  ${file}`);
    }

    await Bun.write(checksumFile, checksums.join('\n') + '\n');
    console.log(chalk.green("  ✓ checksums.txt"));
  }

  private showSummary(targets: BuildTarget[]): void {
    console.log();
    console.log(chalk.bold.green("✅ Build completed successfully!"));
    console.log();
    console.log(chalk.bold("Built targets:"));
    
    targets.forEach(target => {
      const filename = `keyforge-${target.platform}-${target.arch}${target.extension}`;
      console.log(`  • ${target.description}: ${chalk.gray(filename)}`);
    });

    console.log();
    console.log(chalk.bold("Distribution files:"));
    console.log(`  📁 ${this.distDir}/`);
    console.log(`  🔍 checksums.txt`);
    console.log();
    console.log(chalk.gray("Installation:"));
    console.log(chalk.gray("  1. Download the binary for your platform"));
    console.log(chalk.gray("  2. Make executable: chmod +x keyforge-*"));
    console.log(chalk.gray("  3. Move to PATH: mv keyforge-* /usr/local/bin/keyforge"));
    console.log(chalk.gray("  4. Verify: keyforge --version"));
  }

  async dev(): Promise<void> {
    console.log(chalk.bold.cyan("🚀 Starting development build"));
    console.log();

    // Build for current platform only
    const currentPlatform = process.platform;
    const currentArch = process.arch;
    
    const target = BUILD_TARGETS.find(
      t => t.platform === currentPlatform && t.arch === currentArch
    );

    if (!target) {
      console.error(chalk.red(`No build target for ${currentPlatform}-${currentArch}`));
      process.exit(1);
    }

    await this.cleanDist();
    await this.buildTarget(target);

    const outputName = `keyforge-${target.platform}-${target.arch}${target.extension}`;
    console.log();
    console.log(chalk.green(`Development build ready: ${this.distDir}/${outputName}`));
  }

  async release(): Promise<void> {
    console.log(chalk.bold.cyan("📦 Creating release build"));
    console.log();

    // Verify we're in a clean git state
    const gitStatus = Bun.spawn(["git", "status", "--porcelain"], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    const gitOutput = await new Response(gitStatus.stdout).text();
    if (gitOutput.trim()) {
      console.warn(chalk.yellow("⚠  Working directory has uncommitted changes"));
    }

    // Get current version
    const packageJson = await Bun.file("package.json").json();
    const version = packageJson.version;

    console.log(chalk.gray(`Building version ${version}...`));

    // Build all targets
    await this.build();

    // Create version-specific directory
    const releaseDir = `dist/v${version}`;
    mkdirSync(releaseDir, { recursive: true });

    // Copy files to release directory
    const files = await Array.fromAsync(
      new Bun.Glob("*").scan(this.distDir)
    );

    for (const file of files) {
      if (file !== `v${version}`) {
        const source = join(this.distDir, file);
        const dest = join(releaseDir, file);
        await Bun.write(dest, await Bun.file(source).arrayBuffer());
      }
    }

    console.log();
    console.log(chalk.bold.green("🎉 Release build completed!"));
    console.log(chalk.gray(`Files available in: ${releaseDir}/`));
  }
}

// CLI interface
async function main(): Promise<void> {
  const builder = new KeyforgeBuilder();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "dev":
      await builder.dev();
      break;

    case "release":
      await builder.release();
      break;

    case "clean":
      if (existsSync("dist")) {
        rmSync("dist", { recursive: true, force: true });
        console.log(chalk.green("✓ Cleaned dist directory"));
      }
      break;

    case "targets":
      console.log(chalk.bold("Available build targets:"));
      BUILD_TARGETS.forEach(target => {
        console.log(`  ${target.platform}-${target.arch}: ${target.description}`);
      });
      break;

    default:
      // Build specific targets or all targets
      const targets = args.length > 0 ? args : undefined;
      await builder.build(targets);
  }
}

// Show help
function showHelp(): void {
  console.log(chalk.bold("Keyforge Build Script"));
  console.log();
  console.log(chalk.bold("Usage:"));
  console.log("  bun run scripts/build.ts [command|target...]");
  console.log();
  console.log(chalk.bold("Commands:"));
  console.log("  dev          Build for current platform only");
  console.log("  release      Create versioned release build");
  console.log("  clean        Clean dist directory");
  console.log("  targets      List available build targets");
  console.log();
  console.log(chalk.bold("Examples:"));
  console.log("  bun run scripts/build.ts");
  console.log("  bun run scripts/build.ts dev");
  console.log("  bun run scripts/build.ts linux-x64 darwin-arm64");
  console.log("  bun run scripts/build.ts release");
}

if (import.meta.main) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  try {
    await main();
  } catch (error) {
    console.error(chalk.red("Build failed:"));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}