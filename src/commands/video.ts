import { Command } from "commander";
import { resolve, basename, extname } from "node:path";
import { stat } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import { loadSketch } from "../util/load-sketch.js";
import { applyOverrides, type SketchOverrides } from "../util/apply-overrides.js";
import { parseWait } from "../util/parse-wait.js";
import { getPage, closeBrowser } from "../capture/browser.js";
import {
  parseAnimate,
  interpolateParams,
  collectAnimates,
  EASINGS,
  type AnimateSpec,
} from "../video/interpolate.js";
import { findFfmpeg, buildFfmpegArgs, spawnFfmpeg } from "../video/ffmpeg.js";
import { injectTimeOffset } from "../video/time-inject.js";

export const videoCommand = new Command("video")
  .description("Render a video from an animated sketch")
  .argument("<file>", "Path to .genart file")
  .requiredOption("--duration <seconds>", "Video duration in seconds", Number)
  .option("--fps <n>", "Frames per second", Number, 30)
  .option("--format <fmt>", "Output format: mp4, webm, gif", "mp4")
  .option("--codec <name>", "Video codec: h264, h265, vp9", "h264")
  .option("--quality <n>", "Encoding quality (0-100)", Number, 75)
  .option(
    "--animate <spec>",
    "Interpolate parameter: param=start:end (repeatable)",
    collectAnimates,
    [],
  )
  .option("--easing <fn>", "Easing function: linear, ease-in, ease-out, ease-in-out", "linear")
  .option("--loop <n>", "GIF loop count (0=infinite)", Number, 0)
  .option("--concurrency <n>", "Parallel frame captures", Number, 4)
  .option("--wait <duration>", "Init wait before time injection", "200ms")
  .option("--seed <n>", "Override seed", Number)
  .option("--params <json>", "Override parameters (JSON object)")
  .option("--colors <json>", "Override color palette (JSON array)")
  .option("--width <n>", "Override canvas width", Number)
  .option("--height <n>", "Override canvas height", Number)
  .option("--preset <name>", "Use a canvas preset")
  .option("-o, --output <path>", "Output file path")
  .action(async (file: string, opts) => {
    const spinner = ora("Loading sketch...").start();

    try {
      // Load and configure sketch
      const filePath = resolve(file);
      const sketch = await loadSketch(filePath);

      // Reject SVG renderer
      if (sketch.renderer.type === "svg") {
        throw new Error(
          "SVG sketches are static and cannot be animated. " +
            "The video command requires an animated renderer (p5, canvas2d, three, glsl).",
        );
      }

      // Build overrides
      const overrides: SketchOverrides = {};
      if (opts.seed !== undefined) overrides.seed = opts.seed as number;
      if (opts.width !== undefined) overrides.width = opts.width as number;
      if (opts.height !== undefined) overrides.height = opts.height as number;
      if (opts.preset) overrides.preset = opts.preset as string;
      if (opts.params) {
        overrides.params = JSON.parse(opts.params as string) as Record<string, number>;
      }
      if (opts.colors) {
        overrides.colors = JSON.parse(opts.colors as string) as string[];
      }

      const modified = applyOverrides(sketch, overrides);
      const registry = createDefaultRegistry();
      const adapter = registry.resolve(modified.renderer.type);

      // Detect ffmpeg
      spinner.text = "Detecting ffmpeg...";
      const ffmpegPath = findFfmpeg();

      // Parse animation specs
      const animateSpecs: AnimateSpec[] = (opts.animate as string[]).map(parseAnimate);
      const easingName = opts.easing as string;
      const easing = EASINGS[easingName];
      if (!easing) {
        throw new Error(
          `Unknown easing function: "${easingName}". ` +
            `Available: ${Object.keys(EASINGS).join(", ")}`,
        );
      }

      // Calculate frame count
      const duration = opts.duration as number;
      const fps = opts.fps as number;
      const totalFrames = Math.ceil(duration * fps);
      const concurrency = opts.concurrency as number;
      const initWaitMs = parseWait(opts.wait as string);

      // Determine output path
      const format = opts.format as "mp4" | "webm" | "gif";
      const outputPath = resolve(
        (opts.output as string) ??
          `${basename(filePath, extname(filePath))}.${format}`,
      );

      // Spawn ffmpeg
      spinner.text = `Video: starting ffmpeg (${totalFrames} frames, ${fps}fps)...`;
      const ffmpegArgs = buildFfmpegArgs({
        output: outputPath,
        width: modified.canvas.width,
        height: modified.canvas.height,
        fps,
        format,
        codec: opts.codec as string,
        quality: opts.quality as number,
        loop: opts.loop as number,
      });
      const ffmpegProc = spawnFfmpeg(ffmpegPath, ffmpegArgs);

      // Collect ffmpeg stderr for error reporting
      let ffmpegStderr = "";
      ffmpegProc.stderr?.on("data", (chunk: Buffer) => {
        ffmpegStderr += chunk.toString();
      });

      // Frame capture loop (chunk-based parallel)
      const hasAnimatedParams = animateSpecs.length > 0;
      let framesRendered = 0;

      for (let i = 0; i < totalFrames; i += concurrency) {
        const chunkSize = Math.min(concurrency, totalFrames - i);
        const frameIndices = Array.from({ length: chunkSize }, (_, j) => i + j);

        // Capture frames in parallel
        const frames = await Promise.all(
          frameIndices.map(async (frameIdx) => {
            const t = totalFrames <= 1 ? 0 : frameIdx / (totalFrames - 1);
            const timeOffsetMs = (frameIdx / fps) * 1000;

            // Apply animated params for this frame
            let frameSketch = modified;
            if (hasAnimatedParams) {
              const animatedParams = interpolateParams(animateSpecs, t, easing);
              frameSketch = applyOverrides(modified, { params: animatedParams });
            }

            const html = adapter.generateStandaloneHTML(frameSketch);

            // Create page, load, wait, inject time, capture
            const page = await getPage(
              frameSketch.canvas.width,
              frameSketch.canvas.height,
            );

            try {
              await page.setContent(html, {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
              });

              // Wait for sketch to initialize
              if (initWaitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, initWaitMs));
              }

              // Inject time offset (after init so sketch has real start-time refs)
              if (timeOffsetMs > 0) {
                await injectTimeOffset(page, timeOffsetMs);
                // Wait one rAF cycle for the sketch to render at new time
                await page.evaluate(
                  () =>
                    new Promise<void>((resolve) =>
                      requestAnimationFrame(() => resolve()),
                    ),
                );
              }

              const buffer = await page.screenshot({
                type: "png",
                clip: {
                  x: 0,
                  y: 0,
                  width: frameSketch.canvas.width,
                  height: frameSketch.canvas.height,
                },
              });

              return new Uint8Array(buffer);
            } finally {
              await page.close();
            }
          }),
        );

        // Write frames to ffmpeg stdin IN ORDER
        for (const frame of frames) {
          const canWrite = ffmpegProc.stdin!.write(frame);
          if (!canWrite) {
            await new Promise<void>((resolve) =>
              ffmpegProc.stdin!.once("drain", resolve),
            );
          }
        }

        framesRendered += chunkSize;
        const pct = Math.round((framesRendered / totalFrames) * 100);
        spinner.text = `Video: ${framesRendered}/${totalFrames} frames (${pct}%)`;
      }

      // Close ffmpeg stdin and wait for exit
      ffmpegProc.stdin!.end();

      const exitCode = await new Promise<number>((resolve, reject) => {
        ffmpegProc.on("close", (code) => resolve(code ?? 0));
        ffmpegProc.on("error", reject);
      });

      if (exitCode !== 0) {
        throw new Error(
          `ffmpeg exited with code ${exitCode}:\n${ffmpegStderr.slice(-500)}`,
        );
      }

      // Report success
      const fileSize = (await stat(outputPath)).size;
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      spinner.succeed(
        chalk.green(
          `Video: ${modified.canvas.width}×${modified.canvas.height}, ` +
            `${totalFrames} frames, ${duration}s → ${outputPath} (${sizeMB} MB)`,
        ),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Video failed: ${(err as Error).message}`));
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });
