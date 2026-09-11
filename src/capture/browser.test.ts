import { describe, it, expect, afterAll } from "vitest";
import { captureHtml, closeBrowser, findChromePath, withContextLossProbe } from "./browser.js";

describe("withContextLossProbe", () => {
  it("inserts the probe just inside <head>", () => {
    const out = withContextLossProbe('<!DOCTYPE html><html><head lang="en"><title>t</title></head></html>');
    expect(out.startsWith('<!DOCTYPE html><html><head lang="en"><script>')).toBe(true);
    expect(out).toContain("__genartContextLoss");
    expect(out).toContain("<title>t</title>");
  });

  it("prepends the probe when the page has no <head>", () => {
    const out = withContextLossProbe("<canvas></canvas>");
    expect(out.startsWith("<script>")).toBe(true);
    expect(out.endsWith("<canvas></canvas>")).toBe(true);
  });
});

describe.skipIf(!findChromePath())("captureHtml", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  const page = (script: string) =>
    '<!DOCTYPE html><html><head></head><body><canvas id="canvas" width="16" height="16"></canvas>' +
    `<script>${script}</script></body></html>`;

  it("captures a page whose canvas keeps its context", async () => {
    const result = await captureHtml({
      html: page("document.getElementById('canvas').getContext('2d').fillRect(0, 0, 8, 8);"),
      width: 16,
      height: 16,
      waitMs: 50,
    });
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("rejects when a canvas loses its context before capture", async () => {
    await expect(
      captureHtml({
        html: page(
          "setTimeout(function () { document.getElementById('canvas').dispatchEvent(new Event('contextlost')); }, 10);",
        ),
        width: 16,
        height: 16,
        waitMs: 200,
      }),
    ).rejects.toThrow(/context lost during render \(contextlost on #canvas\)/);
  });
});

describe("findChromePath", () => {
  it("returns a string or undefined", () => {
    const result = findChromePath();
    // On CI this may be undefined, on dev machines it should be a string
    expect(result === undefined || typeof result === "string").toBe(true);
  });

  it("respects GENART_CHROME_PATH env var", () => {
    const original = process.env["GENART_CHROME_PATH"];
    try {
      // Point to a file that exists
      process.env["GENART_CHROME_PATH"] = process.execPath;
      const result = findChromePath();
      expect(result).toBe(process.execPath);
    } finally {
      if (original !== undefined) {
        process.env["GENART_CHROME_PATH"] = original;
      } else {
        delete process.env["GENART_CHROME_PATH"];
      }
    }
  });

  it("ignores GENART_CHROME_PATH if file does not exist", () => {
    const original = process.env["GENART_CHROME_PATH"];
    try {
      process.env["GENART_CHROME_PATH"] = "/nonexistent/chrome";
      const result = findChromePath();
      // Should fall through to platform detection
      expect(result === undefined || typeof result === "string").toBe(true);
    } finally {
      if (original !== undefined) {
        process.env["GENART_CHROME_PATH"] = original;
      } else {
        delete process.env["GENART_CHROME_PATH"];
      }
    }
  });
});
