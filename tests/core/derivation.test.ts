import { test, expect, describe } from "bun:test";
import { MasterDerivation } from "../../src/core/derivation";

describe("MasterDerivation", () => {
  test("derives deterministic master seed", async () => {
    const params = {
      passphrase: "correct horse battery staple",
      username: "alice", 
      version: 1
    };
    
    const seed1 = await MasterDerivation.deriveMasterSeed(params);
    const seed2 = await MasterDerivation.deriveMasterSeed(params);
    
    expect(seed1.equals(seed2)).toBe(true);
    expect(seed1.length).toBe(64); // 512 bits
    expect(seed1).toBeInstanceOf(Buffer);
  });

  test("different passphrases generate different seeds", async () => {
    const seed1 = await MasterDerivation.deriveMasterSeed({
      passphrase: "password1", 
      username: "alice", 
      version: 1
    });
    const seed2 = await MasterDerivation.deriveMasterSeed({
      passphrase: "password2", 
      username: "alice", 
      version: 1  
    });
    
    expect(seed1.equals(seed2)).toBe(false);
  });

  test("different usernames generate different seeds", async () => {
    const base = { passphrase: "test passphrase", version: 1 };
    const alice = await MasterDerivation.deriveMasterSeed({...base, username: "alice"});
    const bob = await MasterDerivation.deriveMasterSeed({...base, username: "bob"});
    
    expect(alice.equals(bob)).toBe(false);
  });

  test("different versions generate different seeds", async () => {
    const base = { passphrase: "test passphrase", username: "alice" };
    const v1 = await MasterDerivation.deriveMasterSeed({...base, version: 1});
    const v2 = await MasterDerivation.deriveMasterSeed({...base, version: 2});
    
    expect(v1.equals(v2)).toBe(false);
  });

  test("uses default values correctly", async () => {
    const withDefaults = await MasterDerivation.deriveMasterSeed({
      passphrase: "test passphrase"
    });
    
    const explicit = await MasterDerivation.deriveMasterSeed({
      passphrase: "test passphrase",
      username: "default",
      version: 1
    });
    
    expect(withDefaults.equals(explicit)).toBe(true);
  });

  test("creates deterministic salt from components", async () => {
    // This tests the internal salt creation
    const params = {
      passphrase: "test",
      username: "alice",
      version: 1
    };
    
    // Multiple calls should create same salt (deterministic)
    const seed1 = await MasterDerivation.deriveMasterSeed(params);
    const seed2 = await MasterDerivation.deriveMasterSeed(params);
    
    expect(seed1.equals(seed2)).toBe(true);
  });

  test("handles edge cases", async () => {
    // Empty passphrase should still work (though not recommended)
    const emptySeed = await MasterDerivation.deriveMasterSeed({
      passphrase: "",
      username: "test",
      version: 1
    });
    expect(emptySeed.length).toBe(64);
    
    // Very long passphrase
    const longPassphrase = "a".repeat(1000);
    const longSeed = await MasterDerivation.deriveMasterSeed({
      passphrase: longPassphrase,
      username: "test", 
      version: 1
    });
    expect(longSeed.length).toBe(64);
    
    // Unicode in passphrase and username
    const unicodeSeed = await MasterDerivation.deriveMasterSeed({
      passphrase: "测试密码🔑",
      username: "用户👤",
      version: 1
    });
    expect(unicodeSeed.length).toBe(64);
  });

  test("seed has sufficient entropy", async () => {
    const seed = await MasterDerivation.deriveMasterSeed({
      passphrase: "test passphrase",
      username: "alice",
      version: 1
    });
    
    // Check that seed isn't all zeros or all ones
    const allZeros = Buffer.alloc(64, 0);
    const allOnes = Buffer.alloc(64, 0xFF);
    
    expect(seed.equals(allZeros)).toBe(false);
    expect(seed.equals(allOnes)).toBe(false);
    
    // Check for some randomness (not all bytes the same)
    const firstByte = seed[0];
    const allSame = seed.every(byte => byte === firstByte);
    expect(allSame).toBe(false);
  });

  test("performance is reasonable", async () => {
    const startTime = Date.now();
    
    await MasterDerivation.deriveMasterSeed({
      passphrase: "performance test passphrase",
      username: "testuser",
      version: 1
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete within 2 seconds (adjust based on requirements)
    expect(duration).toBeLessThan(2000);
  });
});