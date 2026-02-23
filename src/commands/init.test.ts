import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGenart } from "@genart-dev/format";

describe("init command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "genart-init-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("scaffolds a .genart file with flags (non-interactive)", async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      const { initCommand } = await import("./init.js");
      await initCommand.parseAsync([
        "node", "init", "My Test",
        "--renderer", "p5",
        "--preset", "square-600",
        "--title", "My Test",
      ]);

      const outputPath = join(tmpDir, "my-test.genart");
      const raw = await readFile(outputPath, "utf-8");
      const sketch = parseGenart(JSON.parse(raw));

      expect(sketch.id).toBe("my-test");
      expect(sketch.title).toBe("My Test");
      expect(sketch.renderer.type).toBe("p5");
      expect(sketch.canvas.width).toBe(600);
      expect(sketch.canvas.height).toBe(600);
      expect(sketch.algorithm).toBeTruthy();
      expect(sketch.algorithm).toContain("function sketch");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("creates different renderers", async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      for (const renderer of ["canvas2d", "three", "glsl", "svg"] as const) {
        const { initCommand } = await import("./init.js");
        await initCommand.parseAsync([
          "node", "init",
          "--renderer", renderer,
          "--preset", "square-600",
          "--title", `Test ${renderer}`,
        ]);

        const id = `test-${renderer}`;
        const outputPath = join(tmpDir, `${id}.genart`);
        const raw = await readFile(outputPath, "utf-8");
        const sketch = parseGenart(JSON.parse(raw));
        expect(sketch.renderer.type).toBe(renderer);
        expect(sketch.algorithm).toBeTruthy();
      }
    } finally {
      process.chdir(origCwd);
    }
  });
});
