import { describe, it, expect } from "vitest";
import { detectRenderer, detectParams, detectColorCount, detectCanvasSize } from "./renderer.js";

describe("detectRenderer", () => {
  it("detects p5 from sketch(p, state) signature + p5 methods", () => {
    const source = `
      function sketch(p, state) {
        p.setup = () => { p.createCanvas(600, 600); p.randomSeed(state.SEED); };
        p.draw = () => { p.background(0); p.fill(255); p.ellipse(100, 100, 50); };
      }
    `;
    const result = detectRenderer(source);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("p5");
    expect(result!.confidence).toBe("high");
  });

  it("detects canvas2d from sketch(ctx, state) signature + ctx methods", () => {
    const source = `
      function sketch(ctx, state) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 600, 600);
        ctx.beginPath();
        ctx.arc(300, 300, 50, 0, Math.PI * 2);
      }
    `;
    const result = detectRenderer(source);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("canvas2d");
    expect(result!.confidence).toBe("high");
  });

  it("detects three.js from THREE namespace usage", () => {
    const source = `
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer();
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    `;
    const result = detectRenderer(source);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("three");
    expect(result!.confidence).toBe("high");
  });

  it("detects GLSL from shader pragmas", () => {
    const source = `
      #version 300 es
      precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      out vec4 fragColor;
      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
      }
    `;
    const result = detectRenderer(source);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("glsl");
    expect(result!.confidence).toBe("high");
  });

  it("returns null for unrecognizable source", () => {
    const result = detectRenderer("console.log('hello world');");
    expect(result).toBeNull();
  });
});

describe("detectParams", () => {
  it("extracts parameter keys from state.PARAMS references", () => {
    const source = `
      const amp = state.PARAMS.amplitude;
      const freq = PARAMS.frequency;
      const decay = state.PARAMS.decay;
    `;
    expect(detectParams(source)).toEqual(["amplitude", "frequency", "decay"]);
  });

  it("deduplicates repeated references", () => {
    const source = `
      state.PARAMS.x + state.PARAMS.x + state.PARAMS.y
    `;
    expect(detectParams(source)).toEqual(["x", "y"]);
  });
});

describe("detectColorCount", () => {
  it("counts indexed COLORS references", () => {
    const source = `
      COLORS[0], COLORS[1], COLORS[2]
    `;
    expect(detectColorCount(source)).toBe(3);
  });

  it("counts keyed COLORS references", () => {
    const source = `
      state.COLORS.background + state.COLORS.primary
    `;
    expect(detectColorCount(source)).toBe(2);
  });
});

describe("detectCanvasSize", () => {
  it("detects createCanvas(w, h) calls", () => {
    const source = `p.createCanvas(800, 600);`;
    expect(detectCanvasSize(source)).toEqual({ width: 800, height: 600 });
  });

  it("returns null when no createCanvas found", () => {
    expect(detectCanvasSize("function draw() {}")).toBeNull();
  });
});
