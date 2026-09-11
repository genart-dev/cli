/**
 * Headless capture — renders standalone HTML to an image using puppeteer-core
 * with system Chrome detection. No bundled Chromium download.
 */

import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

/** Common Chrome/Chromium install paths by platform. */
const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

/** Detect system Chrome/Chromium install path. */
export function findChromePath(): string | undefined {
  // 1. Env var override
  const envPath = process.env["GENART_CHROME_PATH"];
  if (envPath && existsSync(envPath)) return envPath;

  // 2. Platform-specific paths
  const paths = CHROME_PATHS[process.platform];
  if (!paths) return undefined;

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  return undefined;
}

/**
 * Chrome launch args that enable WebGL2 via SwANGLE (SwiftShader + ANGLE).
 * On macOS ARM, SwiftShader is broken — `headless: "new"` uses the real GPU.
 */
function getWebGLArgs(): string[] {
  const base = ["--use-gl=angle"];
  if (process.platform === "darwin" && process.arch === "arm64") {
    // macOS ARM: SwiftShader disabled on ARM per Chromium bug.
    // headless:"new" uses the full rendering pipeline with real GPU.
    return base;
  }
  return [...base, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
}

/** Shared browser instance (lazy singleton). */
let browserInstance: Browser | null = null;

/** Get or launch the shared headless browser. */
async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) {
    return browserInstance;
  }

  const executablePath = findChromePath();
  if (!executablePath) {
    throw new Error(
      "No Chrome/Chromium found. Install Google Chrome or set GENART_CHROME_PATH.\n" +
        "  macOS: brew install --cask google-chrome\n" +
        "  Linux: sudo apt install google-chrome-stable\n" +
        "  Or: GENART_CHROME_PATH=/path/to/chrome genart render ...",
    );
  }

  browserInstance = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      ...getWebGLArgs(),
    ],
  });

  return browserInstance;
}

/** Options for capturing a screenshot of an HTML page. */
export interface CaptureOptions {
  html: string;
  width: number;
  height: number;
  /** Time in ms to wait after page load before capture (default: 500). */
  waitMs?: number;
  /** Image format (default: "png"). */
  format?: "png" | "jpeg" | "webp";
  /** Lossy compression quality 0-100 (default: 80). */
  quality?: number;
  /** Device pixel ratio (default: 1). */
  scale?: number;
}

/** Result of a headless capture. */
export interface CaptureResult {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Script injected at the top of every captured page, so it is listening before
 * the sketch runs.
 *
 * Chrome can lose a canvas's GPU context mid-render (on macOS, IOSurface
 * exhaustion under heavy stamp loads) and restores it blank. Nothing redraws
 * it, so a screenshot taken afterwards is a flat background frame. Capture-phase
 * listeners on `window` see the non-bubbling loss events of every canvas in the
 * document. It has to live in the HTML itself: `setContent` calls
 * `document.open()`, which erases listeners added beforehand.
 */
const CONTEXT_LOSS_PROBE =
  "<script>(function(){var lost=window.__genartContextLoss=[];" +
  "function onLoss(e){var t=e.target;lost.push({type:e.type," +
  "canvas:t&&t.id?'#'+t.id:(t&&t.tagName?t.tagName.toLowerCase():'unknown')});}" +
  "['contextlost','webglcontextlost'].forEach(function(n){window.addEventListener(n,onLoss,true);});" +
  "})();</script>";

/** Insert the context-loss probe just inside `<head>`, or ahead of the page if it has none. */
export function withContextLossProbe(html: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return CONTEXT_LOSS_PROBE + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + CONTEXT_LOSS_PROBE + html.slice(at);
}

/** Throw if any canvas on the page lost its context since the probe was installed. */
async function assertNoContextLoss(page: Page): Promise<void> {
  const losses = (await page.evaluate("window.__genartContextLoss || []")) as {
    type: string;
    canvas: string;
  }[];
  if (losses.length === 0) return;
  const what = losses.map((l) => `${l.type} on ${l.canvas}`).join(", ");
  throw new Error(
    `Canvas context lost during render (${what}). Chrome restores a lost canvas blank, ` +
      "so this frame would be empty. Retry, or render with the GPU disabled " +
      "(point GENART_CHROME_PATH at a wrapper that runs Chrome with --disable-gpu).",
  );
}

/**
 * Render an HTML string to an image using headless Chrome.
 *
 * Rejects rather than returning a blank frame when the browser disconnects, the
 * tab crashes, or a canvas loses its context before capture. Without these
 * checks a dead render is indistinguishable from a finished one: the fixed wait
 * elapses and the screenshot is a flat background.
 */
export async function captureHtml(options: CaptureOptions): Promise<CaptureResult> {
  const {
    html,
    width,
    height,
    waitMs = 500,
    format = "png",
    quality = 80,
    scale = 1,
  } = options;

  const browser = await getBrowser();
  const page: Page = await browser.newPage();

  // Settles (rejected) the first time the browser or tab dies, so every await
  // below can race it instead of sleeping through a dead render.
  let died: Error | null = null;
  let rejectDied: (err: Error) => void = () => {};
  const death = new Promise<never>((_, reject) => {
    rejectDied = reject;
  });
  death.catch(() => {});
  const fail = (err: Error) => {
    died ??= err;
    rejectDied(died);
  };
  const onDisconnect = () => fail(new Error("Headless Chrome disconnected before capture"));
  browser.on("disconnected", onDisconnect);
  page.on("error", (err: Error) => fail(new Error(`Page crashed before capture: ${err.message}`)));

  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await Promise.race([
      page.setContent(withContextLossProbe(html), { waitUntil: "domcontentloaded", timeout: 30_000 }),
      death,
    ]);

    // Wait for the sketch to render
    if (waitMs > 0) {
      await Promise.race([new Promise((resolve) => setTimeout(resolve, waitMs)), death]);
    }
    await assertNoContextLoss(page);

    const screenshotType = format === "webp" ? "webp" : format;
    const buffer = await Promise.race([
      page.screenshot({
        type: screenshotType,
        clip: { x: 0, y: 0, width, height },
        ...(screenshotType !== "png" ? { quality } : {}),
      }),
      death,
    ]);
    await assertNoContextLoss(page);

    const bytes = new Uint8Array(buffer);
    const mimeType = `image/${format}`;

    return { bytes, mimeType, width, height };
  } finally {
    browser.off("disconnected", onDisconnect);
    // Closing a dead tab throws, and that error would replace the real one.
    if (died) await page.close().catch(() => undefined);
    else await page.close();
  }
}

/**
 * Create and return a new page with the given viewport.
 * The caller manages the page lifecycle (must close it when done).
 * Used by the video command for direct page access (time injection).
 */
export async function getPage(
  width: number,
  height: number,
  scale = 1,
): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  return page;
}

/** Close the shared browser instance. */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
