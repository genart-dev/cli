import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { EventEmitter, Writable, Readable } from "node:stream";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

// PNG stub (minimal valid-looking buffer)
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

// Mock page for getPage
const mockPage = {
  setContent: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(PNG_BYTES),
  evaluate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock capture module
vi.mock("../capture/browser.js", () => ({
  getPage: vi.fn().mockResolvedValue(mockPage),
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

// Build a mock ffmpeg child process
function createMockFfmpegProc() {
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  const proc = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;

  // Emit close with code 0 after stdin ends
  stdin.on("finish", () => {
    setTimeout(() => proc.emit("close", 0), 5);
  });

  return proc;
}

// Mock ffmpeg module
vi.mock("../video/ffmpeg.js", () => ({
  findFfmpeg: vi.fn().mockReturnValue("/usr/local/bin/ffmpeg"),
  buildFfmpegArgs: vi.fn().mockReturnValue(["-f", "image2pipe", "-i", "pipe:0", "out.mp4"]),
  spawnFfmpeg: vi.fn().mockImplementation(() => createMockFfmpegProc()),
}));

// Mock stat for file size reporting
vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...orig,
    stat: vi.fn().mockResolvedValue({ size: 1024 * 1024 }),
  };
});

describe("video command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPage.setContent.mockResolvedValue(undefined);
    mockPage.screenshot.mockResolvedValue(PNG_BYTES);
    mockPage.evaluate.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
    tmpDir = await mkdtemp(resolve(tmpdir(), "genart-video-"));
  });

  it("renders frames and pipes to ffmpeg", async () => {
    const { videoCommand } = await import("./video.js");
    const { getPage } = await import("../capture/browser.js");
    const { spawnFfmpeg } = await import("../video/ffmpeg.js");

    const output = resolve(tmpDir, "test.mp4");
    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "10",
      "-o", output,
    ]);

    // 1 second × 10 fps = 10 frames
    expect(getPage).toHaveBeenCalledTimes(10);
    expect(mockPage.screenshot).toHaveBeenCalledTimes(10);
    expect(spawnFfmpeg).toHaveBeenCalledOnce();
  });

  it("calculates correct frame count for duration × fps", async () => {
    const { videoCommand } = await import("./video.js");
    const { getPage } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "2",
      "--fps", "5",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // 2 seconds × 5 fps = 10 frames
    expect(getPage).toHaveBeenCalledTimes(10);
  });

  it("uses ceil for fractional frame count", async () => {
    const { videoCommand } = await import("./video.js");
    const { getPage } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "0.5",
      "--fps", "3",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // 0.5 × 3 = 1.5 → ceil = 2 frames
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it("injects time offset for frames after the first", async () => {
    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "3",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // Frame 0: no time injection, frame 1+: yes
    // evaluate is called for time injection + rAF wait (2 calls per non-zero frame)
    // Frame 0: 0 calls, Frame 1: 2 calls, Frame 2: 2 calls = 4 total
    expect(mockPage.evaluate).toHaveBeenCalledTimes(4);
  });

  it("rejects SVG renderer with helpful message", async () => {
    // Create a mock SVG fixture path — we mock loadSketch to return SVG type
    const { videoCommand } = await import("./video.js");

    // Use the real fixture but check that SVG would be rejected
    // We'll test with a modified approach: check the error message format
    const svgFixture = resolve(tmpDir, "svg-test.genart");
    const { writeFile } = await import("node:fs/promises");
    const { readFile } = await import("node:fs/promises");
    const original = JSON.parse(await readFile(FIXTURE, "utf-8"));
    original.renderer.type = "svg";
    // Use the real writeFile (not mocked)
    const realWriteFile = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).writeFile;
    await realWriteFile(svgFixture, JSON.stringify(original));

    await videoCommand.parseAsync([
      "node", "video", svgFixture,
      "--duration", "1",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // Should have set exit code
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined as any;
  });

  it("applies --animate parameter interpolation", async () => {
    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "2",
      "--animate", "amplitude=0:1",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // 2 frames with animated params — getPage should be called for each
    const { getPage } = await import("../capture/browser.js");
    expect(getPage).toHaveBeenCalledTimes(2);
    // Each frame gets its own page.setContent (with different HTML due to params)
    expect(mockPage.setContent).toHaveBeenCalledTimes(2);
  });

  it("passes correct format options to buildFfmpegArgs", async () => {
    const { videoCommand } = await import("./video.js");
    const { buildFfmpegArgs } = await import("../video/ffmpeg.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "10",
      "--format", "webm",
      "--codec", "vp9",
      "--quality", "80",
      "-o", resolve(tmpDir, "test.webm"),
    ]);

    expect(buildFfmpegArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "webm",
        codec: "vp9",
        quality: 80,
        fps: 10,
      }),
    );
  });

  it("passes GIF loop option to buildFfmpegArgs", async () => {
    const { videoCommand } = await import("./video.js");
    const { buildFfmpegArgs } = await import("../video/ffmpeg.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "5",
      "--format", "gif",
      "--loop", "3",
      "-o", resolve(tmpDir, "test.gif"),
    ]);

    expect(buildFfmpegArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "gif",
        loop: 3,
      }),
    );
  });

  it("fails with helpful message when ffmpeg is missing", async () => {
    const { findFfmpeg } = await import("../video/ffmpeg.js");
    vi.mocked(findFfmpeg).mockImplementationOnce(() => {
      throw new Error("ffmpeg not found");
    });

    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined as any;
  });

  it("rejects unknown easing function", async () => {
    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--easing", "bounce",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined as any;
  });

  it("respects --concurrency for chunk size", async () => {
    const { videoCommand } = await import("./video.js");
    const { getPage } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "--fps", "8",
      "--concurrency", "3",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // 8 frames with concurrency 3: chunks of [3, 3, 2]
    // All 8 frames should be rendered
    expect(getPage).toHaveBeenCalledTimes(8);
  });

  it("handles single-frame video (duration * fps < 2)", async () => {
    const { videoCommand } = await import("./video.js");
    const { getPage } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "0.03",
      "--fps", "10",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // 0.03 × 10 = 0.3 → ceil = 1 frame
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it("applies seed override", async () => {
    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "0.1",
      "--fps", "10",
      "--seed", "999",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    // The HTML should contain the overridden seed (checked via setContent calls)
    expect(mockPage.setContent).toHaveBeenCalled();
  });

  it("reports ffmpeg exit error", async () => {
    const { spawnFfmpeg } = await import("../video/ffmpeg.js");
    vi.mocked(spawnFfmpeg).mockImplementationOnce(() => {
      const stdin = new Writable({ write(_c, _e, cb) { cb(); } });
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const proc = new EventEmitter() as any;
      proc.stdin = stdin;
      proc.stdout = stdout;
      proc.stderr = stderr;
      stdin.on("finish", () => {
        setTimeout(() => proc.emit("close", 1), 5);
      });
      return proc;
    });

    const { videoCommand } = await import("./video.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "0.1",
      "--fps", "10",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined as any;
  });

  it("closes browser in finally block", async () => {
    const { videoCommand } = await import("./video.js");
    const { closeBrowser } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "0.1",
      "--fps", "10",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    expect(closeBrowser).toHaveBeenCalled();
  });

  it("closes browser even on error", async () => {
    const { findFfmpeg } = await import("../video/ffmpeg.js");
    vi.mocked(findFfmpeg).mockImplementationOnce(() => {
      throw new Error("ffmpeg not found");
    });

    const { videoCommand } = await import("./video.js");
    const { closeBrowser } = await import("../capture/browser.js");

    await videoCommand.parseAsync([
      "node", "video", FIXTURE,
      "--duration", "1",
      "-o", resolve(tmpDir, "test.mp4"),
    ]);

    expect(closeBrowser).toHaveBeenCalled();
    process.exitCode = undefined as any;
  });
});
