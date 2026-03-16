import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { SketchDefinition, DesignLayer } from "@genart-dev/format";

export interface CompileGsOptions {
  width?: number;
  height?: number;
  seed?: number;
  title?: string;
}

/**
 * Compile a `.gs` (GenArt Script) file to a SketchDefinition.
 * Params, colors, and layers declared in the source are extracted and placed
 * into the definition so downstream overrides and HTML generation work normally.
 */
export async function compileGsToDefinition(
  filePath: string,
  opts: CompileGsOptions = {},
): Promise<SketchDefinition> {
  const { compile } = await import("@genart-dev/genart-script");
  const source = await readFile(filePath, "utf-8");
  const result = compile(source);
  if (!result.ok) {
    const messages = result.errors
      .map((e) => `  ${e.line}:${e.col} ${e.message}`)
      .join("\n");
    throw new Error(`GenArt Script compile errors:\n${messages}`);
  }

  const now = new Date().toISOString();
  const id = basename(filePath, extname(filePath))
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  const title =
    opts.title ??
    id
      .split("-")
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ");
  const w = opts.width ?? 600;
  const h = opts.height ?? 600;

  const sketch: SketchDefinition = {
    genart: "1.0",
    id,
    title,
    created: now,
    modified: now,
    renderer: { type: "genart" },
    canvas: { width: w, height: h },
    parameters: result.params.map((p) => ({
      key: p.key,
      label: p.label,
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
      seed: opts.seed ?? 42,
      params: Object.fromEntries(
        result.params.map((p) => [p.key, p.default]),
      ),
      colorPalette: result.colors.map((c) => c.default),
    },
    algorithm: source,
    ...(result.layers.length > 0 && {
      layers: result.layers.map(
        (l, i): DesignLayer => ({
          id: `layer-${i}`,
          type: l.type,
          name: l.name ?? `${l.type} (${l.preset})`,
          visible: l.visible ?? true,
          locked: false,
          opacity: l.opacity ?? 1,
          blendMode: (l.blend ?? "normal") as DesignLayer["blendMode"],
          transform: {
            x: 0,
            y: 0,
            width: w,
            height: h,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            anchorX: 0,
            anchorY: 0,
          },
          properties: {
            preset: l.preset,
            ...(l.opacityParam && { __opacityParam: l.opacityParam }),
          },
        }),
      ),
    }),
  };

  return sketch;
}
