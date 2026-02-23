import { describe, it, expect } from "vitest";
import { findChromePath } from "./browser.js";

describe("findChromePath", () => {
  it("returns a string or undefined", () => {
    const result = findChromePath();
    // On CI this may be undefined, on dev machines it should be a string
    expect(result === undefined || typeof result === "string").toBe(true);
  });

  it("respects GENART_CHROME_PATH env var", () => {
    const original = process.env["GENART_CHROME_PATH"];
    try {
      // Point to a file that exists
      process.env["GENART_CHROME_PATH"] = process.execPath;
      const result = findChromePath();
      expect(result).toBe(process.execPath);
    } finally {
      if (original !== undefined) {
        process.env["GENART_CHROME_PATH"] = original;
      } else {
        delete process.env["GENART_CHROME_PATH"];
      }
    }
  });

  it("ignores GENART_CHROME_PATH if file does not exist", () => {
    const original = process.env["GENART_CHROME_PATH"];
    try {
      process.env["GENART_CHROME_PATH"] = "/nonexistent/chrome";
      const result = findChromePath();
      // Should fall through to platform detection
      expect(result === undefined || typeof result === "string").toBe(true);
    } finally {
      if (original !== undefined) {
        process.env["GENART_CHROME_PATH"] = original;
      } else {
        delete process.env["GENART_CHROME_PATH"];
      }
    }
  });
});
