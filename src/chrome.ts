import { chromium, type Browser, type Page } from "playwright";
import { fail } from "./errors.js";

export const CDP_URL = process.env.SIGMA_PLAYWRITE_CLI_CDP || "http://127.0.0.1:9222";

export const RELAUNCH_MESSAGE = `Chrome is not listening on ${CDP_URL}.
Quit Chrome yourself, then:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  --remote-debugging-port=9222 \\
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"`;

/**
 * Attach to the already logged-in Chrome. Never call browser.close(): that
 * quits the user's Chrome. Close only the tab this process opened.
 */
export async function withChrome<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  } catch {
    fail(RELAUNCH_MESSAGE);
  }
  const context = browser.contexts()[0];
  if (!context) {
    fail("Chrome attached, but it has no default context.");
  }
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function toEditUrl(raw: string): string {
  const url = new URL(raw);
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/edit")) url.pathname = `${path}/edit`;
  return url.toString();
}

export function pathSegmentFromUrl(href: string): string {
  const url = new URL(href);
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("workbook");
  const segment = index >= 0 ? parts[index + 1] : undefined;
  if (!segment || segment === "edit") {
    throw new Error(`Not a Sigma workbook URL: ${href}`);
  }
  return segment;
}
