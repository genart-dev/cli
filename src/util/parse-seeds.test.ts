import { describe, it, expect } from "vitest";
import { parseSeeds } from "./parse-seeds.js";

describe("parseSeeds", () => {
  it("parses a single seed", () => {
    expect(parseSeeds("42")).toEqual([42]);
  });

  it("parses a comma-separated list", () => {
    expect(parseSeeds("1,5,42,99")).toEqual([1, 5, 42, 99]);
  });

  it("parses a range", () => {
    expect(parseSeeds("1-5")).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses mixed ranges and singles", () => {
    expect(parseSeeds("1-3,10,20-22")).toEqual([1, 2, 3, 10, 20, 21, 22]);
  });

  it("throws on invalid range (start > end)", () => {
    expect(() => parseSeeds("5-1")).toThrow("Invalid seed range");
  });

  it("throws on non-integer value", () => {
    expect(() => parseSeeds("abc")).toThrow("Invalid seed value");
  });
});
