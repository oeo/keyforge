import { test, expect, describe } from "bun:test";
import { CryptoUtils } from "../../src/crypto/primitives";

describe("CryptoUtils", () => {
  test("generates secure random bytes", () => {
    const bytes32 = CryptoUtils.random(32);
    const bytes16 = CryptoUtils.random(16);
    
    expect(bytes32.length).toBe(32);
    expect(bytes16.length).toBe(16);
    expect(bytes32).toBeInstanceOf(Buffer);
    
    // Test uniqueness across multiple calls
    const bytes32_2 = CryptoUtils.random(32);
    expect(bytes32.equals(bytes32_2)).toBe(false);
  });

  test("compares buffers in constant time", () => {
    const a = Buffer.from("test data");
    const b = Buffer.from("test data");
    const c = Buffer.from("different");
    const d = Buffer.from("test");  // Different length
    
    expect(CryptoUtils.compare(a, b)).toBe(true);
    expect(CryptoUtils.compare(a, c)).toBe(false);
    expect(CryptoUtils.compare(a, d)).toBe(false);
  });

  test("securely clears memory", () => {
    const buffer = Buffer.from("sensitive data");
    const originalData = buffer.toString();
    
    expect(buffer.toString()).toBe(originalData);
    
    CryptoUtils.clear(buffer);
    
    // Buffer should be filled with zeros
    expect(buffer.every(byte => byte === 0)).toBe(true);
    expect(buffer.toString()).not.toBe(originalData);
  });

  test("stretches keys with PBKDF2", async () => {
    const password = "test password";
    const salt = Buffer.from("test salt");
    
    const key1 = await CryptoUtils.stretchKey(password, salt, 10000);
    const key2 = await CryptoUtils.stretchKey(password, salt, 10000);
    
    expect(key1).toBeInstanceOf(Buffer);
    expect(key1.length).toBe(32); // 256 bits
    expect(key1.equals(key2)).toBe(true); // Deterministic
    
    // Different password should produce different key
    const key3 = await CryptoUtils.stretchKey("different password", salt, 10000);
    expect(key1.equals(key3)).toBe(false);
  });

  test("handles edge cases", () => {
    // Zero-length random should return empty buffer
    const empty = CryptoUtils.random(0);
    expect(empty.length).toBe(0);
    
    // Empty buffers should compare as equal
    const emptyA = Buffer.alloc(0);
    const emptyB = Buffer.alloc(0);
    expect(CryptoUtils.compare(emptyA, emptyB)).toBe(true);
    
    // Clear empty buffer shouldn't crash
    expect(() => CryptoUtils.clear(Buffer.alloc(0))).not.toThrow();
  });
});