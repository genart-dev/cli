import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

// Mock capture to avoid needing Chrome
vi.mock("../capture/browser.js", () => ({
  captureHtml: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    mimeType: "image/png",
    width: 600,
    height: 600,
  }),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

describe("batch command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(resolve(tmpdir(), "genart-batch-"));
  });

  it("generates renders for a seed range", async () => {
    const { batchCommand } = await import("./batch.js");
    const { captureHtml } = await import("../capture/browser.js");

    await batchCommand.parseAsync([
      "node", "batch", FIXTURE,
      "--seeds", "1-3",
      "-o", tmpDir,
    ]);

    expect(captureHtml).toHaveBeenCalledTimes(3);

    const files = await readdir(tmpDir);
    const pngs = files.filter((f) => f.endsWith(".png"));
    expect(pngs).toHaveLength(3);
    expect(pngs).toContain("test-sketch-1.png");
    expect(pngs).toContain("test-sketch-2.png");
    expect(pngs).toContain("test-sketch-3.png");
  });

  it("generates renders for comma-separated seeds", async () => {
    const { batchCommand } = await import("./batch.js");
    const { captureHtml } = await import("../capture/browser.js");

    await batchCommand.parseAsync([
      "node", "batch", FIXTURE,
      "--seeds", "10,20,30",
      "-o", tmpDir,
    ]);

    expect(captureHtml).toHaveBeenCalledTimes(3);
    const files = await readdir(tmpDir);
    expect(files).toContain("test-sketch-10.png");
    expect(files).toContain("test-sketch-20.png");
    expect(files).toContain("test-sketch-30.png");
  });

  it("writes manifest.json when --manifest is set", async () => {
    const { batchCommand } = await import("./batch.js");

    // Capture stdout for manifest pipe output
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await batchCommand.parseAsync([
      "node", "batch", FIXTURE,
      "--seeds", "1-2",
      "--manifest",
      "-o", tmpDir,
    ]);

    const files = await readdir(tmpDir);
    expect(files).toContain("manifest.json");

    const manifest = JSON.parse(await readFile(resolve(tmpDir, "manifest.json"), "utf-8"));
    expect(manifest).toHaveLength(2);
    const seeds = manifest.map((e: any) => e.seed).sort();
    expect(seeds).toEqual([1, 2]);
    expect(manifest[0].width).toBe(600);

    // Verify stdout pipe output
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"seed"'));

    logSpy.mockRestore();
  });

  it("applies parameter sweeps with --matrix", async () => {
    const { batchCommand } = await import("./batch.js");
    const { captureHtml } = await import("../capture/browser.js");

    await batchCommand.parseAsync([
      "node", "batch", FIXTURE,
      "--seeds", "1-2",
      "--sweep", "amplitude=0:1:1",
      "--matrix",
      "-o", tmpDir,
    ]);

    // 2 seeds × 2 amplitude values (0, 1) = 4 renders
    expect(captureHtml).toHaveBeenCalledTimes(4);
  });

  it("respects --naming pattern", async () => {
    const { batchCommand } = await import("./batch.js");

    await batchCommand.parseAsync([
      "node", "batch", FIXTURE,
      "--seeds", "42",
      "--naming", "{id}-seed{seed}-{index}",
      "-o", tmpDir,
    ]);

    const files = await readdir(tmpDir);
    expect(files).toContain("test-sketch-seed42-0000.png");
  });
});
