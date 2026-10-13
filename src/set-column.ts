import type { Locator, Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { fail } from "./errors.js";
import { locateTitle } from "./edit.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { confirmSelected, ensureEditor, selectElement } from "./place.js";
import { findWorkbook } from "./sigma-api.js";

type Bag = Record<string, string[]>;

export type SetColumnCommand = {
  url: string;
  page?: string;
  title: string;
  columns: string[];
  sets: string[];
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

export function parseSetColumn(args: string[]): SetColumnCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "title", "column", "set"]);
  const url = one(bag, "url");
  if (!url) fail("set-column requires --url");
  const page = one(bag, "page");
  const title = one(bag, "title");
  if (!title) fail("set-column requires --title");
  const columns = bag.column ?? [];
  if (columns.length === 0) fail("set-column requires --column");
  const seen = new Set<string>();
  for (const column of columns) {
    if (column.trim() === "") fail("set-column --column is empty");
    if (seen.has(column)) fail(`Duplicate --column ${column}`);
    seen.add(column);
  }
  const sets = bag.set ?? [];
  if (sets.length === 0) fail("set-column requires --set");
  for (const value of sets) {
    if (value !== "format=date") fail(`set-column --set must be format=date, not ${JSON.stringify(value)}`);
  }
  return { url, page, title, columns, sets };
}

function menuExact(page: Page, name: string): Locator {
  return page
    .getByRole("menuitem", { name, exact: true })
    .or(page.getByRole("option", { name, exact: true }))
    .or(page.getByRole("menuitemradio", { name, exact: true }));
}

function menuMatching(page: Page, name: RegExp): Locator {
  return page.getByRole("menuitem", { name }).or(page.getByRole("option", { name })).or(page.getByRole("menuitemradio", { name }));
}

async function firstVisible(locator: Locator): Promise<Locator | undefined> {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible()) return item;
  }
  return undefined;
}

async function clickVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  for (let i = count - 1; i >= 0; i--) {
    const item = locator.nth(i);
    if (!(await item.isVisible())) continue;
    await item.click();
    return true;
  }
  return false;
}

async function menuLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"]')]
      .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0)
      .slice(0, 40),
  );
}

async function showColumns(page: Page, id: string, title: string): Promise<void> {
  await selectElement(page, id, title);
  await confirmSelected(page, id, title);
  const items = page.locator('[data-testid^="sheet-column-item-"]');
  try {
    await items.first().waitFor({ state: "visible", timeout: 5000 });
    return;
  } catch {
    const disclosure = page.getByRole("button", { name: /^columns$/i });
    if ((await disclosure.count()) > 0 && (await disclosure.first().getAttribute("aria-expanded")) !== "true") {
      await disclosure.first().click();
    }
  }
  try {
    await items.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Columns were not listed for ${JSON.stringify(title)}.`);
  }
}

async function columnItem(page: Page, column: string): Promise<Locator> {
  const index = await page.evaluate((wanted) => {
    const labelOf = (node: Element) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].findIndex((node) => labelOf(node) === wanted);
  }, column);
  if (index < 0) fail(`Column ${JSON.stringify(column)} was not found.`);
  return page.locator('[data-testid^="sheet-column-item-"]').nth(index);
}

async function openColumnMenu(page: Page, column: string, item?: Locator): Promise<void> {
  const target = item ?? (await columnItem(page, column));
  await target.hover();
  const menu = target.locator('button[aria-label="Column menu"]');
  if ((await menu.count()) < 1) fail(`Column ${JSON.stringify(column)} has no column menu.`);
  await menu.click({ force: true });
  try {
    await page.locator('[role="menu"], [role="menuitem"]').first().waitFor({ state: "visible", timeout: 3000 });
  } catch {
    fail(`Column ${JSON.stringify(column)} menu did not open.`);
  }
}

async function clickSubmenuItem(page: Page, parent: RegExp, child: string): Promise<boolean> {
  const parentItem = await firstVisible(menuMatching(page, parent));
  if (!parentItem) return false;
  const parentBox = await parentItem.boundingBox();
  await parentItem.hover();
  await page.waitForTimeout(200);
  const childItem = menuExact(page, child);
  const count = await childItem.count();
  let target = -1;
  let fallback = -1;
  for (let i = count - 1; i >= 0; i--) {
    const item = childItem.nth(i);
    if (!(await item.isVisible())) continue;
    if (fallback < 0) fallback = i;
    const box = await item.boundingBox();
    if (!parentBox || (box && box.x >= parentBox.x + 8)) {
      target = i;
      break;
    }
  }
  if (target < 0) target = fallback;
  if (target < 0) return false;
  await childItem.nth(target).click();
  return true;
}

async function confirmTypeChange(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if ((await dialog.count()) < 1) return;
  const visible = dialog.last();
  if (!(await visible.isVisible())) return;
  const confirm = visible.getByRole("button", { name: /^(confirm|change|continue)$/i });
  if ((await confirm.count()) < 1) return;
  await confirm.first().click();
}

async function clickIsoDate(page: Page): Promise<boolean> {
  const named = menuExact(page, "ISO date")
    .or(page.getByRole("radio", { name: "ISO date", exact: true }))
    .or(page.getByRole("button", { name: "ISO date", exact: true }));
  if (await clickVisible(named)) return true;
  const ymd = menuExact(page, "YYYY-MM-DD");
  if (await clickVisible(ymd)) return true;
  return page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(
        '[role="menuitem"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]',
      ),
    ];
    const labels = nodes.map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim());
    let best = -1;
    let bestLen = Number.POSITIVE_INFINITY;
    labels.forEach((label, index) => {
      if (/^iso date time\b/i.test(label)) return;
      const match = /^iso date\b/i.test(label) || label === "YYYY-MM-DD";
      if (!match || label.length >= bestLen) return;
      best = index;
      bestLen = label.length;
    });
    const node = nodes[best];
    if (!(node instanceof HTMLElement)) return false;
    node.click();
    return true;
  });
}

async function openFormatMenu(page: Page): Promise<boolean> {
  const format = await firstVisible(menuMatching(page, /^format$/i).or(menuMatching(page, /^format date$/i)));
  if (!format) return false;
  await format.hover();
  await page.waitForTimeout(200);
  if (await clickIsoDate(page)) return true;
  await format.click();
  await page.waitForTimeout(200);
  return clickIsoDate(page);
}

async function openFormatSurface(page: Page): Promise<boolean> {
  const tab = page.getByRole("tab", { name: /^format$/i });
  if ((await tab.count()) > 0 && (await tab.first().isVisible())) {
    await tab.first().click();
    return true;
  }
  const button = page.getByRole("button", { name: /^format$/i });
  if ((await button.count()) > 0 && (await button.first().isVisible())) {
    await button.first().click();
    return true;
  }
  return false;
}

async function setColumnDate(page: Page, column: string): Promise<void> {
  const item = await columnItem(page, column);
  await item.click();
  await openColumnMenu(page, column, item);
  if (await firstVisible(menuMatching(page, /^change column type$/i))) {
    const picked = await clickSubmenuItem(page, /^change column type$/i, "Date");
    if (!picked) fail(`Column ${JSON.stringify(column)} has no Date type. Menu: ${(await menuLabels(page)).join(" | ") || "(none)"}`);
    await confirmTypeChange(page);
    await page.waitForTimeout(300);
    await openColumnMenu(page, column);
  }
  if (await openFormatMenu(page)) return;
  await page.keyboard.press("Escape");
  if (!(await openFormatSurface(page))) {
    fail(`Column ${JSON.stringify(column)} has no Format menu. Menu: ${(await menuLabels(page)).join(" | ") || "(none)"}`);
  }
  await page.waitForTimeout(200);
  if (await clickIsoDate(page)) return;
  const boxes = page.getByRole("combobox");
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);
    if (!(await box.isVisible())) continue;
    const label = ((await box.getAttribute("aria-label")) || (await box.innerText()) || "").replace(/\s+/g, " ").trim();
    if (!/format|date|type/i.test(label)) continue;
    await box.click();
    await page.waitForTimeout(200);
    if (await clickIsoDate(page)) return;
  }
  fail(`Column ${JSON.stringify(column)} has no ISO date format. Menu: ${(await menuLabels(page)).join(" | ") || "(none)"}`);
}

export async function runSetColumn(args: string[]): Promise<void> {
  const parsed = parseSetColumn(args);
  await withChrome(async (page) => {
    try {
      await ensureEditor(page, parsed.url, parsed.page);
      const component = await locateTitle(page, parsed.title);
      await showColumns(page, component.id, parsed.title);
      for (const column of parsed.columns) await columnItem(page, column);
      for (const column of parsed.columns) {
        await showColumns(page, component.id, parsed.title);
        await setColumnDate(page, column);
      }
      const segment = pathSegmentFromUrl(page.url());
      const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
      markOwned(identity);
    } catch (error) {
      if (error instanceof Error && error.name === "Exit") throw error;
      fail(error instanceof Error ? error.message : String(error));
    }
    console.log(page.url());
  });
}
