import { Command } from "commander";
import { resolve, basename, extname } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import { loadSketch } from "../util/load-sketch.js";
import { applyOverrides, type SketchOverrides } from "../util/apply-overrides.js";
import { parseWait } from "../util/parse-wait.js";
import { parseSeeds } from "../util/parse-seeds.js";
import { parseSweep, cartesianProduct, type SweepSpec } from "../util/parse-sweep.js";
import { formatOutputName } from "../util/naming.js";
import { captureHtml, closeBrowser } from "../capture/browser.js";

interface ManifestEntry {
  file: string;
  seed: number;
  params: Record<string, number>;
  path: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Collect repeatable --sweep flags into an array.
 * Commander calls this for each --sweep value.
 */
function collectSweeps(value: string, prev: string[]): string[] {
  return [...prev, value];
}

export const batchCommand = new Command("batch")
  .description("Generate many renders from one sketch — seed ranges, parameter sweeps")
  .argument("<files...>", "Path(s) to .genart file(s)")
  .option("--seeds <range>", "Seed range or list (e.g. 1-100, 1,5,42)")
  .option("--sweep <spec>", "Parameter sweep (repeatable, e.g. amplitude=0:1:0.1)", collectSweeps, [])
  .option("--random <n>", "Generate N random seed + param combinations", Number)
  .option("--matrix", "Cartesian product of seeds × sweeps")
  .option("--concurrency <n>", "Parallel captures", Number, 4)
  .option("--naming <pattern>", "Output naming pattern: {id}, {seed}, {index}, {params}", "{id}-{seed}")
  .option("--manifest", "Write manifest.json with per-render metadata")
  .option("--wait <duration>", "Render wait time", "500ms")
  .option("--width <n>", "Override canvas width", Number)
  .option("--height <n>", "Override canvas height", Number)
  .option("--preset <name>", "Use a canvas preset")
  .option("--format <fmt>", "Output format: png, jpeg, webp", "png")
  .option("--quality <n>", "Lossy compression quality (0-100)", Number, 80)
  .option("--scale <n>", "Pixel density multiplier", Number, 1)
  .option("--colors <json>", "Override color palette (JSON array)")
  .option("-o, --output-dir <dir>", "Output directory", ".")
  .action(async (files: string[], opts) => {
    const spinner = ora("Preparing batch...").start();

    try {
      const outputDir = resolve(opts.outputDir as string);
      await mkdir(outputDir, { recursive: true });

      const waitMs = parseWait(opts.wait as string);
      const format = opts.format as "png" | "jpeg" | "webp";
      const concurrency = opts.concurrency as number;
      const namingPattern = opts.naming as string;
      const registry = createDefaultRegistry();

      const manifest: ManifestEntry[] = [];
      let totalRendered = 0;

      for (const file of files) {
        const filePath = resolve(file);
        const sketch = await loadSketch(filePath);
        const sketchId = sketch.id ?? basename(filePath, extname(filePath));

        // Build base overrides (non-seed, non-param)
        const baseOverrides: SketchOverrides = {};
        if (opts.width !== undefined) baseOverrides.width = opts.width as number;
        if (opts.height !== undefined) baseOverrides.height = opts.height as number;
        if (opts.preset) baseOverrides.preset = opts.preset as string;
        if (opts.colors) {
          baseOverrides.colors = JSON.parse(opts.colors as string) as string[];
        }

        // Generate job list: array of { seed, params }
        const jobs = generateJobs(opts, sketch.state.seed);

        spinner.text = `Batch: ${jobs.length} render${jobs.length === 1 ? "" : "s"} for ${basename(filePath)}`;

        // Process in concurrency-limited batches
        for (let i = 0; i < jobs.length; i += concurrency) {
          const chunk = jobs.slice(i, i + concurrency);

          const promises = chunk.map(async (job, chunkIdx) => {
            const idx = i + chunkIdx;
            const overrides: SketchOverrides = {
              ...baseOverrides,
              seed: job.seed,
              ...(Object.keys(job.params).length > 0 ? { params: job.params } : {}),
            };

            const modified = applyOverrides(sketch, overrides);
            const adapter = registry.resolve(modified.renderer.type);
            const html = adapter.generateStandaloneHTML(modified);

            const result = await captureHtml({
              html,
              width: modified.canvas.width,
              height: modified.canvas.height,
              waitMs,
              format,
              quality: opts.quality as number,
              scale: opts.scale as number,
            });

            const fileName = formatOutputName(namingPattern, {
              id: sketchId,
              seed: job.seed,
              index: idx,
              params: job.params,
              format,
            });
            const outputPath = resolve(outputDir, fileName);
            await writeFile(outputPath, result.bytes);

            manifest.push({
              file: basename(filePath),
              seed: job.seed,
              params: job.params,
              path: outputPath,
              width: modified.canvas.width,
              height: modified.canvas.height,
              format,
            });

            return outputPath;
          });

          await Promise.all(promises);
          totalRendered += chunk.length;
          spinner.text = `Batch: ${totalRendered}/${jobs.length} rendered`;
        }
      }

      // Write manifest if requested
      if (opts.manifest) {
        const manifestPath = resolve(outputDir, "manifest.json");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
        // Also write to stdout for piping
        console.log(JSON.stringify(manifest));
      }

      spinner.succeed(
        chalk.green(`Batch complete: ${totalRendered} render${totalRendered === 1 ? "" : "s"}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Batch failed: ${(err as Error).message}`));
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });

function generateJobs(
  opts: Record<string, unknown>,
  defaultSeed: number,
): Array<{ seed: number; params: Record<string, number> }> {
  const seeds = opts.seeds
    ? parseSeeds(opts.seeds as string)
    : [defaultSeed];

  const sweeps: SweepSpec[] = (opts.sweep as string[]).map(parseSweep);

  // Random mode: generate N random combinations
  if (opts.random) {
    const n = opts.random as number;
    const jobs: Array<{ seed: number; params: Record<string, number> }> = [];

    for (let i = 0; i < n; i++) {
      const seed = Math.floor(Math.random() * 100_000);
      const params: Record<string, number> = {};
      for (const sweep of sweeps) {
        params[sweep.key] = sweep.min + Math.random() * (sweep.max - sweep.min);
        // Round to step precision
        params[sweep.key] = Math.round(params[sweep.key]! / sweep.step) * sweep.step;
        params[sweep.key] = Math.round(params[sweep.key]! * 1e10) / 1e10;
      }
      jobs.push({ seed, params });
    }

    return jobs;
  }

  // Matrix mode: cartesian product of seeds × sweeps
  if (opts.matrix || sweeps.length > 0) {
    return cartesianProduct(seeds, sweeps);
  }

  // Default: just seeds
  return seeds.map((seed) => ({ seed, params: {} }));
}
