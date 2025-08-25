import { test, expect, describe } from "bun:test";

describe("Project Setup", () => {
  test("Bun test runner is working", () => {
    expect(true).toBe(true);
  });

  test("TypeScript compilation works", () => {
    const testObject: { name: string; version: number } = {
      name: "keyforge",
      version: 1
    };
    
    expect(testObject.name).toBe("keyforge");
    expect(testObject.version).toBe(1);
  });

  test("Bun utilities are available", () => {
    // Test that Bun global is available
    expect(typeof Bun).toBe("object");
    expect(typeof Bun.version).toBe("string");
  });

  test("Buffer operations work", () => {
    const buffer = Buffer.from("test data", "utf8");
    expect(buffer.length).toBe(9);
    expect(buffer.toString()).toBe("test data");
  });

  test("Crypto utilities are available", () => {
    // Test basic crypto availability
    expect(typeof crypto).toBe("object");
    expect(typeof crypto.subtle).toBe("object");
  });
});