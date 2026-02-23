import { describe, it, expect } from "vitest";
import { applyOverrides } from "./apply-overrides.js";
import type { SketchDefinition } from "@genart-dev/format";

const baseSketch: SketchDefinition = {
  genart: "1.0",
  id: "test",
  title: "Test",
  created: "2026-01-01T00:00:00Z",
  modified: "2026-01-01T00:00:00Z",
  renderer: { type: "p5" },
  canvas: { preset: "square-600", width: 600, height: 600 },
  parameters: [
    { key: "amp", label: "Amp", min: 0, max: 1, step: 0.1, default: 0.5 },
  ],
  colors: [
    { key: "bg", label: "BG", default: "#000000" },
  ],
  state: { seed: 42, params: { amp: 0.5 }, colorPalette: ["#000000"] },
  algorithm: "",
};

describe("applyOverrides", () => {
  it("returns same values when no overrides", () => {
    const result = applyOverrides(baseSketch, {});
    expect(result.canvas.width).toBe(600);
    expect(result.state.seed).toBe(42);
  });

  it("overrides seed", () => {
    const result = applyOverrides(baseSketch, { seed: 99 });
    expect(result.state.seed).toBe(99);
  });

  it("overrides width and height", () => {
    const result = applyOverrides(baseSketch, { width: 800, height: 400 });
    expect(result.canvas.width).toBe(800);
    expect(result.canvas.height).toBe(400);
  });

  it("overrides preset", () => {
    const result = applyOverrides(baseSketch, { preset: "square-1200" });
    expect(result.canvas.width).toBe(1200);
    expect(result.canvas.height).toBe(1200);
    expect(result.canvas.preset).toBe("square-1200");
  });

  it("explicit width overrides preset", () => {
    const result = applyOverrides(baseSketch, { preset: "square-1200", width: 999 });
    expect(result.canvas.width).toBe(999);
    expect(result.canvas.height).toBe(1200);
  });

  it("overrides params (merge)", () => {
    const result = applyOverrides(baseSketch, { params: { amp: 0.8 } });
    expect(result.state.params["amp"]).toBe(0.8);
  });

  it("overrides colors (replace palette)", () => {
    const result = applyOverrides(baseSketch, { colors: ["#FF0000", "#00FF00"] });
    expect(result.state.colorPalette).toEqual(["#FF0000", "#00FF00"]);
  });

  it("does not mutate original sketch", () => {
    applyOverrides(baseSketch, { seed: 99, width: 800 });
    expect(baseSketch.state.seed).toBe(42);
    expect(baseSketch.canvas.width).toBe(600);
  });
});
