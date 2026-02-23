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

export const exportCommand = new Command("export")
  .description("Export sketch as HTML, image, or algorithm source")
  .argument("<file>", "Path to .genart file")
  .option("--format <fmt>", "Export format: html, png, jpeg, webp, algorithm", "html")
  .option("--wait <duration>", "Render wait time (for image formats)", "500ms")
  .option("--seed <n>", "Override seed", Number)
  .option("--params <json>", "Override parameters (JSON object)")
  .option("--colors <json>", "Override color palette (JSON array)")
  .option("--width <n>", "Override canvas width", Number)
  .option("--height <n>", "Override canvas height", Number)
  .option("--preset <name>", "Use a canvas preset")
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
      const registry = createDefaultRegistry();
      const adapter = registry.resolve(modified.renderer.type);

      const format = opts.format as string;
      const baseName = basename(filePath, extname(filePath));

      let outputPath: string;
      let content: string | Uint8Array;

      if (format === "html") {
        spinner.text = "Generating standalone HTML...";
        content = adapter.generateStandaloneHTML(modified);
        outputPath = resolve((opts.output as string) ?? `${baseName}.html`);
      } else if (format === "algorithm") {
        spinner.text = "Extracting algorithm...";
        content = modified.algorithm;
        const ext = modified.renderer.type === "glsl" ? "glsl" : "js";
        outputPath = resolve((opts.output as string) ?? `${baseName}.${ext}`);
      } else if (format === "png" || format === "jpeg" || format === "webp") {
        spinner.text = `Rendering ${format}...`;
        const html = adapter.generateStandaloneHTML(modified);
        const waitMs = parseWait(opts.wait as string);

        const result = await captureHtml({
          html,
          width: modified.canvas.width,
          height: modified.canvas.height,
          waitMs,
          format,
          quality: opts.quality as number,
          scale: opts.scale as number,
        });

        content = result.bytes;
        outputPath = resolve((opts.output as string) ?? `${baseName}.${format}`);
      } else {
        throw new Error(`Unsupported export format: "${format}". Use: html, png, jpeg, webp, algorithm`);
      }

      await writeFile(outputPath, content, typeof content === "string" ? "utf-8" : undefined);
      spinner.succeed(chalk.green(`Exported → ${outputPath}`));
    } catch (err) {
      spinner.fail(chalk.red(`Export failed: ${(err as Error).message}`));
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });
