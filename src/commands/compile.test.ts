import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGenart } from "@genart-dev/format";

describe("compile command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "genart-compile-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("compiles a minimal project", async () => {
    // Create project files
    await writeFile(
      join(tmpDir, "sketch.js"),
      `function sketch(p, state) {
  p.setup = () => { p.createCanvas(600, 600); };
  p.draw = () => { p.background(0); };
}`,
    );
    await writeFile(
      join(tmpDir, "sketch.meta.json"),
      JSON.stringify({
        title: "Test Sketch",
        renderer: { type: "p5" },
        canvas: { preset: "square-600" },
        parameters: [],
        colors: [],
      }),
    );

    const { compileCommand } = await import("./compile.js");
    await compileCommand.parseAsync(["node", "compile", tmpDir]);

    expect(process.exitCode).toBeUndefined();

    const outputPath = join(tmpDir, "sketch.genart");
    const raw = await readFile(outputPath, "utf-8");
    const sketch = parseGenart(JSON.parse(raw));

    expect(sketch.title).toBe("Test Sketch");
    expect(sketch.renderer.type).toBe("p5");
    expect(sketch.algorithm).toContain("function sketch");
  });

  it("compiles with custom output path", async () => {
    await writeFile(
      join(tmpDir, "sketch.js"),
      `function sketch(p, state) {
  p.setup = () => { p.createCanvas(600, 600); };
  p.draw = () => { p.background(0); };
}`,
    );
    await writeFile(
      join(tmpDir, "sketch.meta.json"),
      JSON.stringify({
        title: "Custom Output",
        renderer: { type: "p5" },
        canvas: { preset: "square-600" },
      }),
    );

    const outputPath = join(tmpDir, "custom.genart");
    const { compileCommand } = await import("./compile.js");
    await compileCommand.parseAsync(["node", "compile", tmpDir, "-o", outputPath]);

    expect(process.exitCode).toBeUndefined();

    const raw = await readFile(outputPath, "utf-8");
    const sketch = parseGenart(JSON.parse(raw));
    expect(sketch.title).toBe("Custom Output");
  });

  it("compiles project with local components", async () => {
    await writeFile(
      join(tmpDir, "sketch.js"),
      `function sketch(ctx, state) {
  const { WIDTH, HEIGHT } = state;
  ctx.canvas.width = WIDTH;
  ctx.canvas.height = HEIGHT;
  drawDot(ctx, WIDTH / 2, HEIGHT / 2, 10);
}`,
    );
    await writeFile(
      join(tmpDir, "sketch.meta.json"),
      JSON.stringify({
        title: "With Components",
        renderer: { type: "canvas2d" },
        canvas: { width: 800, height: 600 },
        parameters: [],
        colors: [],
      }),
    );

    const componentsDir = join(tmpDir, "components");
    await mkdir(componentsDir);
    await writeFile(
      join(componentsDir, "helpers.js"),
      `// @exports: drawDot

function drawDot(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}`,
    );

    const { compileCommand } = await import("./compile.js");
    await compileCommand.parseAsync(["node", "compile", tmpDir]);

    expect(process.exitCode).toBeUndefined();

    const raw = await readFile(join(tmpDir, "sketch.genart"), "utf-8");
    const sketch = parseGenart(JSON.parse(raw));
    expect(sketch.components).toBeDefined();
    expect(sketch.components!["helpers"]).toBeDefined();
    expect((sketch.components!["helpers"] as { exports: string[] }).exports).toContain("drawDot");
  });

  it("exits with error for invalid project", async () => {
    // No sketch file, no meta
    const { compileCommand } = await import("./compile.js");
    await compileCommand.parseAsync(["node", "compile", tmpDir]);

    expect(process.exitCode).toBe(1);
  });

  it("exits with error for missing meta", async () => {
    await writeFile(join(tmpDir, "sketch.js"), "function sketch(p, state) {}");

    const { compileCommand } = await import("./compile.js");
    await compileCommand.parseAsync(["node", "compile", tmpDir]);

    expect(process.exitCode).toBe(1);
  });
});
