/**
 * Parameter animation interpolation and easing functions for video rendering.
 */

/** A single parameter animation specification. */
export interface AnimateSpec {
  key: string;
  start: number;
  end: number;
}

/** An easing function mapping [0,1] → [0,1]. */
export type EasingFn = (t: number) => number;

/** Available easing functions. */
export const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/**
 * Parse an --animate flag value: "param=start:end"
 * @example parseAnimate("amplitude=0:1") → { key: "amplitude", start: 0, end: 1 }
 */
export function parseAnimate(value: string): AnimateSpec {
  const eqIdx = value.indexOf("=");
  if (eqIdx < 1) {
    throw new Error(
      `Invalid --animate format: "${value}". Expected "param=start:end"`,
    );
  }

  const key = value.slice(0, eqIdx);
  const range = value.slice(eqIdx + 1);
  const parts = range.split(":");

  if (parts.length !== 2) {
    throw new Error(
      `Invalid --animate range: "${value}". Expected "param=start:end"`,
    );
  }

  const start = Number(parts[0]);
  const end = Number(parts[1]);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(
      `Invalid --animate values: "${value}". Start and end must be numbers`,
    );
  }

  return { key, start, end };
}

/**
 * Interpolate animated parameters at a normalized time t ∈ [0, 1].
 * Returns a record of parameter key → interpolated value.
 */
export function interpolateParams(
  specs: AnimateSpec[],
  t: number,
  easing: EasingFn,
): Record<string, number> {
  const easedT = easing(Math.max(0, Math.min(1, t)));
  const result: Record<string, number> = {};

  for (const spec of specs) {
    result[spec.key] = spec.start + (spec.end - spec.start) * easedT;
  }

  return result;
}

/**
 * Collect repeatable --animate flags into an array.
 * Commander calls this for each --animate value.
 */
export function collectAnimates(value: string, prev: string[]): string[] {
  return [...prev, value];
}
