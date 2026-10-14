import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";

type Bag = Record<string, string[]>;

export type AddCsvCommand = {
  url: string;
  page?: string;
  file: string;
  title: string;
  connection: string;
};

const choiceRoles = ["option", "menuitem", "menuitemradio", "radio", "treeitem"] as const;

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

function existingFile(file: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    fail(`file not found: ${file}`);
  }
  if (!stat.isFile()) fail(`file not found: ${file}`);
}

export function parseAddCsv(args: string[]): AddCsvCommand {
  const bag = readFlags(args);
  const url = one(bag, "url");
  if (!url) fail("add-csv requires --url");
  const page = one(bag, "page");
  allow(bag, ["url", "page", "file", "title", "connection"]);
  const file = one(bag, "file");
  if (!file) fail("add-csv requires --file");
  const title = one(bag, "title");
  if (!title || title.trim() === "") fail("add-csv requires --title");
  const connection = one(bag, "connection");
  if (!connection || connection.trim() === "") fail("add-csv requires --connection");
  existingFile(file);
  const parsed: AddCsvCommand = { url, file, title, connection };
  if (page !== undefined) parsed.page = page;
  return parsed;
}

async function controlNames(page: Page): Promise<string> {
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("button, [role='menuitem'], [role='option'], [role='tab']")]
      .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0)
      .slice(0, 40),
  );
  return names.join(" | ") || "(none)";
}

async function selectableIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    const pageId = (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
    const root = pageId ? document.querySelector(`[data-layout-id="layout-body-${pageId}"]`) : document.body;
    if (!root) return [];
    return [...root.querySelectorAll("[data-selectable]")]
      .map((node) => node.getAttribute("data-selectable") || "")
      .filter((id) => id.length > 0);
  });
}

async function openAddElement(page: Page): Promise<void> {
  const data = page.getByRole("button", { name: "Data", exact: true });
  if ((await data.count()) > 0 && (await data.first().isVisible())) return;
  const add = page.getByRole("button", { name: /^add element\b/i });
  const count = await add.count();
  for (let i = 0; i < count; i++) {
    if (await add.nth(i).isVisible()) {
      await add.nth(i).click();
      await page.waitForTimeout(300);
      return;
    }
  }
  fail(`Add element control was not found. Controls: ${await controlNames(page)}`);
}

async function chooseStep(page: Page, name: string): Promise<void> {
  for (const role of ["button", "menuitem", "menuitemradio", "option", "tab"] as const) {
    const locator = page.getByRole(role, { name, exact: true });
    const count = await locator.count();
    for (let i = count - 1; i >= 0; i--) {
      const item = locator.nth(i);
      if (await item.isVisible()) {
        await item.click();
        return;
      }
    }
  }
  const text = page.getByText(name, { exact: true });
  const count = await text.count();
  for (let i = count - 1; i >= 0; i--) {
    const item = text.nth(i);
    if (await item.isVisible()) {
      await item.click();
      return;
    }
  }
  fail(`${JSON.stringify(name)} was not found. Controls: ${await controlNames(page)}`);
}

function showsConnection(raw: string, connection: string): boolean {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.includes(connection)) return true;
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat === connection || flat === `Connection ${connection}`;
}

async function clickConnectionChoice(page: Page, connection: string): Promise<boolean> {
  for (const role of choiceRoles) {
    const match = page.getByRole(role, { name: connection, exact: true });
    const count = await match.count();
    for (let i = count - 1; i >= 0; i--) {
      const item = match.nth(i);
      if (await item.isVisible()) {
        await item.click();
        return true;
      }
    }
  }
  const options = page.getByRole("option");
  const count = await options.count();
  for (let i = count - 1; i >= 0; i--) {
    const option = options.nth(i);
    if (!(await option.isVisible())) continue;
    const raw = ((await option.innerText()) || "").trim();
    const first = raw.split("\n")[0]?.trim() ?? "";
    if (first === connection || raw.replace(/\s+/g, " ").trim() === connection) {
      await option.click();
      return true;
    }
  }
  return false;
}

async function uploadRoot(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  if ((await dialog.count()) > 0 && (await dialog.last().isVisible().catch(() => false))) return dialog.last();
  return page.locator("body");
}

async function openConnectionMenu(page: Page): Promise<void> {
  const root = await uploadRoot(page);
  const openers = [
    root.getByRole("button", { name: /open options connection/i }),
    root.getByRole("combobox", { name: /connection/i }),
    root.getByRole("button", { name: /^connection$/i }),
    root.getByRole("button", { name: /select a connection/i }),
    page.getByRole("button", { name: /open options connection/i }),
    page.getByRole("combobox", { name: /connection/i }),
    root.getByRole("combobox"),
  ];
  for (const opener of openers) {
    if ((await opener.count()) < 1) continue;
    if (!(await opener.first().isVisible().catch(() => false))) continue;
    await opener.first().click();
    try {
      await page.getByRole("option").first().waitFor({ state: "visible", timeout: 3000 });
      return;
    } catch {
      continue;
    }
  }
  const clicked = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label, span, div, p")].find((node) => {
      const own = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return own === "Connection" || (node.childElementCount === 0 && (node.textContent || "").replace(/\s+/g, " ").trim() === "Connection");
    });
    const container = label?.parentElement;
    const button = container?.querySelector("button, [role='combobox']");
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    return false;
  });
  if (!clicked) fail("CSV dialog has no connection control.");
  try {
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Connection options did not open.");
  }
}

async function connectionControlText(page: Page): Promise<string | undefined> {
  const root = await uploadRoot(page);
  const named = root.getByRole("combobox", { name: /connection/i });
  if ((await named.count()) > 0) {
    const text = ((await named.first().innerText()) || "").trim();
    if (text) return text;
  }
  const combo = root.getByRole("combobox");
  if ((await combo.count()) === 1) {
    const text = ((await combo.first().innerText()) || "").trim();
    if (text) return text;
  }
  return undefined;
}

async function selectConnection(page: Page, connection: string): Promise<void> {
  if (!(await clickConnectionChoice(page, connection))) {
    await openConnectionMenu(page);
    if (!(await clickConnectionChoice(page, connection))) {
      const names = await page.evaluate(() =>
        [...document.querySelectorAll("[role='option'], [role='menuitem'], [role='menuitemradio'], [role='radio']")]
          .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
          .filter((value) => value.length > 0)
          .slice(0, 40),
      );
      fail(`Connection ${JSON.stringify(connection)} was not found. Connections: ${names.join(" | ") || "(none)"}`);
    }
  }
  const deadline = Date.now() + 5000;
  let shown: string | undefined;
  while (Date.now() < deadline) {
    shown = await connectionControlText(page);
    if (shown === undefined || showsConnection(shown, connection)) return;
    await page.waitForTimeout(200);
  }
  fail(`Connection is ${JSON.stringify(shown ?? "")}, expected ${JSON.stringify(connection)}.`);
}

async function clickSave(page: Page): Promise<void> {
  const root = await uploadRoot(page);
  const scoped = root.getByRole("button", { name: "Save", exact: true });
  const save = (await scoped.count()) > 0 ? scoped.last() : page.getByRole("button", { name: "Save", exact: true }).last();
  try {
    await save.waitFor({ state: "visible", timeout: 30000 });
  } catch {
    fail("Save was not found.");
  }
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await save.isEnabled()) {
      await save.click();
      return;
    }
    await page.waitForTimeout(500);
  }
  fail("Save was not available.");
}

async function csvDialogOpen(page: Page): Promise<boolean> {
  const heading = page.getByRole("heading", { name: /upload csv|select source/i });
  if ((await heading.count()) > 0 && (await heading.first().isVisible().catch(() => false))) return true;
  const dialog = page.getByRole("dialog");
  const count = await dialog.count();
  for (let i = 0; i < count; i++) {
    const item = dialog.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;
    const text = ((await item.innerText().catch(() => "")) || "").toLowerCase();
    const hasFile = (await item.locator("input[type=file]").count()) > 0;
    if (text.includes("csv") || (text.includes("connection") && hasFile)) {
      return true;
    }
  }
  return false;
}

async function waitForNewElement(page: Page, before: Set<string>): Promise<string> {
  const deadline = Date.now() + 120000;
  let latest: string[] = [];
  while (Date.now() < deadline) {
    latest = [...new Set(await selectableIds(page))].filter((id) => !before.has(id));
    if (latest.length === 1 && !(await csvDialogOpen(page))) {
      const id = latest[0];
      await page.waitForTimeout(800);
      const again = [...new Set(await selectableIds(page))].filter((item) => !before.has(item));
      if (again.length === 1 && again[0] === id) return id;
    }
    await page.waitForTimeout(500);
  }
  fail(`Expected one new element, found ${latest.length}: ${latest.join(", ") || "(none)"}`);
}

async function canvasTitle(page: Page, id: string): Promise<string> {
  const node = page.locator(`[data-selectable="${id}"] [data-testid="dynamic-title"]`).first();
  return ((await node.innerText().catch(() => "")) || "").trim();
}

async function renameTitle(page: Page, id: string, title: string): Promise<void> {
  const field = page.locator(`[data-selectable="${id}"] [data-testid="dynamic-title"] [contenteditable="true"]`).first();
  try {
    await field.click({ timeout: 5000 });
  } catch {
    fail(`Element ${id} has no title to rename.`);
  }
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(title);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  try {
    await page.waitForFunction(
      ({ elementId, wanted }) => {
        const node = document.querySelector(`[data-selectable="${elementId}"] [data-testid="dynamic-title"]`);
        if (!(node instanceof HTMLElement)) return false;
        const active = document.activeElement;
        if (active instanceof HTMLElement && node.contains(active) && active.isContentEditable) return false;
        return (node.textContent || "").trim() === wanted;
      },
      { elementId: id, wanted: title },
      { timeout: 5000 },
    );
  } catch {
    const seen = ((await page.locator(`[data-selectable="${id}"] [data-testid="dynamic-title"]`).first().innerText().catch(() => "")) || "").trim();
    fail(`Title is ${JSON.stringify(seen)}, expected ${JSON.stringify(title)}.`);
  }
}

async function uploadCsv(page: Page, parsed: AddCsvCommand): Promise<void> {
  const before = new Set(await selectableIds(page));
  await openAddElement(page);
  await page.waitForTimeout(300);
  await chooseStep(page, "Data");
  await page.waitForTimeout(300);
  await chooseStep(page, "Table");
  await page.waitForTimeout(300);
  await chooseStep(page, "CSV");
  const ready = page.getByText("Connection", { exact: true }).or(page.locator("input[type=file]"));
  try {
    await ready.first().waitFor({ state: "attached", timeout: 15000 });
  } catch (error) {
    if (error instanceof Error && error.name === "Exit") throw error;
    fail("CSV upload dialog did not open.");
  }
  await selectConnection(page, parsed.connection);
  const input = page.locator("input[type=file]");
  try {
    await input.last().waitFor({ state: "attached", timeout: 15000 });
  } catch (error) {
    if (error instanceof Error && error.name === "Exit") throw error;
    fail("CSV dialog has no file input.");
  }
  await input.last().setInputFiles(path.resolve(parsed.file));
  await clickSave(page);
  const id = await waitForNewElement(page, before);
  const seen = await canvasTitle(page, id);
  if (seen !== parsed.title) await renameTitle(page, id, parsed.title);
}

export async function runAddCsv(args: string[]): Promise<void> {
  const parsed = parseAddCsv(args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    try {
      await uploadCsv(page, parsed);
    } catch (error) {
      if (error instanceof Error && error.name === "Exit") throw error;
      fail(error instanceof Error ? error.message : String(error));
    }
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
