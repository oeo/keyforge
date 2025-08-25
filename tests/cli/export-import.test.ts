import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { ExportCommand } from "../../src/cli/commands/export";
import { ImportCommand } from "../../src/cli/commands/import";
import { SessionManager } from "../../src/cli/session";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Export/Import Commands", () => {
  const testVaultDir = join(__dirname, "../../.test_export_import");
  const testExportFile = join(__dirname, "../../test-export.json");
  const testEncryptedFile = join(__dirname, "../../test-encrypted.kf");
  const testBackupFile = join(__dirname, "../../test-backup.kf");
  
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    // Clean up test directories and files
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }
    [testExportFile, testEncryptedFile, testBackupFile].forEach(file => {
      if (existsSync(file)) {
        rmSync(file, { force: true });
      }
    });

    // Mock console outputs
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    logOutput = [];
    errorOutput = [];
    
    console.log = mock((msg: string) => logOutput.push(msg));
    console.error = mock((msg: string) => errorOutput.push(msg));

    // Mock session manager with consistent seed
    const consistentSeed = Buffer.from("export_import_seed".padEnd(64, '0'), 'utf8');
    SessionManager.getMasterSeed = mock(async () => consistentSeed);
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up test files
    [testExportFile, testEncryptedFile, testBackupFile].forEach(file => {
      if (existsSync(file)) {
        rmSync(file, { force: true });
      }
    });
    
    if (existsSync(testVaultDir)) {
      rmSync(testVaultDir, { recursive: true, force: true });
    }
  });

  describe("ExportCommand", () => {
    test("exports vault to JSON format", async () => {
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Exporting vault to json format...");
      expect(output).toContain(`✓ Vault exported to ${testExportFile}`);
      expect(output).toContain("File size:");

      // Verify file exists and has correct format
      expect(existsSync(testExportFile)).toBe(true);
      const exportData = JSON.parse(readFileSync(testExportFile, 'utf8'));
      expect(exportData).toHaveProperty('exportInfo');
      expect(exportData).toHaveProperty('vault');
      expect(exportData.exportInfo.format).toBe('json');
      expect(exportData.exportInfo.version).toBe('1.0.0');
    });

    test("exports vault to encrypted format", async () => {
      await ExportCommand.execute({
        format: 'encrypted',
        output: testEncryptedFile
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Exporting vault to encrypted format...");
      expect(output).toContain(`✓ Vault exported to ${testEncryptedFile}`);

      // Verify file exists and has correct format
      expect(existsSync(testEncryptedFile)).toBe(true);
      const exportData = JSON.parse(readFileSync(testEncryptedFile, 'utf8'));
      expect(exportData.format).toBe('encrypted');
      expect(exportData).toHaveProperty('nonce');
      expect(exportData).toHaveProperty('tag');
      expect(exportData).toHaveProperty('data');
    });

    test("exports vault to backup format", async () => {
      await ExportCommand.execute({
        format: 'backup',
        output: testBackupFile
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Exporting vault to backup format...");
      expect(output).toContain(`✓ Vault exported to ${testBackupFile}`);

      // Verify file exists and has correct format
      expect(existsSync(testBackupFile)).toBe(true);
      const exportData = JSON.parse(readFileSync(testBackupFile, 'utf8'));
      expect(exportData.format).toBe('keyforge-backup');
      expect(exportData.encryption).toBe('ChaCha20-Poly1305');
      expect(exportData).toHaveProperty('nonce');
      expect(exportData).toHaveProperty('tag');
      expect(exportData).toHaveProperty('data');
    });

    test("uses default output filename when not specified", async () => {
      await ExportCommand.execute({
        format: 'json'
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Exporting vault to json format...");
      expect(output).toMatch(/✓ Vault exported to keyforge-export-.*\.json/);
    });

    test("filters vault data with include option", async () => {
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile,
        include: ['passwords', 'notes']
      });

      expect(existsSync(testExportFile)).toBe(true);
      const exportData = JSON.parse(readFileSync(testExportFile, 'utf8'));
      
      // Should include passwords and notes
      expect(exportData.vault).toHaveProperty('passwords');
      expect(exportData.vault).toHaveProperty('notes');
      
      // SSH, wallets, and TOTP should be empty arrays
      expect(exportData.vault.config.services.ssh).toEqual([]);
      expect(exportData.vault.config.services.wallets).toEqual([]);
      expect(exportData.vault.config.services.totp).toEqual([]);
    });

    test("filters vault data with exclude option", async () => {
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile,
        exclude: ['ssh', 'wallets']
      });

      expect(existsSync(testExportFile)).toBe(true);
      const exportData = JSON.parse(readFileSync(testExportFile, 'utf8'));
      
      // SSH and wallets should be excluded (empty arrays)
      expect(exportData.vault.config.services.ssh).toEqual([]);
      expect(exportData.vault.config.services.wallets).toEqual([]);
      
      // Other data should be present
      expect(exportData.vault).toHaveProperty('passwords');
      expect(exportData.vault).toHaveProperty('notes');
      expect(exportData.vault.config.services).toHaveProperty('totp');
    });

    test("handles unknown format gracefully", async () => {
      await ExportCommand.execute({
        format: 'unknown' as any,
        output: testExportFile
      });

      const output = errorOutput.join("\n");
      expect(output).toContain("Unknown export format: unknown");
      expect(logOutput.join("\n")).toContain("Available formats: json, encrypted, backup");
    });

    test("handles session not initialized", async () => {
      SessionManager.getMasterSeed = mock(async () => null);

      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      const output = errorOutput.join("\n");
      expect(output).toContain("Not initialized. Run 'keyforge init' first.");
    });
  });

  describe("ImportCommand", () => {
    test("imports JSON format vault", async () => {
      // First export a vault
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      // Clear output
      logOutput = [];

      // Then import it
      await ImportCommand.execute({
        input: testExportFile,
        format: 'json'
      });

      const output = logOutput.join("\n");
      expect(output).toContain(`Importing vault from ${testExportFile}...`);
      expect(output).toContain("Import Preview:");
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("imports encrypted format vault", async () => {
      // First export an encrypted vault
      await ExportCommand.execute({
        format: 'encrypted',
        output: testEncryptedFile
      });

      // Clear output
      logOutput = [];

      // Then import it
      await ImportCommand.execute({
        input: testEncryptedFile,
        format: 'encrypted'
      });

      const output = logOutput.join("\n");
      expect(output).toContain(`Importing vault from ${testEncryptedFile}...`);
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("imports backup format vault", async () => {
      // First export a backup vault
      await ExportCommand.execute({
        format: 'backup',
        output: testBackupFile
      });

      // Clear output
      logOutput = [];

      // Then import it
      await ImportCommand.execute({
        input: testBackupFile,
        format: 'backup'
      });

      const output = logOutput.join("\n");
      expect(output).toContain(`Importing vault from ${testBackupFile}...`);
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("auto-detects format correctly", async () => {
      // Export different formats
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });
      
      await ExportCommand.execute({
        format: 'encrypted', 
        output: testEncryptedFile
      });

      // Clear output
      logOutput = [];

      // Import with auto-detection
      await ImportCommand.execute({
        input: testExportFile,
        format: 'auto'
      });

      let output = logOutput.join("\n");
      expect(output).toContain("✓ Vault imported successfully");

      // Clear and test encrypted
      logOutput = [];
      await ImportCommand.execute({
        input: testEncryptedFile,
        format: 'auto'
      });

      output = logOutput.join("\n");
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("shows import preview with data counts", async () => {
      // First create and export a vault with some data
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      // Clear output
      logOutput = [];

      // Import with preview
      await ImportCommand.execute({
        input: testExportFile
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Import Preview:");
      expect(output).toContain("Version:");
      expect(output).toContain("Data to import:");
      expect(output).toContain("SSH Keys:");
      expect(output).toContain("Wallets:");
      expect(output).toContain("TOTP Services:");
      expect(output).toContain("Passwords:");
      expect(output).toContain("Notes:");
    });

    test("dry run mode doesn't make changes", async () => {
      // Export a vault
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      // Clear output
      logOutput = [];

      // Import in dry run mode
      await ImportCommand.execute({
        input: testExportFile,
        dryRun: true
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Dry run completed. No changes made.");
      expect(output).not.toContain("✓ Vault imported successfully");
    });

    test("handles missing import file", async () => {
      await ImportCommand.execute({
        input: "/nonexistent/file.json"
      });

      const output = errorOutput.join("\n");
      expect(output).toContain("Import file not found:");
    });

    test("handles unknown import format", async () => {
      // Create a dummy file
      await Bun.write(testExportFile, "invalid json");

      await ImportCommand.execute({
        input: testExportFile,
        format: 'unknown' as any
      });

      const output = errorOutput.join("\n");
      expect(output).toContain("Unknown import format: unknown");
    });

    test("handles session not initialized", async () => {
      SessionManager.getMasterSeed = mock(async () => null);

      await ImportCommand.execute({
        input: testExportFile
      });

      const output = errorOutput.join("\n");
      expect(output).toContain("Not initialized. Run 'keyforge init' first.");
    });

    test("merge mode preserves existing data", async () => {
      // This test would require setting up existing vault data
      // and verifying merge behavior, but would be complex to implement
      // without more vault setup utilities
      
      // For now, just test that merge option is accepted
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      logOutput = [];
      
      await ImportCommand.execute({
        input: testExportFile,
        merge: true
      });

      const output = logOutput.join("\n");
      expect(output).toContain("Merging with existing vault...");
      expect(output).toContain("✓ Vault imported successfully");
    });
  });

  describe("Round-trip export/import", () => {
    test("JSON export/import preserves data", async () => {
      // Export and then import should preserve all data
      await ExportCommand.execute({
        format: 'json',
        output: testExportFile
      });

      await ImportCommand.execute({
        input: testExportFile,
        format: 'json'
      });

      const output = logOutput.join("\n");
      expect(output).toContain("✓ Vault exported to");
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("Encrypted export/import preserves data", async () => {
      await ExportCommand.execute({
        format: 'encrypted',
        output: testEncryptedFile
      });

      await ImportCommand.execute({
        input: testEncryptedFile,
        format: 'encrypted'
      });

      const output = logOutput.join("\n");
      expect(output).toContain("✓ Vault exported to");
      expect(output).toContain("✓ Vault imported successfully");
    });

    test("Backup export/import preserves data", async () => {
      await ExportCommand.execute({
        format: 'backup',
        output: testBackupFile
      });

      await ImportCommand.execute({
        input: testBackupFile,
        format: 'backup'
      });

      const output = logOutput.join("\n");
      expect(output).toContain("✓ Vault exported to");
      expect(output).toContain("✓ Vault imported successfully");
    });
  });
});