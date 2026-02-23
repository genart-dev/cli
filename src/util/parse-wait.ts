/**
 * Parse a wait/duration string into milliseconds.
 * Accepts: "500", "500ms", "2s", "1.5s"
 */
export function parseWait(value: string): number {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.endsWith("ms")) {
    return Math.max(0, Number(trimmed.slice(0, -2)));
  }
  if (trimmed.endsWith("s")) {
    return Math.max(0, Number(trimmed.slice(0, -1)) * 1000);
  }

  // Bare number = ms
  const num = Number(trimmed);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid wait value: "${value}". Use "500ms" or "2s".`);
  }
  return Math.max(0, num);
}
