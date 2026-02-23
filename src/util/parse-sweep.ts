/**
 * Parse a parameter sweep string into structured sweep data.
 * Accepts: "amplitude=0:1:0.1" → { key: "amplitude", min: 0, max: 1, step: 0.1, values: [0, 0.1, 0.2, ...] }
 */
export interface SweepSpec {
  key: string;
  min: number;
  max: number;
  step: number;
  values: number[];
}

export function parseSweep(value: string): SweepSpec {
  const match = value.match(/^([^=]+)=([^:]+):([^:]+):(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid sweep format: "${value}". Use "param=min:max:step" (e.g. "amplitude=0:1:0.1").`,
    );
  }

  const [, key, minStr, maxStr, stepStr] = match;
  const min = Number(minStr);
  const max = Number(maxStr);
  const step = Number(stepStr);

  if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(step)) {
    throw new Error(`Invalid numeric values in sweep: "${value}".`);
  }
  if (step <= 0) {
    throw new Error(`Sweep step must be positive: "${value}".`);
  }
  if (min > max) {
    throw new Error(`Sweep min must be ≤ max: "${value}".`);
  }

  const values: number[] = [];
  // Use epsilon-based comparison to handle floating point
  for (let v = min; v <= max + step * 0.001; v += step) {
    values.push(Math.round(v * 1e10) / 1e10);
  }
  // Ensure we don't exceed max
  if (values.length > 0 && values[values.length - 1]! > max) {
    values.pop();
  }

  return { key: key!, min, max, step, values };
}

/**
 * Generate the cartesian product of seed list × sweep value lists.
 * Returns array of { seed, params } combos.
 */
export function cartesianProduct(
  seeds: number[],
  sweeps: SweepSpec[],
): Array<{ seed: number; params: Record<string, number> }> {
  if (sweeps.length === 0) {
    return seeds.map((seed) => ({ seed, params: {} }));
  }

  // Build all param combinations from sweeps
  const paramCombos = sweepProduct(sweeps);

  const results: Array<{ seed: number; params: Record<string, number> }> = [];
  for (const seed of seeds) {
    for (const params of paramCombos) {
      results.push({ seed, params });
    }
  }

  return results;
}

function sweepProduct(sweeps: SweepSpec[]): Array<Record<string, number>> {
  if (sweeps.length === 0) return [{}];

  const [first, ...rest] = sweeps;
  const restCombos = sweepProduct(rest);
  const results: Array<Record<string, number>> = [];

  for (const value of first!.values) {
    for (const combo of restCombos) {
      results.push({ [first!.key]: value, ...combo });
    }
  }

  return results;
}
