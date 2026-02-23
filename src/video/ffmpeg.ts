/**
 * ffmpeg detection, argument building, and process management for video encoding.
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";

/** Options for building ffmpeg command arguments. */
export interface FfmpegOptions {
  output: string;
  width: number;
  height: number;
  fps: number;
  format: "mp4" | "webm" | "gif";
  codec: string;
  quality: number;
  loop: number;
}

/**
 * Find the ffmpeg binary path.
 * Checks GENART_FFMPEG_PATH env var first, then system PATH via `which`.
 */
export function findFfmpeg(): string {
  const envPath = process.env["GENART_FFMPEG_PATH"];
  if (envPath) return envPath;

  try {
    return execSync("which ffmpeg", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      "ffmpeg not found. Install ffmpeg or set GENART_FFMPEG_PATH.\n" +
        "  macOS: brew install ffmpeg\n" +
        "  Linux: sudo apt install ffmpeg\n" +
        "  Or: GENART_FFMPEG_PATH=/path/to/ffmpeg genart video ...",
    );
  }
}

/**
 * Convert a quality value (0–100) to a CRF value for the given codec.
 * Higher quality = lower CRF (better quality).
 */
export function qualityToCrf(quality: number, codec: string): number {
  const maxCrf = codec === "libvpx-vp9" ? 63 : 51;
  return Math.round(((100 - quality) * maxCrf) / 100);
}

/** Map user-facing codec name to ffmpeg codec identifier. */
function resolveCodec(codec: string): string {
  const map: Record<string, string> = {
    h264: "libx264",
    h265: "libx265",
    vp9: "libvpx-vp9",
  };
  return map[codec] ?? codec;
}

/**
 * Build ffmpeg command-line arguments for encoding piped PNG frames.
 */
export function buildFfmpegArgs(opts: FfmpegOptions): string[] {
  const args: string[] = [
    // Input: piped PNG frames
    "-f", "image2pipe",
    "-framerate", String(opts.fps),
    "-i", "pipe:0",
    // Overwrite output
    "-y",
  ];

  if (opts.format === "gif") {
    // Simple single-pass GIF encoding
    args.push("-vf", `fps=${opts.fps}`);
    if (opts.loop !== undefined) {
      args.push("-loop", String(opts.loop));
    }
  } else {
    const ffCodec = resolveCodec(opts.codec);
    const crf = qualityToCrf(opts.quality, ffCodec);

    args.push("-c:v", ffCodec, "-crf", String(crf));

    if (ffCodec === "libx264" || ffCodec === "libx265") {
      args.push("-pix_fmt", "yuv420p");
    }
    if (ffCodec === "libx264") {
      args.push("-movflags", "+faststart");
    }
  }

  args.push(opts.output);
  return args;
}

/**
 * Spawn an ffmpeg process with the given arguments.
 * Stdin is piped for frame data; stdout/stderr are piped for capture.
 */
export function spawnFfmpeg(ffmpegPath: string, args: string[]): ChildProcess {
  return spawn(ffmpegPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}
