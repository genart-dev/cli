import { Command } from "commander";
import { resolve, join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { createDefaultRegistry } from "@genart-dev/core";
import {
  serializeGenart,
  CANVAS_PRESETS,
  resolvePreset,
  type RendererType,
  type SketchDefinition,
} from "@genart-dev/format";

const RENDERER_TYPES: RendererType[] = ["p5", "canvas2d", "three", "glsl", "svg"];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const initCommand = new Command("init")
  .description("Scaffold a new .genart sketch file (or developer project with --dev)")
  .argument("[name]", "Sketch name / title")
  .option("--renderer <type>", `Renderer type: ${RENDERER_TYPES.join(", ")}`)
  .option("--preset <name>", "Canvas preset", "square-600")
  .option("--title <string>", "Sketch title")
  .option("--dev", "Create a developer project (sketch.js + sketch.meta.json)")
  .action(async (name: string | undefined, opts) => {
    const spinner = ora("").start();
    spinner.stop();

    try {
      let rendererType: RendererType;
      let preset: string;
      let title: string;

      // Determine renderer
      if (opts.renderer) {
        rendererType = opts.renderer as RendererType;
        if (!RENDERER_TYPES.includes(rendererType)) {
          throw new Error(
            `Invalid renderer "${rendererType}". Choose from: ${RENDERER_TYPES.join(", ")}`,
          );
        }
      } else {
        // Interactive prompt
        const { default: inquirer } = await import("inquirer");
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "renderer",
            message: "Renderer type:",
            choices: RENDERER_TYPES.map((t) => ({ name: t, value: t })),
          },
        ]);
        rendererType = answers.renderer as RendererType;
      }

      // Determine title
      if (opts.title) {
        title = opts.title as string;
      } else if (name) {
        title = name;
      } else {
        const { default: inquirer } = await import("inquirer");
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "Sketch title:",
            default: "Untitled Sketch",
          },
        ]);
        title = answers.title as string;
      }

      // Determine preset
      if (opts.preset) {
        preset = opts.preset as string;
      } else {
        const { default: inquirer } = await import("inquirer");
        const choices = CANVAS_PRESETS.map((p) => ({
          name: `${p.id} (${p.width}×${p.height})`,
          value: p.id,
        }));
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "preset",
            message: "Canvas preset:",
            choices,
            default: "square-600",
          },
        ]);
        preset = answers.preset as string;
      }

      const dims = resolvePreset(preset);

      // Get algorithm template from adapter
      const registry = createDefaultRegistry();
      const adapter = registry.resolve(rendererType);
      const algorithm = adapter.getAlgorithmTemplate();

      const id = slugify(title);

      if (opts.dev) {
        // Developer project mode: create directory with sketch source + meta
        await initDevProject({
          id,
          title,
          rendererType,
          preset,
          dims,
          algorithm,
        });
      } else {
        // Standard mode: create a single .genart file
        const now = new Date().toISOString();
        const sketch: SketchDefinition = {
          genart: "1.0",
          id,
          title,
          created: now,
          modified: now,
          renderer: { type: rendererType },
          canvas: { preset, width: dims.width, height: dims.height },
          parameters: [],
          colors: [],
          state: {
            seed: Math.floor(Math.random() * 10000),
            params: {},
            colorPalette: [],
          },
          algorithm,
        };

        const outputPath = resolve(`${id}.genart`);
        const json = serializeGenart(sketch);
        await writeFile(outputPath, json, "utf-8");

        console.log(chalk.green(`✓ Created ${outputPath}`));
        console.log(chalk.dim(`  Renderer: ${rendererType}`));
        console.log(chalk.dim(`  Canvas:   ${dims.width}×${dims.height} (${preset})`));
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

/** Scaffold a developer project directory. */
async function initDevProject(opts: {
  id: string;
  title: string;
  rendererType: RendererType;
  preset: string;
  dims: { width: number; height: number };
  algorithm: string;
}): Promise<void> {
  const { id, title, rendererType, preset, dims, algorithm } = opts;
  const projectDir = resolve(id);

  await mkdir(projectDir, { recursive: true });

  // Write sketch source file
  const srcFile = rendererType === "glsl" ? "sketch.frag" : "sketch.js";
  await writeFile(join(projectDir, srcFile), algorithm, "utf-8");

  // Write sketch.meta.json
  const meta: Record<string, unknown> = {
    title,
    id,
    renderer: { type: rendererType },
    canvas: { preset, width: dims.width, height: dims.height },
    parameters: [],
    colors: [],
  };
  await writeFile(
    join(projectDir, "sketch.meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  console.log(chalk.green(`✓ Created developer project: ${projectDir}/`));
  console.log(chalk.dim(`  ${srcFile}`));
  console.log(chalk.dim(`  sketch.meta.json`));
  console.log(chalk.dim(`  Renderer: ${rendererType}`));
  console.log(chalk.dim(`  Canvas:   ${dims.width}×${dims.height} (${preset})`));
  console.log(
    chalk.dim(`\n  To start developing: genart dev ${id}`),
  );
}
