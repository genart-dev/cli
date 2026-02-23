import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadSketch } from "./load-sketch.js";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

describe("loadSketch", () => {
  it("loads and parses a valid .genart file", async () => {
    const sketch = await loadSketch(FIXTURE);
    expect(sketch.id).toBe("test-sketch");
    expect(sketch.title).toBe("Test Sketch");
    expect(sketch.renderer.type).toBe("p5");
    expect(sketch.canvas.width).toBe(600);
    expect(sketch.canvas.height).toBe(600);
    expect(sketch.state.seed).toBe(42);
    expect(sketch.parameters).toHaveLength(2);
    expect(sketch.colors).toHaveLength(2);
  });

  it("throws on nonexistent file", async () => {
    await expect(loadSketch("/nonexistent/file.genart")).rejects.toThrow();
  });
});
