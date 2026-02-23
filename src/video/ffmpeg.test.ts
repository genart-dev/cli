import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findFfmpeg, buildFfmpegArgs, qualityToCrf, type FfmpegOptions } from "./ffmpeg.js";

// Mock child_process execSync for findFfmpeg tests
vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  return {
    ...orig,
    execSync: vi.fn().mockReturnValue("/usr/local/bin/ffmpeg\n"),
    spawn: vi.fn().mockReturnValue({
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    }),
  };
});

describe("findFfmpeg", () => {
  const originalEnv = process.env["GENART_FFMPEG_PATH"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["GENART_FFMPEG_PATH"] = originalEnv;
    } else {
      delete process.env["GENART_FFMPEG_PATH"];
    }
  });

  it("returns env var path when GENART_FFMPEG_PATH is set", () => {
    process.env["GENART_FFMPEG_PATH"] = "/custom/ffmpeg";
    expect(findFfmpeg()).toBe("/custom/ffmpeg");
  });

  it("falls back to system PATH via which", async () => {
    delete process.env["GENART_FFMPEG_PATH"];
    expect(findFfmpeg()).toBe("/usr/local/bin/ffmpeg");
  });

  it("throws helpful error when ffmpeg is not found", async () => {
    delete process.env["GENART_FFMPEG_PATH"];
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error("not found");
    });
    expect(() => findFfmpeg()).toThrow(/ffmpeg not found.*brew install ffmpeg/s);
  });
});

describe("qualityToCrf", () => {
  it("maps quality 100 → CRF 0 for h264", () => {
    expect(qualityToCrf(100, "libx264")).toBe(0);
  });

  it("maps quality 0 → CRF 51 for h264", () => {
    expect(qualityToCrf(0, "libx264")).toBe(51);
  });

  it("maps quality 75 → CRF 13 for h264", () => {
    expect(qualityToCrf(75, "libx264")).toBe(13);
  });

  it("maps quality 50 → CRF 26 for h264", () => {
    expect(qualityToCrf(50, "libx264")).toBe(26);
  });

  it("uses maxCrf 63 for vp9", () => {
    expect(qualityToCrf(0, "libvpx-vp9")).toBe(63);
    expect(qualityToCrf(100, "libvpx-vp9")).toBe(0);
    expect(qualityToCrf(50, "libvpx-vp9")).toBe(32);
  });

  it("uses maxCrf 51 for h265", () => {
    expect(qualityToCrf(0, "libx265")).toBe(51);
    expect(qualityToCrf(100, "libx265")).toBe(0);
  });
});

describe("buildFfmpegArgs", () => {
  const baseOpts: FfmpegOptions = {
    output: "out.mp4",
    width: 600,
    height: 600,
    fps: 30,
    format: "mp4",
    codec: "h264",
    quality: 75,
    loop: 0,
  };

  it("builds mp4/h264 args with yuv420p and faststart", () => {
    const args = buildFfmpegArgs(baseOpts);
    expect(args).toContain("-f");
    expect(args).toContain("image2pipe");
    expect(args).toContain("-framerate");
    expect(args).toContain("30");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args).toContain("-crf");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("builds mp4/h265 args without faststart", () => {
    const args = buildFfmpegArgs({ ...baseOpts, codec: "h265" });
    expect(args).toContain("libx265");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
    expect(args).not.toContain("-movflags");
  });

  it("builds webm/vp9 args without pix_fmt", () => {
    const args = buildFfmpegArgs({
      ...baseOpts,
      format: "webm",
      codec: "vp9",
      output: "out.webm",
    });
    expect(args).toContain("libvpx-vp9");
    expect(args).not.toContain("-pix_fmt");
    expect(args).not.toContain("-movflags");
    expect(args[args.length - 1]).toBe("out.webm");
  });

  it("builds gif args with loop and fps filter", () => {
    const args = buildFfmpegArgs({
      ...baseOpts,
      format: "gif",
      output: "out.gif",
      loop: 0,
    });
    expect(args).toContain("-vf");
    expect(args).toContain("fps=30");
    expect(args).toContain("-loop");
    expect(args).toContain("0");
    expect(args).not.toContain("-c:v");
    expect(args[args.length - 1]).toBe("out.gif");
  });

  it("includes -y for overwrite", () => {
    const args = buildFfmpegArgs(baseOpts);
    expect(args).toContain("-y");
  });

  it("reads from pipe:0", () => {
    const args = buildFfmpegArgs(baseOpts);
    expect(args).toContain("pipe:0");
    expect(args).toContain("-i");
  });
});
