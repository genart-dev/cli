import { Command } from "commander";
import { resolve } from "node:path";
import { stat, readdir } from "node:fs/promises";
import chalk from "chalk";
import { createDefaultRegistry } from "@genart-dev/core";
import { loadSketch } from "../util/load-sketch.js";

async function resolveFiles(inputs: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const input of inputs) {
    const p = resolve(input);
    const info = await stat(p);
    if (info.isDirectory()) {
      const entries = await readdir(p);
      for (const entry of entries) {
        if (entry.endsWith(".genart")) {
          files.push(resolve(p, entry));
        }
      }
    } else {
      files.push(p);
    }
  }

  return files;
}

export const validateCommand = new Command("validate")
  .description("Validate .genart files")
  .argument("<paths...>", "Path(s) to .genart file(s) or directories")
  .option("--strict", "Also run adapter.validate() on algorithm source")
  .action(async (paths: string[], opts) => {
    let hasErrors = false;

    try {
      const files = await resolveFiles(paths);

      if (files.length === 0) {
        console.error(chalk.yellow("No .genart files found."));
        process.exitCode = 1;
        return;
      }

      const registry = opts.strict ? createDefaultRegistry() : null;

      for (const filePath of files) {
        try {
          const sketch = await loadSketch(filePath);

          if (opts.strict && registry) {
            const adapter = registry.resolve(sketch.renderer.type);
            const result = adapter.validate(sketch.algorithm);
            if (!result.valid) {
              console.error(chalk.red(`✗ ${filePath}`));
              for (const err of result.errors) {
                console.error(chalk.red(`    ${err}`));
              }
              hasErrors = true;
              continue;
            }
          }

          console.log(chalk.green(`✓ ${filePath}`));
        } catch (err) {
          console.error(chalk.red(`✗ ${filePath}`));
          console.error(chalk.red(`    ${(err as Error).message}`));
          hasErrors = true;
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      hasErrors = true;
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
  });
