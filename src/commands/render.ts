import { Command } from "commander";
import { resolve, dirname, basename, extname, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import type { SketchDefinition, SketchDataSource } from "@genart-dev/format";
import { loadSketch } from "../util/load-sketch.js";
import { applyOverrides, type SketchOverrides } from "../util/apply-overrides.js";
import { parseWait } from "../util/parse-wait.js";
import { captureHtml, closeBrowser } from "../capture/browser.js";

/**
 * Compile a `.gs` (GenArt Script) file to a minimal SketchDefinition.
 * Params and colors declared in the source are extracted and placed into
 * the definition so downstream overrides and HTML generation work normally.
 */
async function loadGenArtScript(filePath: string, opts: {
  width?: number;
  height?: number;
  seed?: number;
}): Promise<SketchDefinition> {
  const { compile } = await import("@genart-dev/genart-script");
  const source = await readFile(filePath, "utf-8");
  const result = compile(source);
  if (!result.ok) {
    const messages = result.errors.map((e) => `  ${e.line}:${e.col} ${e.message}`).join("\n");
    throw new Error(`GenArt Script compile errors:\n${messages}`);
  }

  const now = new Date().toISOString();
  const id = basename(filePath, extname(filePath)).replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const sketch: SketchDefinition = {
    genart: "1.1",
    id,
    title: id,
    created: now,
    modified: now,
    renderer: { type: "genart" },
    canvas: {
      width: opts.width ?? 800,
      height: opts.height ?? 800,
    },
    parameters: result.params.map((p) => ({
      key: p.key,
      label: p.label,
      type: "float" as const,
      min: p.min,
      max: p.max,
      step: p.step,
      default: p.default,
    })),
    colors: result.colors.map((c) => ({
      key: c.key,
      label: c.label,
      default: c.default,
    })),
    state: {
      seed: opts.seed ?? Math.floor(Math.random() * 1_000_000),
      params: Object.fromEntries(result.params.map((p) => [p.key, p.default])),
      colorPalette: result.colors.map((c) => c.default),
    },
    algorithm: source,
  };

  return sketch;
}

/**
 * Resolve file-based data sources by reading .genart-data files from disk
 * and converting them to inline sources so the HTML generator can embed them.
 */
async function resolveFileDataSources(
  sketch: SketchDefinition,
  sketchPath: string,
): Promise<void> {
  if (!sketch.data) return;
  const dir = dirname(sketchPath);
  for (const [key, source] of Object.entries(sketch.data)) {
    if (source.source === 'file' && source.path) {
      const dataPath = resolve(dir, source.path);
      const raw = JSON.parse(await readFile(dataPath, 'utf-8')) as Record<string, unknown>;
      // Extract the value payload — .genart-data files have { "genart-data": "1.0", "value": ... }
      const value = raw["value"] ?? raw;
      (sketch.data as Record<string, SketchDataSource>)[key] = {
        type: source.type,
        source: 'inline',
        value,
      };
    }
  }
}

export const renderCommand = new Command("render")
  .description("Render a .genart sketch or .gs GenArt Script to an image")
  .argument("<file>", "Path to .genart or .gs file")
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
      const ext = extname(filePath).toLowerCase();
      const isGenArtScript = ext === ".gs";

      // Load sketch — either from .genart JSON or compile from .gs source
      let sketch: SketchDefinition;
      if (isGenArtScript) {
        spinner.text = "Compiling GenArt Script...";
        sketch = await loadGenArtScript(filePath, {
          width: opts.width as number | undefined,
          height: opts.height as number | undefined,
          seed: opts.seed as number | undefined,
        });
      } else {
        sketch = await loadSketch(filePath);
      }

      // Build overrides (for .gs files, width/height/seed were already applied above)
      const overrides: SketchOverrides = {};
      if (!isGenArtScript && opts.seed !== undefined) overrides.seed = opts.seed as number;
      if (!isGenArtScript && opts.width !== undefined) overrides.width = opts.width as number;
      if (!isGenArtScript && opts.height !== undefined) overrides.height = opts.height as number;
      if (opts.preset) overrides.preset = opts.preset as string;
      if (opts.params) {
        overrides.params = JSON.parse(opts.params as string) as Record<string, number>;
      }
      if (opts.colors) {
        overrides.colors = JSON.parse(opts.colors as string) as string[];
      }

      const modified = applyOverrides(sketch, overrides);

      // Resolve file-based data sources before HTML generation
      await resolveFileDataSources(modified, filePath);

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
