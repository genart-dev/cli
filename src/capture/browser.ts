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
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
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
 * Render an HTML string to an image using headless Chrome.
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

  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for the sketch to render
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const screenshotType = format === "webp" ? "webp" : format;
    const buffer = await page.screenshot({
      type: screenshotType,
      clip: { x: 0, y: 0, width, height },
      ...(screenshotType !== "png" ? { quality } : {}),
    });

    const bytes = new Uint8Array(buffer);
    const mimeType = `image/${format}`;

    return { bytes, mimeType, width, height };
  } finally {
    await page.close();
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
