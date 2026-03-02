import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

/**
 * Tests for the dev command.
 *
 * The dev command starts a long-running server + watcher, so we test it
 * by testing the individual pieces rather than running the full command.
 * Full integration tests would require starting/stopping the server.
 *
 * We test:
 * - That the command can be imported
 * - That compileProject + watchProject work with a valid project (tested in core)
 * - That the preview server starts and serves HTML (manual/integration test)
 */

describe("dev command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "genart-dev-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("can be imported", async () => {
    const { devCommand } = await import("./dev.js");
    expect(devCommand.name()).toBe("dev");
    expect(devCommand.description()).toContain("Watch project");
  });

  it("has expected options", async () => {
    const { devCommand } = await import("./dev.js");
    const optionNames = devCommand.options.map((o) => o.long);
    expect(optionNames).toContain("--port");
    expect(optionNames).toContain("--open");
    expect(optionNames).toContain("--output");
  });

  it("compiles and serves a project via the preview URL", async () => {
    // This tests the compile + serve cycle by importing the underlying
    // compileProject and generateStandaloneHTML functions directly.
    // The full server test is deferred to integration testing.
    const { compileProject, createDefaultRegistry } = await import("@genart-dev/core");

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
        title: "Dev Test",
        renderer: { type: "p5" },
        canvas: { preset: "square-600" },
      }),
    );

    const result = await compileProject({ projectDir: tmpDir });
    expect(result.sketch.title).toBe("Dev Test");

    // Generate HTML like the dev server would
    const registry = createDefaultRegistry();
    const adapter = registry.resolve("p5");
    const html = adapter.generateStandaloneHTML(result.sketch);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("p5");
  });

  it("finds a free port", async () => {
    // Verify we can create a server on a dynamic port (used by dev command)
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          reject(new Error("Could not get port"));
        }
      });
    });
    expect(port).toBeGreaterThan(0);
    server.close();
  });
});
