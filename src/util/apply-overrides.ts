/**
 * Apply CLI overrides (seed, params, colors, width, height, preset) to a sketch definition.
 * Returns a new object — does not mutate the original.
 */

import {
  resolvePreset,
  type SketchDefinition,
  type SketchState,
  type CanvasSpec,
} from "@genart-dev/format";

export interface SketchOverrides {
  seed?: number;
  params?: Record<string, number>;
  colors?: string[];
  width?: number;
  height?: number;
  preset?: string;
}

export function applyOverrides(
  sketch: SketchDefinition,
  overrides: SketchOverrides,
): SketchDefinition {
  let canvas: CanvasSpec = { ...sketch.canvas };
  let state: SketchState = { ...sketch.state, params: { ...sketch.state.params } };

  // Preset overrides width/height
  if (overrides.preset) {
    const dims = resolvePreset(overrides.preset);
    canvas = { ...canvas, preset: overrides.preset, width: dims.width, height: dims.height };
  }

  // Explicit width/height override preset
  if (overrides.width !== undefined) canvas = { ...canvas, width: overrides.width };
  if (overrides.height !== undefined) canvas = { ...canvas, height: overrides.height };

  // Seed override
  if (overrides.seed !== undefined) {
    state = { ...state, seed: overrides.seed };
  }

  // Params override (merge with existing)
  if (overrides.params) {
    state = { ...state, params: { ...state.params, ...overrides.params } };
  }

  // Colors override (replace palette array)
  if (overrides.colors) {
    state = { ...state, colorPalette: overrides.colors };
  }

  return { ...sketch, canvas, state };
}
