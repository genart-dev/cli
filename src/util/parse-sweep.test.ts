import { describe, it, expect } from "vitest";
import { parseSweep, cartesianProduct } from "./parse-sweep.js";

describe("parseSweep", () => {
  it("parses a basic sweep spec", () => {
    const result = parseSweep("amplitude=0:1:0.5");
    expect(result.key).toBe("amplitude");
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
    expect(result.step).toBe(0.5);
    expect(result.values).toEqual([0, 0.5, 1]);
  });

  it("handles integer steps", () => {
    const result = parseSweep("freq=1:5:2");
    expect(result.values).toEqual([1, 3, 5]);
  });

  it("handles fine-grained steps", () => {
    const result = parseSweep("x=0:0.3:0.1");
    expect(result.values).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("throws on invalid format", () => {
    expect(() => parseSweep("invalid")).toThrow("Invalid sweep format");
  });

  it("throws on negative step", () => {
    expect(() => parseSweep("x=0:1:-0.1")).toThrow("step must be positive");
  });

  it("throws on min > max", () => {
    expect(() => parseSweep("x=5:1:1")).toThrow("min must be ≤ max");
  });
});

describe("cartesianProduct", () => {
  it("returns seeds only when no sweeps", () => {
    const result = cartesianProduct([1, 2, 3], []);
    expect(result).toEqual([
      { seed: 1, params: {} },
      { seed: 2, params: {} },
      { seed: 3, params: {} },
    ]);
  });

  it("produces cartesian product of seeds × single sweep", () => {
    const sweep = parseSweep("amp=0:1:1");
    const result = cartesianProduct([1, 2], [sweep]);
    expect(result).toEqual([
      { seed: 1, params: { amp: 0 } },
      { seed: 1, params: { amp: 1 } },
      { seed: 2, params: { amp: 0 } },
      { seed: 2, params: { amp: 1 } },
    ]);
  });

  it("produces cartesian product of seeds × multiple sweeps", () => {
    const s1 = parseSweep("a=0:1:1");
    const s2 = parseSweep("b=10:20:10");
    const result = cartesianProduct([1], [s1, s2]);
    expect(result).toEqual([
      { seed: 1, params: { a: 0, b: 10 } },
      { seed: 1, params: { a: 0, b: 20 } },
      { seed: 1, params: { a: 1, b: 10 } },
      { seed: 1, params: { a: 1, b: 20 } },
    ]);
  });
});
