/**
 * Generate output filenames from a naming pattern.
 * Supported tokens: {id}, {seed}, {index}, {params}
 */

export interface NamingContext {
  id: string;
  seed: number;
  index: number;
  params: Record<string, number>;
  format: string;
}

export function formatOutputName(pattern: string, ctx: NamingContext): string {
  let result = pattern;

  result = result.replace(/\{id\}/g, ctx.id);
  result = result.replace(/\{seed\}/g, String(ctx.seed));
  result = result.replace(/\{index\}/g, String(ctx.index).padStart(4, "0"));

  if (result.includes("{params}")) {
    const paramStr = Object.entries(ctx.params)
      .map(([k, v]) => `${k}=${v}`)
      .join("_");
    result = result.replace(/\{params\}/g, paramStr || "default");
  }

  return `${result}.${ctx.format}`;
}
