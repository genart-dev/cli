/**
 * Time offset injection for video frame capture.
 *
 * Monkey-patches performance.now(), Date.now(), and requestAnimationFrame
 * in the browser page so animated sketches render at the desired time offset.
 */

import type { Page } from "puppeteer-core";

/**
 * Build the JavaScript string that patches timing APIs with the given offset.
 * Exported for testing — the video command uses injectTimeOffset() directly.
 */
export function buildTimeOffsetScript(offsetMs: number): string {
  return `
    (() => {
      const __OFFSET = ${offsetMs};
      const __origPerfNow = performance.now.bind(performance);
      const __origDateNow = Date.now.bind(Date);
      const __origRAF = window.requestAnimationFrame.bind(window);
      performance.now = () => __origPerfNow() + __OFFSET;
      Date.now = () => __origDateNow() + __OFFSET;
      window.requestAnimationFrame = (cb) => __origRAF((ts) => cb(ts + __OFFSET));
    })();
  `;
}

/**
 * Inject a time offset into the page's timing APIs.
 * Call this AFTER the page has loaded and the sketch has initialized
 * (so the sketch captures real start-time references).
 */
export async function injectTimeOffset(
  page: Page,
  offsetMs: number,
): Promise<void> {
  await page.evaluate(buildTimeOffsetScript(offsetMs));
}
