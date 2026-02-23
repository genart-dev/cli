import { describe, it, expect } from "vitest";
import {
  parseAnimate,
  interpolateParams,
  collectAnimates,
  EASINGS,
  type AnimateSpec,
} from "./interpolate.js";

describe("parseAnimate", () => {
  it("parses valid spec: param=start:end", () => {
    const result = parseAnimate("amplitude=0:1");
    expect(result).toEqual({ key: "amplitude", start: 0, end: 1 });
  });

  it("parses negative values", () => {
    const result = parseAnimate("offset=-10:10");
    expect(result).toEqual({ key: "offset", start: -10, end: 10 });
  });

  it("parses decimal values", () => {
    const result = parseAnimate("scale=0.5:2.5");
    expect(result).toEqual({ key: "scale", start: 0.5, end: 2.5 });
  });

  it("parses equal start and end", () => {
    const result = parseAnimate("x=5:5");
    expect(result).toEqual({ key: "x", start: 5, end: 5 });
  });

  it("throws on missing equals sign", () => {
    expect(() => parseAnimate("amplitude")).toThrow("Invalid --animate format");
  });

  it("throws on missing colon in range", () => {
    expect(() => parseAnimate("amplitude=0")).toThrow("Invalid --animate range");
  });

  it("throws on non-numeric values", () => {
    expect(() => parseAnimate("amplitude=a:b")).toThrow(
      "Invalid --animate values",
    );
  });

  it("throws on empty key", () => {
    expect(() => parseAnimate("=0:1")).toThrow("Invalid --animate format");
  });
});

describe("interpolateParams", () => {
  const linear = EASINGS["linear"]!;

  it("returns start values at t=0", () => {
    const specs: AnimateSpec[] = [{ key: "amp", start: 0, end: 1 }];
    expect(interpolateParams(specs, 0, linear)).toEqual({ amp: 0 });
  });

  it("returns end values at t=1", () => {
    const specs: AnimateSpec[] = [{ key: "amp", start: 0, end: 1 }];
    expect(interpolateParams(specs, 1, linear)).toEqual({ amp: 1 });
  });

  it("returns midpoint at t=0.5 with linear easing", () => {
    const specs: AnimateSpec[] = [{ key: "amp", start: 0, end: 10 }];
    expect(interpolateParams(specs, 0.5, linear)).toEqual({ amp: 5 });
  });

  it("interpolates multiple parameters independently", () => {
    const specs: AnimateSpec[] = [
      { key: "x", start: 0, end: 100 },
      { key: "y", start: 50, end: 0 },
    ];
    const result = interpolateParams(specs, 0.5, linear);
    expect(result).toEqual({ x: 50, y: 25 });
  });

  it("clamps t below 0", () => {
    const specs: AnimateSpec[] = [{ key: "v", start: 10, end: 20 }];
    expect(interpolateParams(specs, -0.5, linear)).toEqual({ v: 10 });
  });

  it("clamps t above 1", () => {
    const specs: AnimateSpec[] = [{ key: "v", start: 10, end: 20 }];
    expect(interpolateParams(specs, 1.5, linear)).toEqual({ v: 20 });
  });
});

describe("EASINGS", () => {
  it("linear: passes through t unchanged", () => {
    const fn = EASINGS["linear"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
  });

  it("ease-in: starts slow, ends fast", () => {
    const fn = EASINGS["ease-in"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.25);
    expect(fn(1)).toBe(1);
    // Monotonic: midpoint < linear midpoint (starts slow)
    expect(fn(0.5)).toBeLessThan(0.5);
  });

  it("ease-out: starts fast, ends slow", () => {
    const fn = EASINGS["ease-out"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.75);
    expect(fn(1)).toBe(1);
    // Monotonic: midpoint > linear midpoint (starts fast)
    expect(fn(0.5)).toBeGreaterThan(0.5);
  });

  it("ease-in-out: slow start, fast middle, slow end", () => {
    const fn = EASINGS["ease-in-out"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
    // First quarter should be below linear
    expect(fn(0.25)).toBeLessThan(0.25);
    // Third quarter should be above linear
    expect(fn(0.75)).toBeGreaterThan(0.75);
  });

  it("all easings are monotonically increasing", () => {
    for (const [name, fn] of Object.entries(EASINGS)) {
      let prev = fn(0);
      for (let t = 0.01; t <= 1.001; t += 0.01) {
        const val = fn(Math.min(t, 1));
        expect(val, `${name} at t=${t}`).toBeGreaterThanOrEqual(prev);
        prev = val;
      }
    }
  });
});

describe("collectAnimates", () => {
  it("accumulates values", () => {
    let result: string[] = [];
    result = collectAnimates("x=0:1", result);
    result = collectAnimates("y=0:100", result);
    expect(result).toEqual(["x=0:1", "y=0:100"]);
  });
});
