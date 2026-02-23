import { Command } from "commander";
import { resolve, basename, extname } from "node:path";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import { loadSketch } from "../util/load-sketch.js";
import { applyOverrides, type SketchOverrides } from "../util/apply-overrides.js";
import { parseWait } from "../util/parse-wait.js";
import { captureHtml, closeBrowser } from "../capture/browser.js";

export const renderCommand = new Command("render")
  .description("Render a .genart sketch to an image")
  .argument("<file>", "Path to .genart file")
  .option("--wait <duration>", "How long to let the sketch animate before capture", "500ms")
  .option("--seed <n>", "Override seed", Number)
  .option("--params <json>", "Override parameters (JSON object)")
  .option("--colors <json>", "Override color palette (JSON array of hex strings)")
  .option("--width <n>", "Override canvas width", Number)
  .option("--height <n>", "Override canvas height", Number)
  .option("--preset <name>", "Use a canvas preset")
  .option("--format <fmt>", "Output format: png, jpeg, webp", "png")
  .option("--quality <n>", "Lossy compression quality (0-100)", Number, 80)
  .option("--scale <n>", "Pixel density multiplier", Number, 1)
  .option("-o, --output <path>", "Output file path")
  .action(async (file: string, opts) => {
    const spinner = ora("Loading sketch...").start();

    try {
      const filePath = resolve(file);
      const sketch = await loadSketch(filePath);

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

      // Generate HTML
      spinner.text = "Generating standalone HTML...";
      const registry = createDefaultRegistry();
      const adapter = registry.resolve(modified.renderer.type);
      const html = adapter.generateStandaloneHTML(modified);

      // Capture
      const waitMs = parseWait(opts.wait as string);
      const format = opts.format as "png" | "jpeg" | "webp";

      spinner.text = `Rendering (${modified.canvas.width}×${modified.canvas.height}, wait ${waitMs}ms)...`;
      const result = await captureHtml({
        html,
        width: modified.canvas.width,
        height: modified.canvas.height,
        waitMs,
        format,
        quality: opts.quality as number,
        scale: opts.scale as number,
      });

      // Write output
      const outputPath = resolve(
        (opts.output as string) ?? `${basename(filePath, extname(filePath))}.${format}`,
      );
      await writeFile(outputPath, result.bytes);

      spinner.succeed(
        chalk.green(`Rendered ${modified.canvas.width}×${modified.canvas.height} → ${outputPath}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Render failed: ${(err as Error).message}`));
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });
