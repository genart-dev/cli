import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("import command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(resolve(tmpdir(), "genart-import-"));
  });

  it("imports a p5 sketch file non-interactively", async () => {
    const source = `
function sketch(p, state) {
  const { WIDTH, HEIGHT, SEED, PARAMS, COLORS } = state;
  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    p.randomSeed(SEED);
  };
  p.draw = () => {
    p.background(COLORS[0]);
    p.fill(COLORS[1]);
    const amp = PARAMS.amplitude;
    p.ellipse(WIDTH / 2, HEIGHT / 2, amp * 100);
  };
  return { initializeSystem() {} };
}
    `.trim();

    const srcFile = resolve(tmpDir, "particles.js");
    await writeFile(srcFile, source, "utf-8");

    const outputPath = resolve(tmpDir, "particles.genart");

    const { importCommand } = await import("./import.js");
    await importCommand.parseAsync([
      "node", "import", srcFile,
      "--non-interactive",
      "--seed", "42",
      "-o", outputPath,
    ]);

    const result = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(result.genart).toBe("1.0");
    expect(result.renderer.type).toBe("p5");
    expect(result.state.seed).toBe(42);
    // Should detect amplitude parameter
    expect(result.parameters.some((p: { key: string }) => p.key === "amplitude")).toBe(true);
    // Should detect 2 color slots (COLORS[0], COLORS[1])
    expect(result.colors).toHaveLength(2);
    // Algorithm should be the raw source
    expect(result.algorithm).toContain("function sketch(p, state)");
  });

  it("imports a GLSL shader from file extension hint", async () => {
    const source = `
#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}
    `.trim();

    const srcFile = resolve(tmpDir, "shader.glsl");
    await writeFile(srcFile, source, "utf-8");

    const outputPath = resolve(tmpDir, "shader.genart");

    const { importCommand } = await import("./import.js");
    await importCommand.parseAsync([
      "node", "import", srcFile,
      "--non-interactive",
      "-o", outputPath,
    ]);

    const result = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(result.renderer.type).toBe("glsl");
    expect(result.algorithm).toContain("#version 300 es");
  });

  it("respects --renderer override", async () => {
    const source = `// some ambiguous code`;

    const srcFile = resolve(tmpDir, "sketch.js");
    await writeFile(srcFile, source, "utf-8");

    const outputPath = resolve(tmpDir, "sketch.genart");

    const { importCommand } = await import("./import.js");
    await importCommand.parseAsync([
      "node", "import", srcFile,
      "--renderer", "canvas2d",
      "--non-interactive",
      "-o", outputPath,
    ]);

    const result = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(result.renderer.type).toBe("canvas2d");
  });

  it("supports --dry-run (no file written)", async () => {
    const source = `
function sketch(p, state) {
  p.setup = () => { p.createCanvas(600, 600); };
  p.draw = () => { p.background(0); };
  return { initializeSystem() {} };
}
    `.trim();

    const srcFile = resolve(tmpDir, "dry.js");
    await writeFile(srcFile, source, "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { importCommand } = await import("./import.js");
    await importCommand.parseAsync([
      "node", "import", srcFile,
      "--non-interactive",
      "--dry-run",
    ]);

    // Should have logged the serialized sketch
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"genart"'));

    logSpy.mockRestore();
  });

  it("auto-detects title from filename", async () => {
    const source = `function sketch(p, state) { p.setup = () => { p.createCanvas(600, 600); }; return { initializeSystem() {} }; }`;

    const srcFile = resolve(tmpDir, "my-cool-sketch.js");
    await writeFile(srcFile, source, "utf-8");

    const outputPath = resolve(tmpDir, "my-cool-sketch.genart");

    const { importCommand } = await import("./import.js");
    await importCommand.parseAsync([
      "node", "import", srcFile,
      "--non-interactive",
      "-o", outputPath,
    ]);

    const result = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(result.title).toBe("My Cool Sketch");
    expect(result.id).toBe("my-cool-sketch");
  });
});
