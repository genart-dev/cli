import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

// Mock capture for image export
vi.mock("../capture/browser.js", () => ({
  captureHtml: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    mimeType: "image/png",
    width: 600,
    height: 600,
  }),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

// Mock writeFile
vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...orig,
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

describe("export command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports as HTML", async () => {
    const { exportCommand } = await import("./export.js");
    const { writeFile } = await import("node:fs/promises");

    await exportCommand.parseAsync([
      "node", "export", FIXTURE,
      "--format", "html",
      "-o", "/tmp/test.html",
    ]);

    expect(writeFile).toHaveBeenCalledOnce();
    const [, content] = vi.mocked(writeFile).mock.calls[0]! as [string, string, string];
    expect(content).toContain("<!DOCTYPE html>");
  });

  it("exports algorithm source", async () => {
    const { exportCommand } = await import("./export.js");
    const { writeFile } = await import("node:fs/promises");

    await exportCommand.parseAsync([
      "node", "export", FIXTURE,
      "--format", "algorithm",
      "-o", "/tmp/test.js",
    ]);

    expect(writeFile).toHaveBeenCalledOnce();
    const [, content] = vi.mocked(writeFile).mock.calls[0]! as [string, string, string];
    expect(content).toContain("function sketch");
  });

  it("exports as PNG (uses capture)", async () => {
    const { exportCommand } = await import("./export.js");
    const { captureHtml } = await import("../capture/browser.js");

    await exportCommand.parseAsync([
      "node", "export", FIXTURE,
      "--format", "png",
      "-o", "/tmp/test.png",
    ]);

    expect(captureHtml).toHaveBeenCalledOnce();
  });
});
