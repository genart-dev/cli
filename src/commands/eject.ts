import { Command } from "commander";
import { resolve, basename, extname } from "node:path";
import { stat } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { ejectProject } from "@genart-dev/core";
import { loadSketch } from "../util/load-sketch.js";

export const ejectCommand = new Command("eject")
  .description("Extract a .genart file into a developer project directory")
  .argument("<file>", "Path to the .genart file to eject")
  .option("-o, --output <dir>", "Output directory (default: sibling directory named after sketch ID)")
  .option("-f, --force", "Overwrite existing output directory")
  .action(async (file: string, opts) => {
    const spinner = ora("Loading sketch...").start();

    try {
      const filePath = resolve(file);
      const sketch = await loadSketch(filePath);

      // Determine output directory
      const outputDir = opts.output
        ? resolve(opts.output as string)
        : resolve(
            basename(filePath, extname(filePath)).replace(/\.genart$/, "") ||
              sketch.id ||
              "sketch",
          );

      // Check if output directory already exists
      if (!opts.force) {
        try {
          const s = await stat(outputDir);
          if (s.isDirectory()) {
            spinner.fail(
              chalk.red(`Output directory already exists: ${outputDir}`),
            );
            console.error(
              chalk.dim("  Use --force to overwrite, or --output to specify a different path."),
            );
            process.exitCode = 1;
            return;
          }
        } catch {
          // Directory doesn't exist — good
        }
      }

      spinner.text = "Ejecting to source files...";
      await ejectProject(sketch, outputDir);

      spinner.succeed(chalk.green(`Ejected → ${outputDir}/`));
      console.log(chalk.dim(`  sketch source:  ${sketch.renderer.type === "glsl" ? "sketch.frag" : "sketch.js"}`));
      console.log(chalk.dim(`  metadata:       sketch.meta.json`));

      const componentCount = sketch.components
        ? Object.values(sketch.components).filter(
            (v) => typeof v !== "string" && v.code && v.exports,
          ).length
        : 0;
      if (componentCount > 0) {
        console.log(chalk.dim(`  components:     ${componentCount} file${componentCount > 1 ? "s" : ""}`));
      }

      console.log(
        chalk.dim(`\n  To start developing: genart dev ${outputDir}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Eject failed: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });
