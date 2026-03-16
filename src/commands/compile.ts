import { Command } from "commander";
import { resolve, extname, basename } from "node:path";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import {
  compileProject,
  CompileFailure,
  type CompileResult,
  type CompileError,
} from "@genart-dev/core";
import { serializeGenart } from "@genart-dev/format";
import { compileGsToDefinition } from "../util/compile-gs.js";

/**
 * Format a single compile error for terminal display.
 */
function formatError(error: CompileError): string {
  const loc = error.line
    ? `:${error.line}${error.column ? `:${error.column}` : ""}`
    : "";
  return `${error.file}${loc}: ${error.message}`;
}

export const compileCommand = new Command("compile")
  .description(
    "Compile a .gs GenArt Script file or developer project to a .genart file",
  )
  .argument("<path>", "Path to .gs file or developer project directory")
  .option("-o, --output <path>", "Output .genart file path")
  .option("--title <string>", "Sketch title (for .gs files)")
  .option("--width <n>", "Canvas width (default: 600)", Number)
  .option("--height <n>", "Canvas height (default: 600)", Number)
  .option("--seed <n>", "Initial seed", Number)
  .option(
    "--preset <name>",
    "Canvas preset (e.g. square-600, hd-1920x1080)",
  )
  .option(
    "--no-preserve-state",
    "Do not carry forward state from existing .genart",
  )
  .option(
    "--no-preserve-layers",
    "Do not carry forward layers from existing .genart",
  )
  .option(
    "-w, --watch",
    "Watch for changes and recompile (dev projects only)",
  )
  .action(async (path: string, opts) => {
    const resolved = resolve(path);
    const ext = extname(resolved).toLowerCase();

    // --- .gs GenArt Script ---
    if (ext === ".gs") {
      await compileGs(resolved, opts);
      return;
    }

    // --- Developer project directory ---
    const projectDir = resolved;

    // --watch delegates to watch mode (compile-only, no server)
    if (opts.watch) {
      await runWatch(projectDir, opts);
      return;
    }

    const spinner = ora("Compiling...").start();

    try {
      const result = await compileProject({
        projectDir,
        outputPath: opts.output ? resolve(opts.output as string) : undefined,
        preserveState: opts.preserveState as boolean,
        preserveLayers: opts.preserveLayers as boolean,
      });

      spinner.succeed(
        chalk.green(`Compiled → ${result.outputPath}`) +
          chalk.dim(` (${result.duration.toFixed(0)}ms)`),
      );

      if (result.warnings.length > 0) {
        for (const warn of result.warnings) {
          console.log(chalk.yellow(`  ⚠ ${warn}`));
        }
      }
    } catch (err) {
      if (err instanceof CompileFailure) {
        spinner.fail(chalk.red("Compilation failed"));
        for (const error of err.errors) {
          console.error(chalk.red(`  ${formatError(error)}`));
        }
      } else {
        spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      }
      process.exitCode = 1;
    }
  });

/**
 * Compile a .gs file to a .genart file.
 */
async function compileGs(
  filePath: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const spinner = ora("Compiling GenArt Script...").start();
  const t0 = performance.now();

  try {
    const sketch = await compileGsToDefinition(filePath, {
      width: opts.width as number | undefined,
      height: opts.height as number | undefined,
      seed: opts.seed as number | undefined,
      title: opts.title as string | undefined,
    });

    // Determine output path
    const outputPath = opts.output
      ? resolve(opts.output as string)
      : resolve(
          filePath.replace(/\.gs$/, ".genart"),
        );

    await writeFile(outputPath, serializeGenart(sketch) + "\n", "utf-8");
    const duration = performance.now() - t0;

    const paramCount = sketch.parameters.length;
    const colorCount = sketch.colors.length;
    const meta = [
      paramCount > 0 ? `${paramCount} param${paramCount > 1 ? "s" : ""}` : null,
      colorCount > 0 ? `${colorCount} color${colorCount > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    spinner.succeed(
      chalk.green(`Compiled → ${outputPath}`) +
        chalk.dim(` (${duration.toFixed(0)}ms${meta ? `, ${meta}` : ""})`),
    );
  } catch (err) {
    spinner.fail(chalk.red((err as Error).message));
    process.exitCode = 1;
  }
}

/**
 * Watch mode: recompile on file changes, no preview server.
 */
async function runWatch(
  projectDir: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const { watchProject } = await import("@genart-dev/core");

  // Initial compile
  const spinner = ora("Compiling...").start();
  try {
    const result = await compileProject({
      projectDir,
      outputPath: opts.output ? resolve(opts.output as string) : undefined,
      preserveState: opts.preserveState as boolean,
      preserveLayers: opts.preserveLayers as boolean,
    });
    spinner.succeed(
      chalk.green(`Compiled → ${result.outputPath}`) +
        chalk.dim(` (${result.duration.toFixed(0)}ms)`),
    );
    if (result.warnings.length > 0) {
      for (const warn of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warn}`));
      }
    }
  } catch (err) {
    if (err instanceof CompileFailure) {
      spinner.fail(chalk.red("Compilation failed"));
      for (const error of err.errors) {
        console.error(chalk.red(`  ${formatError(error)}`));
      }
    } else {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
      return;
    }
  }

  console.log(chalk.dim("\nWatching for changes... (Ctrl+C to stop)\n"));

  const watcher = watchProject(
    projectDir,
    (result) => {
      if ("errors" in result) {
        const errors = result.errors as readonly CompileError[];
        console.log(chalk.red(`✗ Compilation failed`));
        for (const error of errors) {
          console.error(chalk.red(`  ${formatError(error)}`));
        }
      } else {
        const r = result as CompileResult;
        console.log(
          chalk.green(`✓ Compiled`) +
            chalk.dim(` (${r.duration.toFixed(0)}ms)`),
        );
        if (r.warnings.length > 0) {
          for (const warn of r.warnings) {
            console.log(chalk.yellow(`  ⚠ ${warn}`));
          }
        }
      }
    },
    {
      outputPath: opts.output ? resolve(opts.output as string) : undefined,
      preserveState: opts.preserveState as boolean,
      preserveLayers: opts.preserveLayers as boolean,
    },
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log(chalk.dim("\nStopping watcher..."));
    watcher.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}
