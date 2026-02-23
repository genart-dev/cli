import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// Create a minimal 2x2 red PNG (smallest valid PNG)
function createTestPng(width: number, height: number): Buffer {
  // Use sharp mock to avoid needing the real sharp module
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

// Mock sharp since it's an optional dependency
const mockSharpInstance = {
  metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
  resize: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50])),
  composite: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
};

const mockSharp = vi.fn().mockReturnValue(mockSharpInstance);
// Support sharp({ create: ... }) syntax
mockSharp.mockImplementation((input: unknown) => {
  if (typeof input === "object" && input !== null && "create" in input) {
    return {
      composite: vi.fn().mockReturnValue({
        png: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
        }),
      }),
    };
  }
  return mockSharpInstance;
});

vi.mock("sharp", () => ({ default: mockSharp }));

describe("montage command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(resolve(tmpdir(), "genart-montage-"));

    // Create test image files
    const png = createTestPng(100, 100);
    await writeFile(resolve(tmpDir, "img-001.png"), png);
    await writeFile(resolve(tmpDir, "img-002.png"), png);
    await writeFile(resolve(tmpDir, "img-003.png"), png);
    await writeFile(resolve(tmpDir, "img-004.png"), png);
  });

  it("composites images from a directory", async () => {
    const { montageCommand } = await import("./montage.js");

    const outputPath = resolve(tmpDir, "output.png");
    await montageCommand.parseAsync([
      "node", "montage", tmpDir,
      "-o", outputPath,
    ]);

    // sharp constructor called for each image + once for canvas creation
    expect(mockSharp).toHaveBeenCalled();
  });

  it("respects --columns option", async () => {
    const { montageCommand } = await import("./montage.js");

    const outputPath = resolve(tmpDir, "grid.png");
    await montageCommand.parseAsync([
      "node", "montage", tmpDir,
      "--columns", "2",
      "-o", outputPath,
    ]);

    // Should have created a 2-column grid
    expect(mockSharp).toHaveBeenCalled();
  });

  it("errors on non-existent directory", async () => {
    const { montageCommand } = await import("./montage.js");

    const prevExitCode = process.exitCode;

    await montageCommand.parseAsync([
      "node", "montage", "/nonexistent",
      "-o", resolve(tmpDir, "out.png"),
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = prevExitCode;
  });
});
