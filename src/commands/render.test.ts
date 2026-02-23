import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

// Mock the capture module to avoid needing Chrome
vi.mock("../capture/browser.js", () => ({
  captureHtml: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
    mimeType: "image/png",
    width: 600,
    height: 600,
  }),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

// Mock writeFile to avoid writing to disk
vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...orig,
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

describe("render command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a sketch to PNG", async () => {
    const { renderCommand } = await import("./render.js");
    const { captureHtml } = await import("../capture/browser.js");
    const { writeFile } = await import("node:fs/promises");

    await renderCommand.parseAsync(["node", "render", FIXTURE, "-o", "/tmp/test.png"]);

    expect(captureHtml).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(captureHtml).mock.calls[0]![0];
    expect(callArgs.width).toBe(600);
    expect(callArgs.height).toBe(600);
    expect(callArgs.format).toBe("png");
    expect(callArgs.html).toContain("<!DOCTYPE html>");

    expect(writeFile).toHaveBeenCalledOnce();
  });

  it("applies overrides", async () => {
    const { renderCommand } = await import("./render.js");
    const { captureHtml } = await import("../capture/browser.js");

    await renderCommand.parseAsync([
      "node", "render", FIXTURE,
      "--width", "800",
      "--height", "400",
      "--seed", "99",
      "--wait", "1s",
      "--format", "jpeg",
      "--quality", "90",
      "-o", "/tmp/test.jpg",
    ]);

    expect(captureHtml).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(captureHtml).mock.calls[0]![0];
    expect(callArgs.width).toBe(800);
    expect(callArgs.height).toBe(400);
    expect(callArgs.waitMs).toBe(1000);
    expect(callArgs.format).toBe("jpeg");
    expect(callArgs.quality).toBe(90);
  });
});
