import { describe, it, expect } from "vitest";
import { parseWait } from "./parse-wait.js";

describe("parseWait", () => {
  it("parses bare milliseconds", () => {
    expect(parseWait("500")).toBe(500);
  });

  it("parses ms suffix", () => {
    expect(parseWait("200ms")).toBe(200);
  });

  it("parses seconds suffix", () => {
    expect(parseWait("2s")).toBe(2000);
  });

  it("parses fractional seconds", () => {
    expect(parseWait("1.5s")).toBe(1500);
  });

  it("clamps negative to zero", () => {
    expect(parseWait("-100")).toBe(0);
  });

  it("throws on invalid input", () => {
    expect(() => parseWait("abc")).toThrow("Invalid wait value");
  });
});
