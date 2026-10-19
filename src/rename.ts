import type { Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { locateTitle } from "./edit.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";

type Bag = Record<string, string[]>;

export type RenameCommand = {
  url: string;
  page?: string;
  title: string;
  name: string;
  unchanged: boolean;
};

function readFlags(args: string[]): Bag {
  const bag: Bag = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!flag?.startsWith("--")) fail(`Unknown argument: ${flag}`);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    const name = flag.slice(2);
    (bag[name] ??= []).push(value);
    i++;
  }
  return bag;
}

function one(bag: Bag, name: string): string | undefined {
  const values = bag[name];
  if (!values) return undefined;
  if (values.length > 1) fail(`Duplicate --${name}`);
  return values[0];
}

function allow(bag: Bag, names: string[]): void {
  for (const name of Object.keys(bag)) {
    if (!names.includes(name)) fail(`Unknown argument: --${name}`);
  }
}

export function parseRename(args: string[]): RenameCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "title", "name"]);
  const url = one(bag, "url");
  if (!url) fail("rename requires --url");
  const page = one(bag, "page");
  const title = one(bag, "title");
  if (!title) fail("rename requires --title");
  const name = one(bag, "name");
  if (!name) fail("rename requires --name");
  return { url, page, title, name, unchanged: title === name };
}

async function readCanvasTitle(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const node =
      document.querySelector(`[data-testid="element_${elementId}"] [data-testid="dynamic-title"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"] [data-testid="dynamic-title"]`) ??
      document.querySelector(`[data-selectable="${elementId}"] [data-testid="dynamic-title"]`);
    return (node?.textContent || "").trim();
  }, id);
}

async function writeTitle(page: Page, id: string, title: string): Promise<void> {
  const write = async () => {
    const editable = page.locator(`[data-testid="element_${id}"] [data-testid="dynamic-title"] [contenteditable="true"]`).first();
    const titled = page.locator(`[data-testid="element_${id}"] [data-testid="dynamic-title"]`).first();
    const selectable = page.locator(`[data-selectable="${id}"] [data-testid="dynamic-title"]`).first();
    const target = (await editable.count()) > 0 ? editable : (await titled.count()) > 0 ? titled : selectable;
    try {
      await target.click({ force: true, timeout: 5000 });
    } catch {
      fail(`Element ${id} has no title to rename.`);
    }
    await page.keyboard.press("Meta+A");
    await page.keyboard.insertText(title);
    await page.keyboard.press("Enter");
  };
  await write();
  await page.waitForTimeout(600);
  let seen = await readCanvasTitle(page, id);
  if (seen !== title) {
    await write();
    await page.waitForTimeout(600);
    seen = await readCanvasTitle(page, id);
  }
  if (seen !== title) fail(`Title is ${JSON.stringify(seen)}, expected ${JSON.stringify(title)}.`);
}

export async function runRename(args: string[]): Promise<void> {
  const parsed = parseRename(args);
  if (parsed.unchanged) return;
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const component = await locateTitle(page, parsed.title);
    await writeTitle(page, component.id, parsed.name);
    const seen = await readCanvasTitle(page, component.id);
    if (seen !== parsed.name) fail(`Title is ${JSON.stringify(seen)}, expected ${JSON.stringify(parsed.name)}.`);
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
