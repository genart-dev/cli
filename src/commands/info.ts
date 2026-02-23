import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import { loadSketch } from "../util/load-sketch.js";
import type { SketchDefinition } from "@genart-dev/format";

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatHumanReadable(filePath: string, sketch: SketchDefinition): string {
  const lines: string[] = [];
  lines.push(chalk.bold(filePath));

  const pad = (label: string) => `  ${chalk.dim(label.padEnd(14))}`;

  lines.push(`${pad("Title:")}${sketch.title}`);
  if (sketch.subtitle) lines.push(`${pad("Subtitle:")}${sketch.subtitle}`);
  lines.push(`${pad("Renderer:")}${sketch.renderer.type}${sketch.renderer.version ? ` ${sketch.renderer.version}` : ""}`);
  lines.push(`${pad("Canvas:")}${sketch.canvas.width}×${sketch.canvas.height}${sketch.canvas.preset ? ` (${sketch.canvas.preset})` : ""}`);
  lines.push(`${pad("Seed:")}${sketch.state.seed}`);

  if (sketch.parameters.length > 0) {
    const paramStr = sketch.parameters
      .map((p) => {
        const val = sketch.state.params[p.key];
        return `${p.key} (${val ?? p.default})`;
      })
      .join(", ");
    lines.push(`${pad("Parameters:")}${paramStr}`);
  }

  if (sketch.colors.length > 0) {
    const palette = sketch.state.colorPalette;
    const colorStr = Array.isArray(palette) && palette.length > 0
      ? palette.join(", ")
      : sketch.colors.map((c) => c.default).join(", ");
    lines.push(`${pad("Colors:")}${colorStr}`);
  }

  if (sketch.skills && sketch.skills.length > 0) {
    lines.push(`${pad("Skills:")}${sketch.skills.join(", ")}`);
  }

  lines.push(`${pad("Created:")}${formatDate(sketch.created)}`);
  lines.push(`${pad("Modified:")}${formatDate(sketch.modified)}`);

  if (sketch.agent) lines.push(`${pad("Agent:")}${sketch.agent}`);

  return lines.join("\n");
}

function formatTable(entries: Array<{ path: string; sketch: SketchDefinition }>): string {
  const header = ["File", "Title", "Renderer", "Canvas", "Seed", "Params", "Colors"].join("\t");
  const rows = entries.map(({ path: p, sketch }) => {
    return [
      p,
      sketch.title,
      sketch.renderer.type,
      `${sketch.canvas.width}×${sketch.canvas.height}`,
      String(sketch.state.seed),
      String(sketch.parameters.length),
      String(sketch.colors.length),
    ].join("\t");
  });
  return [header, ...rows].join("\n");
}

export const infoCommand = new Command("info")
  .description("Inspect .genart sketch metadata")
  .argument("<files...>", "Path(s) to .genart file(s)")
  .option("--json", "Machine-readable JSON output")
  .option("--table", "Tabular output for multiple files")
  .action(async (files: string[], opts) => {
    try {
      const entries: Array<{ path: string; sketch: SketchDefinition }> = [];

      for (const file of files) {
        const filePath = resolve(file);
        const sketch = await loadSketch(filePath);
        entries.push({ path: filePath, sketch });
      }

      if (opts.json) {
        const data = entries.length === 1
          ? entries[0]!.sketch
          : entries.map((e) => ({ file: e.path, ...e.sketch }));
        console.log(JSON.stringify(data, null, 2));
      } else if (opts.table) {
        console.log(formatTable(entries));
      } else {
        for (const entry of entries) {
          console.log(formatHumanReadable(entry.path, entry.sketch));
          if (entries.length > 1) console.log();
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });
