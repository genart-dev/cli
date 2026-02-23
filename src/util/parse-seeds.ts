/**
 * Parse seed range/list strings into arrays of seed numbers.
 * Accepts: "1-100", "1,5,42,99", "1-5,10,20-25"
 */
export function parseSeeds(value: string): number[] {
  const seeds: number[] = [];

  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = Number(startStr);
      const end = Number(endStr);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
        throw new Error(`Invalid seed range: "${trimmed}". Use "1-100".`);
      }
      for (let i = start; i <= end; i++) {
        seeds.push(i);
      }
    } else {
      const n = Number(trimmed);
      if (Number.isNaN(n) || !Number.isInteger(n)) {
        throw new Error(`Invalid seed value: "${trimmed}". Must be an integer.`);
      }
      seeds.push(n);
    }
  }

  if (seeds.length === 0) {
    throw new Error(`No seeds parsed from: "${value}"`);
  }

  return seeds;
}
