import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { fail } from "./errors.js";

export const CDP_URL = process.env.SIGMA_PLAYWRITE_CLI_CDP || "http://127.0.0.1:9333";

export const RELAUNCH_MESSAGE = `Chrome is not listening on ${CDP_URL}.
Quit Chrome yourself, then:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  --remote-debugging-port=9333 \\
  --user-data-dir="$HOME/.sigma-playwrite-cli/chrome-data"`;

/** Survives navigation, so the next command finds the tab this CLI opened. */
const CLI_TAB = "sigma-playwrite-cli";

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

/** True when both URLs are the same workbook's edit path. Query and hash do not matter. */
export function sameEditor(current: string, target: string): boolean {
  try {
    const here = new URL(current);
    const wanted = new URL(toEditUrl(target));
    if (here.origin !== wanted.origin) return false;
    const path = here.pathname.replace(/\/$/, "");
    if (!path.endsWith("/edit")) return false;
    return pathSegmentFromUrl(here.href) === pathSegmentFromUrl(wanted.href);
  } catch {
    return false;
  }
}

function isInternalPage(url: string): boolean {
  return url.startsWith("chrome://") || url.startsWith("devtools://");
}

async function tabName(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => window.name);
  } catch {
    return "";
  }
}

async function reusePage(context: BrowserContext, url: string): Promise<Page> {
  const pages = context.pages().filter((page) => !isInternalPage(page.url()));
  const named: Page[] = [];
  const onWorkbook: Page[] = [];
  for (const page of pages) {
    const name = await tabName(page);
    if (name === CLI_TAB) named.push(page);
    if (sameEditor(page.url(), url)) onWorkbook.push(page);
  }
  const stay = onWorkbook.find((page) => named.includes(page)) ?? onWorkbook[0];
  if (stay) return stay;
  const ours = named[0];
  if (ours) return ours;
  const page = await context.newPage();
  await page.evaluate((name) => {
    window.name = name;
  }, CLI_TAB);
  return page;
}

/**
 * Attach to the already logged-in Chrome, use one tab, then detach.
 * Never call page.close(). browser.close() on a CDP connection only drops
 * the debugging socket. It does not quit Chrome and it does not close the tab.
 */
export async function withChrome<T>(url: string, fn: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  } catch {
    fail(RELAUNCH_MESSAGE);
  }
  try {
    const context = browser.contexts()[0];
    if (!context) fail("Chrome attached, but it has no default context.");
    const page = await reusePage(context, url);
    return await fn(page);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
