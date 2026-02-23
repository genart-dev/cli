import { describe, it, expect, vi } from "vitest";
import { buildTimeOffsetScript, injectTimeOffset } from "./time-inject.js";

describe("buildTimeOffsetScript", () => {
  it("includes the offset value", () => {
    const script = buildTimeOffsetScript(5000);
    expect(script).toContain("5000");
  });

  it("patches performance.now", () => {
    const script = buildTimeOffsetScript(1000);
    expect(script).toContain("performance.now");
    expect(script).toContain("__origPerfNow");
  });

  it("patches Date.now", () => {
    const script = buildTimeOffsetScript(1000);
    expect(script).toContain("Date.now");
    expect(script).toContain("__origDateNow");
  });

  it("patches requestAnimationFrame", () => {
    const script = buildTimeOffsetScript(1000);
    expect(script).toContain("requestAnimationFrame");
    expect(script).toContain("__origRAF");
  });

  it("wraps in an IIFE for scope isolation", () => {
    const script = buildTimeOffsetScript(1000);
    expect(script).toContain("(() => {");
    expect(script).toContain("})()");
  });
});

describe("injectTimeOffset", () => {
  it("calls page.evaluate with the time offset script", async () => {
    const mockPage = { evaluate: vi.fn().mockResolvedValue(undefined) };
    await injectTimeOffset(mockPage as any, 3000);

    expect(mockPage.evaluate).toHaveBeenCalledOnce();
    const script = mockPage.evaluate.mock.calls[0][0] as string;
    expect(script).toContain("3000");
    expect(script).toContain("performance.now");
  });

  it("handles zero offset", async () => {
    const mockPage = { evaluate: vi.fn().mockResolvedValue(undefined) };
    await injectTimeOffset(mockPage as any, 0);

    expect(mockPage.evaluate).toHaveBeenCalledOnce();
    const script = mockPage.evaluate.mock.calls[0][0] as string;
    expect(script).toContain("const __OFFSET = 0;");
  });
});
