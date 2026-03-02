import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeGenart, parseGenart, type SketchDefinition } from "@genart-dev/format";

describe("eject command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "genart-eject-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  function createSketch(overrides: Partial<SketchDefinition> = {}): SketchDefinition {
    return {
      genart: "1.1",
      id: "test-sketch",
      title: "Test Sketch",
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-01T00:00:00.000Z",
      renderer: { type: "p5" },
      canvas: { width: 600, height: 600, preset: "square-600" },
      parameters: [
        { key: "size", label: "Size", min: 0, max: 1, step: 0.01, default: 0.5 },
      ],
      colors: [
        { key: "bg", label: "Background", default: "#1a1a1a" },
      ],
      state: {
        seed: 42,
        params: { size: 0.5 },
        colorPalette: ["#1a1a1a"],
      },
      algorithm: `function sketch(p, state) {
  p.setup = () => { p.createCanvas(600, 600); };
  p.draw = () => { p.background(0); };
}`,
      ...overrides,
    };
  }

  it("ejects a .genart file to a project directory", async () => {
    const sketch = createSketch();
    const genartPath = join(tmpDir, "test-sketch.genart");
    await writeFile(genartPath, serializeGenart(sketch));

    const outputDir = join(tmpDir, "output");
    const { ejectCommand } = await import("./eject.js");
    await ejectCommand.parseAsync(["node", "eject", genartPath, "-o", outputDir]);

    expect(process.exitCode).toBeUndefined();

    // Check files created
    const sketchJs = await readFile(join(outputDir, "sketch.js"), "utf-8");
    expect(sketchJs).toContain("function sketch");

    const metaRaw = await readFile(join(outputDir, "sketch.meta.json"), "utf-8");
    const meta = JSON.parse(metaRaw);
    expect(meta.title).toBe("Test Sketch");
    expect(meta.renderer.type).toBe("p5");
  });

  it("ejects a GLSL sketch with sketch.frag", async () => {
    const sketch = createSketch({
      renderer: { type: "glsl" },
      algorithm: `precision highp float;
uniform vec2 u_resolution;
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`,
    });
    const genartPath = join(tmpDir, "test-glsl.genart");
    await writeFile(genartPath, serializeGenart(sketch));

    const outputDir = join(tmpDir, "output");
    const { ejectCommand } = await import("./eject.js");
    await ejectCommand.parseAsync(["node", "eject", genartPath, "-o", outputDir]);

    expect(process.exitCode).toBeUndefined();
    const fragSource = await readFile(join(outputDir, "sketch.frag"), "utf-8");
    expect(fragSource).toContain("gl_FragColor");
  });

  it("ejects sketch with inline components to files", async () => {
    const sketch = createSketch({
      components: {
        helpers: {
          code: `function drawDot(ctx, x, y, r) { /* ... */ }`,
          exports: ["drawDot"],
        },
      },
    });
    const genartPath = join(tmpDir, "test-comp.genart");
    await writeFile(genartPath, serializeGenart(sketch));

    const outputDir = join(tmpDir, "output");
    const { ejectCommand } = await import("./eject.js");
    await ejectCommand.parseAsync(["node", "eject", genartPath, "-o", outputDir]);

    expect(process.exitCode).toBeUndefined();
    const componentFiles = await readdir(join(outputDir, "components"));
    expect(componentFiles).toContain("helpers.js");

    const helperSource = await readFile(join(outputDir, "components", "helpers.js"), "utf-8");
    expect(helperSource).toContain("@exports: drawDot");
    expect(helperSource).toContain("drawDot");
  });

  it("refuses to overwrite without --force", async () => {
    const sketch = createSketch();
    const genartPath = join(tmpDir, "test-sketch.genart");
    await writeFile(genartPath, serializeGenart(sketch));

    // Create the output directory first
    const outputDir = join(tmpDir, "output");
    const { mkdir: mkdirFs } = await import("node:fs/promises");
    await mkdirFs(outputDir, { recursive: true });

    const { ejectCommand } = await import("./eject.js");
    await ejectCommand.parseAsync(["node", "eject", genartPath, "-o", outputDir]);

    expect(process.exitCode).toBe(1);
  });

  it("overwrites with --force", async () => {
    const sketch = createSketch();
    const genartPath = join(tmpDir, "test-sketch.genart");
    await writeFile(genartPath, serializeGenart(sketch));

    // Create the output directory first
    const outputDir = join(tmpDir, "output");
    const { mkdir: mkdirFs } = await import("node:fs/promises");
    await mkdirFs(outputDir, { recursive: true });

    const { ejectCommand } = await import("./eject.js");
    await ejectCommand.parseAsync(["node", "eject", genartPath, "-o", outputDir, "--force"]);

    expect(process.exitCode).toBeUndefined();
    const sketchJs = await readFile(join(outputDir, "sketch.js"), "utf-8");
    expect(sketchJs).toContain("function sketch");
  });
});
