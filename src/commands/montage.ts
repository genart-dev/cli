import { Command } from "commander";
import { resolve, basename } from "node:path";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";

interface MontageEntry {
  path: string;
  seed?: number;
  params?: Record<string, number>;
  index: number;
}

export const montageCommand = new Command("montage")
  .description("Compose a grid of images into a single montage")
  .argument("<source>", "Directory of images, or - for manifest JSON on stdin")
  .option("--columns <n>", "Grid columns", Number)
  .option("--rows <n>", "Grid rows", Number)
  .option("--tile-size <WxH>", "Force tile dimensions (e.g. 200x200)")
  .option("--gap <px>", "Gap between tiles", Number, 2)
  .option("--padding <px>", "Outer padding", Number, 0)
  .option("--background <hex>", "Background color", "#0A0A0A")
  .option("--label <mode>", "Label tiles: seed, params, filename, index, none", "none")
  .option("--label-color <hex>", "Label text color", "#999999")
  .option("--label-font-size <px>", "Label font size", Number, 11)
  .option("--sort <key>", "Sort: seed, name, param:<key>")
  .option("-o, --output <path>", "Output file", "montage.png")
  .action(async (source: string, opts) => {
    const spinner = ora("Preparing montage...").start();

    try {
      // Try to load sharp
      let sharp: typeof import("sharp");
      try {
        sharp = (await import("sharp")).default;
      } catch {
        throw new Error(
          `sharp is required for montage composition but is not installed.\n` +
            `  Install it: npm install sharp\n` +
            `  Or: pnpm add sharp`,
        );
      }

      // Gather image entries
      let entries: MontageEntry[];

      if (source === "-") {
        // Read manifest JSON from stdin
        const input = await readStdin();
        const manifest = JSON.parse(input) as Array<{
          path: string;
          seed?: number;
          params?: Record<string, number>;
        }>;
        entries = manifest.map((m, i) => ({
          path: m.path,
          seed: m.seed,
          params: m.params,
          index: i,
        }));
      } else {
        // Read images from directory
        const dir = resolve(source);
        const dirStat = await stat(dir);

        if (!dirStat.isDirectory()) {
          throw new Error(`Not a directory: ${dir}`);
        }

        const files = await readdir(dir);
        const imageFiles = files
          .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
          .sort();

        entries = imageFiles.map((f, i) => ({
          path: resolve(dir, f),
          index: i,
        }));
      }

      if (entries.length === 0) {
        throw new Error("No images found for montage.");
      }

      // Sort if requested
      sortEntries(entries, opts.sort as string | undefined);

      // Load images
      spinner.text = `Loading ${entries.length} image${entries.length === 1 ? "" : "s"}...`;

      const images = await Promise.all(
        entries.map(async (entry) => {
          const buffer = await readFile(entry.path);
          const metadata = await sharp(buffer).metadata();
          return {
            entry,
            buffer,
            width: metadata.width!,
            height: metadata.height!,
          };
        }),
      );

      // Determine tile dimensions
      let tileWidth: number;
      let tileHeight: number;

      if (opts.tileSize) {
        const [w, h] = (opts.tileSize as string).split("x").map(Number);
        tileWidth = w!;
        tileHeight = h!;
      } else {
        // Use first image dimensions
        tileWidth = images[0]!.width;
        tileHeight = images[0]!.height;
      }

      // Determine grid dimensions
      const count = images.length;
      let columns: number;
      let rows: number;

      if (opts.columns) {
        columns = opts.columns as number;
        rows = Math.ceil(count / columns);
      } else if (opts.rows) {
        rows = opts.rows as number;
        columns = Math.ceil(count / rows);
      } else {
        columns = Math.ceil(Math.sqrt(count));
        rows = Math.ceil(count / columns);
      }

      const gap = opts.gap as number;
      const padding = opts.padding as number;
      const background = opts.background as string;

      const totalWidth = padding * 2 + columns * tileWidth + (columns - 1) * gap;
      const totalHeight = padding * 2 + rows * tileHeight + (rows - 1) * gap;

      spinner.text = `Composing ${columns}×${rows} grid (${totalWidth}×${totalHeight})...`;

      // Build composite
      const composites: Array<{
        input: Buffer;
        left: number;
        top: number;
      }> = [];

      for (let i = 0; i < images.length; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const left = padding + col * (tileWidth + gap);
        const top = padding + row * (tileHeight + gap);

        // Resize if needed
        let tileBuffer: Buffer;
        if (images[i]!.width !== tileWidth || images[i]!.height !== tileHeight) {
          tileBuffer = await sharp(images[i]!.buffer)
            .resize(tileWidth, tileHeight, { fit: "cover" })
            .toBuffer();
        } else {
          tileBuffer = Buffer.from(images[i]!.buffer);
        }

        composites.push({ input: tileBuffer, left, top });
      }

      // Create montage canvas and composite tiles
      const montageBuffer = await sharp({
        create: {
          width: totalWidth,
          height: totalHeight,
          channels: 4,
          background: hexToRgba(background),
        },
      })
        .composite(composites)
        .png()
        .toBuffer();

      const outputPath = resolve(opts.output as string);
      await writeFile(outputPath, montageBuffer);

      spinner.succeed(
        chalk.green(
          `Montage: ${count} tile${count === 1 ? "" : "s"} → ${columns}×${rows} grid (${totalWidth}×${totalHeight}) → ${outputPath}`,
        ),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Montage failed: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function sortEntries(entries: MontageEntry[], sortKey: string | undefined): void {
  if (!sortKey) return;

  if (sortKey === "seed") {
    entries.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
  } else if (sortKey === "name") {
    entries.sort((a, b) => basename(a.path).localeCompare(basename(b.path)));
  } else if (sortKey.startsWith("param:")) {
    const paramKey = sortKey.slice(6);
    entries.sort((a, b) => {
      const va = a.params?.[paramKey] ?? 0;
      const vb = b.params?.[paramKey] ?? 0;
      return va - vb;
    });
  }
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  };
}
