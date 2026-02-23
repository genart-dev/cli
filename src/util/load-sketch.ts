/**
 * Load and parse a .genart file from disk.
 */

import { readFile } from "node:fs/promises";
import { parseGenart, type SketchDefinition } from "@genart-dev/format";

export async function loadSketch(filePath: string): Promise<SketchDefinition> {
  const raw = await readFile(filePath, "utf-8");
  const json: unknown = JSON.parse(raw);
  return parseGenart(json);
}
