import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  compileProject,
  CompileFailure,
  type CompileResult,
  type CompileError,
} from "@genart-dev/core";

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
  .description("Compile a developer project directory to a .genart file")
  .argument("<dir>", "Path to the project directory")
  .option("-o, --output <path>", "Output .genart file path")
  .option("--no-preserve-state", "Do not carry forward state from existing .genart")
  .option("--no-preserve-layers", "Do not carry forward layers from existing .genart")
  .option("-w, --watch", "Watch for changes and recompile (alias for `genart dev` without preview)")
  .action(async (dir: string, opts) => {
    const projectDir = resolve(dir);

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
 * Watch mode: recompile on file changes, no preview server.
 */
async function runWatch(projectDir: string, opts: Record<string, unknown>): Promise<void> {
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
