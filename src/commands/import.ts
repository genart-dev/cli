import { Command } from "commander";
import { resolve, basename, extname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import {
  serializeGenart,
  resolvePreset,
  CANVAS_PRESETS,
  type RendererType,
  type SketchDefinition,
  type ParamDef,
  type ColorDef,
} from "@genart-dev/format";
import {
  detectRenderer,
  detectParams,
  detectColorCount,
  detectCanvasSize,
} from "../detect/renderer.js";

const RENDERER_TYPES: RendererType[] = ["p5", "canvas2d", "three", "glsl", "svg"];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const importCommand = new Command("import")
  .description("Convert a source file (.js, .glsl) into a .genart sketch")
  .argument("<files...>", "Source file(s) to import")
  .option("--renderer <type>", "Force renderer type (skip auto-detection)")
  .option("--preset <name>", "Canvas preset", "square-600")
  .option("--title <string>", "Sketch title (skip prompt)")
  .option("--seed <n>", "Initial seed", Number)
  .option("-y, --non-interactive", "Accept all defaults, skip prompts")
  .option("--batch", "Process multiple files non-interactively")
  .option("--dry-run", "Show what would be generated without writing")
  .option("-o, --output <path>", "Output path (single file only)")
  .action(async (files: string[], opts) => {
    const nonInteractive = !!(opts.nonInteractive || opts.batch);

    try {
      for (const file of files) {
        await importFile(file, opts, nonInteractive);
      }
    } catch (err) {
      console.error(chalk.red(`Import failed: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

async function importFile(
  file: string,
  opts: Record<string, unknown>,
  nonInteractive: boolean,
): Promise<void> {
  const spinner = ora(`Importing ${basename(file)}...`).start();

  const filePath = resolve(file);
  const source = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  // Detect renderer
  let rendererType: RendererType;

  if (opts.renderer) {
    rendererType = opts.renderer as RendererType;
    if (!RENDERER_TYPES.includes(rendererType)) {
      spinner.fail(chalk.red(`Invalid renderer: ${rendererType}`));
      throw new Error(`Invalid renderer "${rendererType}". Choose from: ${RENDERER_TYPES.join(", ")}`);
    }
    spinner.text = `Renderer: ${rendererType} (specified)`;
  } else {
    // Auto-detect from source
    const detection = detectRenderer(source);

    if (detection) {
      spinner.text = `Detected renderer: ${detection.type} (${detection.confidence})`;

      if (detection.confidence === "low" && !nonInteractive) {
        // Prompt for confirmation
        spinner.stop();
        const { default: inquirer } = await import("inquirer");
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "renderer",
            message: `Low-confidence detection: ${detection.type}. Confirm or choose:`,
            choices: RENDERER_TYPES.map((t) => ({ name: t, value: t })),
            default: detection.type,
          },
        ]);
        rendererType = answers.renderer as RendererType;
        spinner.start();
      } else {
        rendererType = detection.type;
      }
    } else {
      // Fallback: use file extension or prompt
      if (ext === ".glsl" || ext === ".frag" || ext === ".vert") {
        rendererType = "glsl";
      } else if (nonInteractive) {
        rendererType = "p5"; // default
      } else {
        spinner.stop();
        const { default: inquirer } = await import("inquirer");
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "renderer",
            message: "Could not detect renderer type. Please choose:",
            choices: RENDERER_TYPES.map((t) => ({ name: t, value: t })),
          },
        ]);
        rendererType = answers.renderer as RendererType;
        spinner.start();
      }
    }
  }

  // Validate algorithm
  spinner.text = "Validating algorithm...";
  const registry = createDefaultRegistry();
  const adapter = registry.resolve(rendererType);
  const validation = adapter.validate(source);

  if (!validation.valid) {
    spinner.warn(chalk.yellow(`Validation warnings for ${rendererType}:`));
    for (const error of validation.errors) {
      console.error(chalk.yellow(`  - ${error}`));
    }
  }

  // Detect metadata from source
  const detectedParams = detectParams(source);
  const detectedColorCount = detectColorCount(source);
  const detectedSize = detectCanvasSize(source);

  // Build title
  let title: string;
  if (opts.title) {
    title = opts.title as string;
  } else if (nonInteractive) {
    title = basename(filePath, extname(filePath))
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } else {
    spinner.stop();
    const { default: inquirer } = await import("inquirer");
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "title",
        message: "Sketch title:",
        default: basename(filePath, extname(filePath))
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      },
    ]);
    title = answers.title as string;
    spinner.start();
  }

  // Determine canvas
  const preset = opts.preset as string;
  let canvasWidth: number;
  let canvasHeight: number;

  if (detectedSize && !opts.preset) {
    canvasWidth = detectedSize.width;
    canvasHeight = detectedSize.height;
  } else {
    const dims = resolvePreset(preset);
    canvasWidth = dims.width;
    canvasHeight = dims.height;
  }

  // Build parameter definitions
  const parameters: ParamDef[] = detectedParams.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
  }));

  // Build color definitions
  const colors: ColorDef[] = [];
  const defaultColors = ["#FF6B35", "#004E89", "#F7C59F", "#1A936F", "#C6DABF"];
  for (let i = 0; i < detectedColorCount; i++) {
    colors.push({
      key: `color${i}`,
      label: `Color ${i + 1}`,
      default: defaultColors[i % defaultColors.length]!,
    });
  }

  const seed = (opts.seed as number) ?? Math.floor(Math.random() * 10000);
  const id = slugify(title);
  const now = new Date().toISOString();

  const sketch: SketchDefinition = {
    genart: "1.0",
    id,
    title,
    created: now,
    modified: now,
    renderer: { type: rendererType },
    canvas: {
      preset: detectedSize ? undefined : preset,
      width: canvasWidth,
      height: canvasHeight,
    },
    parameters,
    colors,
    state: {
      seed,
      params: Object.fromEntries(parameters.map((p) => [p.key, p.default])),
      colorPalette: colors.map((c) => c.default),
    },
    algorithm: source,
  };

  if (opts.dryRun) {
    spinner.stop();
    console.log(chalk.dim("--- Dry run (would write): ---"));
    console.log(serializeGenart(sketch));
    return;
  }

  const outputPath = (opts.output as string)
    ? resolve(opts.output as string)
    : resolve(`${id}.genart`);
  const json = serializeGenart(sketch);
  await writeFile(outputPath, json, "utf-8");

  spinner.succeed(chalk.green(`✓ Imported → ${outputPath}`));
  console.log(chalk.dim(`  Renderer:   ${rendererType}`));
  console.log(chalk.dim(`  Canvas:     ${canvasWidth}×${canvasHeight}`));
  if (detectedParams.length > 0) {
    console.log(chalk.dim(`  Parameters: ${detectedParams.join(", ")}`));
  }
  if (detectedColorCount > 0) {
    console.log(chalk.dim(`  Colors:     ${detectedColorCount} slot${detectedColorCount > 1 ? "s" : ""}`));
  }
}
