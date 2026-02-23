/**
 * Auto-detect renderer type from algorithm source code.
 * Returns detected type with confidence level.
 */

import type { RendererType } from "@genart-dev/format";

export interface DetectionResult {
  type: RendererType;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

export function detectRenderer(source: string): DetectionResult | null {
  const results: Array<DetectionResult & { score: number }> = [];

  // GLSL detection — check first since it's most distinct
  const glslSignals: string[] = [];
  if (/^\s*#version\s+/m.test(source)) glslSignals.push("#version directive");
  if (/void\s+main\s*\(\s*\)/.test(source)) glslSignals.push("void main()");
  if (/gl_Frag(Color|Coord)/i.test(source)) glslSignals.push("gl_Frag* builtins");
  if (/\b(uniform|varying|attribute)\s+/m.test(source)) glslSignals.push("GLSL qualifiers");
  if (/\b(vec[234]|mat[234]|sampler2D)\b/.test(source)) glslSignals.push("GLSL types");
  if (glslSignals.length >= 2) {
    results.push({
      type: "glsl",
      confidence: glslSignals.length >= 3 ? "high" : "medium",
      signals: glslSignals,
      score: glslSignals.length * 10,
    });
  }

  // p5 detection
  const p5Signals: string[] = [];
  if (/function\s+sketch\s*\(\s*p\s*[,)]/.test(source)) p5Signals.push("sketch(p, ...) signature");
  if (/p\.(setup|draw|createCanvas)\b/.test(source)) p5Signals.push("p5 instance methods");
  if (/p\.(background|fill|stroke|ellipse|rect|line|vertex|bezier)\b/.test(source)) p5Signals.push("p5 drawing API");
  if (/p\.(random|noise|map|lerp|constrain)\b/.test(source)) p5Signals.push("p5 math utilities");
  if (/p\.(push|pop|translate|rotate|scale)\b/.test(source)) p5Signals.push("p5 transforms");
  if (/p\.randomSeed\b/.test(source)) p5Signals.push("p5 randomSeed");
  if (p5Signals.length >= 2) {
    results.push({
      type: "p5",
      confidence: p5Signals.length >= 3 ? "high" : "medium",
      signals: p5Signals,
      score: p5Signals.length * 10,
    });
  }

  // Canvas2D detection
  const canvas2dSignals: string[] = [];
  if (/function\s+sketch\s*\(\s*ctx\s*[,)]/.test(source)) canvas2dSignals.push("sketch(ctx, ...) signature");
  if (/ctx\.(fillRect|strokeRect|clearRect)\b/.test(source)) canvas2dSignals.push("Canvas2D rect methods");
  if (/ctx\.(beginPath|moveTo|lineTo|arc|closePath)\b/.test(source)) canvas2dSignals.push("Canvas2D path API");
  if (/ctx\.(fillStyle|strokeStyle|lineWidth|globalAlpha)\b/.test(source)) canvas2dSignals.push("Canvas2D style props");
  if (/ctx\.(save|restore|translate|rotate|scale)\b/.test(source)) canvas2dSignals.push("Canvas2D transforms");
  if (canvas2dSignals.length >= 2) {
    results.push({
      type: "canvas2d",
      confidence: canvas2dSignals.length >= 3 ? "high" : "medium",
      signals: canvas2dSignals,
      score: canvas2dSignals.length * 10,
    });
  }

  // Three.js detection
  const threeSignals: string[] = [];
  if (/\bTHREE\b/.test(source)) threeSignals.push("THREE namespace");
  if (/new\s+THREE\.\w+/.test(source)) threeSignals.push("THREE constructor calls");
  if (/THREE\.(Scene|PerspectiveCamera|WebGLRenderer|Mesh|BoxGeometry|SphereGeometry)\b/.test(source)) threeSignals.push("THREE core classes");
  if (/THREE\.(MeshBasicMaterial|MeshStandardMaterial|ShaderMaterial)\b/.test(source)) threeSignals.push("THREE materials");
  if (/THREE\.(Vector[23]|Color|Euler)\b/.test(source)) threeSignals.push("THREE math types");
  if (threeSignals.length >= 2) {
    results.push({
      type: "three",
      confidence: threeSignals.length >= 3 ? "high" : "medium",
      signals: threeSignals,
      score: threeSignals.length * 10,
    });
  }

  // SVG detection
  const svgSignals: string[] = [];
  if (/document\.createElementNS\s*\(\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(source)) svgSignals.push("SVG namespace createElement");
  if (/\.(setAttribute|getAttribute)\s*\(\s*["'](d|viewBox|fill|stroke|transform)["']/.test(source)) svgSignals.push("SVG attribute methods");
  if (/\b(path|circle|rect|line|polygon|polyline|ellipse|g|svg)\b/.test(source) && /createElementNS|innerHTML/.test(source)) svgSignals.push("SVG element names");
  if (/\bM\s*[\d.-]+[\s,]+[\d.-]+.*[LQCZ]/i.test(source)) svgSignals.push("SVG path data");
  if (svgSignals.length >= 1) {
    results.push({
      type: "svg",
      confidence: svgSignals.length >= 2 ? "high" : svgSignals.length >= 1 ? "medium" : "low",
      signals: svgSignals,
      score: svgSignals.length * 10,
    });
  }

  if (results.length === 0) return null;

  // Return highest scoring match
  results.sort((a, b) => b.score - a.score);
  const best = results[0]!;
  return { type: best.type, confidence: best.confidence, signals: best.signals };
}

/**
 * Detect parameters referenced in source code.
 * Looks for state.PARAMS.xxx patterns.
 */
export function detectParams(source: string): string[] {
  const keys = new Set<string>();
  const regex = /(?:state\.PARAMS|PARAMS)\.(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    keys.add(match[1]!);
  }
  return [...keys];
}

/**
 * Detect color slot count from source.
 * Looks for state.COLORS[n] or COLORS.xxx patterns.
 */
export function detectColorCount(source: string): number {
  const indexRefs = new Set<number>();
  const keyRefs = new Set<string>();

  // COLORS[0], COLORS[1], etc.
  const indexRegex = /(?:state\.COLORS|COLORS)\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = indexRegex.exec(source)) !== null) {
    indexRefs.add(Number(match[1]));
  }

  // COLORS.background, COLORS.primary, etc.
  const keyRegex = /(?:state\.COLORS|COLORS)\.(\w+)/g;
  while ((match = keyRegex.exec(source)) !== null) {
    keyRefs.add(match[1]!);
  }

  return Math.max(indexRefs.size, keyRefs.size);
}

/**
 * Detect canvas dimensions from source code.
 * Looks for createCanvas(w, h) calls.
 */
export function detectCanvasSize(source: string): { width: number; height: number } | null {
  const match = source.match(/createCanvas\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return null;
}
