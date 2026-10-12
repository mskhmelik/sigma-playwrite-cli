import type { Locator, Page } from "playwright";
import type { Editor } from "./editor.js";
import { fail } from "./errors.js";
import { locateTitle } from "./edit.js";
import { controlTitle } from "./handles.js";
import { readModel } from "./place.js";

async function pageTabs(page: Page): Promise<{ id: string; name: string; selected: boolean }[]> {
  return (await readModel(page)).pages;
}

async function inputTable(page: Page, id: string): Promise<boolean> {
  return page.evaluate((elementId) => {
    const host =
      document.querySelector(`[data-selectable="${elementId}"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"]`);
    if (!(host instanceof HTMLElement)) return false;
    const marker = `${host.getAttribute("data-testid") || ""} ${host.className} ${host.innerText || ""}`;
    if (/input[-_ ]?table/i.test(marker)) return true;
    if (host.querySelector("[data-testid='data-editable'], [data-testid*='input-table'], [data-testid*='inputTable'], [aria-label='Add row']")) return true;
    return /\badd row\b/i.test(marker);
  }, id);
}

async function writeControlValue(page: Page, id: string, value: string): Promise<void> {
  const host = page.locator(`[data-selectable="${id}"]`);
  const field = host.locator("input, textarea, [contenteditable='true'], [contenteditable='']").first();
  try {
    await field.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Control ${id} has no value field.`);
  }
  const editable = await field.getAttribute("contenteditable");
  if (editable !== null) {
    await field.click();
    await page.keyboard.press("Meta+A");
    if (value) await page.keyboard.type(value);
    else await page.keyboard.press("Backspace");
    return;
  }
  await field.fill(value);
}

/** Live editor. Unit tests never construct this. */
export function workbookEditor(page: Page): Editor {
  return {
    async findPage(name) {
      const tabs = await pageTabs(page);
      const matches = tabs.filter((tab) => tab.name === name);
      if (matches.length !== 1) throw new Error(`missing page ${JSON.stringify(name)}`);
      if (!matches[0].selected) {
        await page.locator(`[data-testid="page-item-${matches[0].id}"]`).click();
        await page.locator(`[data-layout-id="layout-body-${matches[0].id}"]`).waitFor({ state: "visible", timeout: 15000 });
      }
    },
    async findElement(title) {
      const found = await locateTitle(page, title);
      return { title, inputTable: await inputTable(page, found.id) };
    },
    async setControl(title, value) {
      const found = await locateTitle(page, title);
      await writeControlValue(page, found.id, value);
    },
    async clearControl(title) {
      const found = await locateTitle(page, title);
      await writeControlValue(page, found.id, "");
    },
    async clearPageControls(pageName) {
      await this.findPage(pageName);
      const titles = await page.evaluate(() => {
        const selected =
          document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
          document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
        const pageId = (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
        const root = pageId ? document.querySelector(`[data-layout-id="layout-body-${pageId}"]`) : document.body;
        if (!root) return [];
        return [...root.querySelectorAll("[data-selectable]")]
          .filter((node) => node.querySelector("input, textarea, [contenteditable='true']"))
          .map((node) => (node.querySelector('[data-testid="dynamic-title"]')?.textContent || "").trim())
          .filter((title) => title.startsWith("v.") || title.startsWith("sys."));
      });
      for (const title of titles) await writeControlValue(page, (await locateTitle(page, title)).id, "");
    },
    async openModal(name) {
      const tabs = await pageTabs(page);
      const matches = tabs.filter((tab) => tab.name === name);
      if (matches.length !== 1) throw new Error(`missing page ${JSON.stringify(name)}`);
      const id = matches[0].id;
      await page.locator(`[data-testid="page-item-${id}"]`).click();
      await page.locator(`[data-layout-id="layout-body-${id}"]`).waitFor({ state: "visible", timeout: 15000 });
    },
    async insertRow(title) {
      await editPublishedTable(page, title, async (host) => {
        await insertOnePublishedRow(page, host);
      });
    },
    async insertRows(title, rows) {
      await editPublishedTable(page, title, async (host) => {
        await pastePublishedRows(page, host, rows);
      });
    },
    async editCell(title, column, value) {
      await editPublishedTable(page, title, async (host) => {
        await typePublishedCell(page, host, column, value);
      });
    },
    async deleteRow(title) {
      await editPublishedTable(page, title, async (host) => {
        await deleteOnePublishedRow(page, host);
      });
    },
    async addPage(name) {
      await createPage(page, name);
    },
    async addInputTable(title, column) {
      await createInputTable(page, title, column);
    },
    async addTextControl(title) {
      await createTextControl(page, title);
    },
    async addButton(title) {
      await createButton(page, title);
    },
    async setInsertAction(button, table, column, controlTitle) {
      await saveButtonInsert(page, button, table, column, controlTitle);
    },
    async publish() {
      await publishWorkbook(page);
    },
  };
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

async function clickExactButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  if ((await button.count()) < 1) fail(`Button ${JSON.stringify(name)} was not found.`);
  await button.first().click();
}

async function clickMatchingButton(page: Page, pattern: RegExp): Promise<void> {
  const button = page.getByRole("button", { name: pattern });
  if ((await button.count()) < 1) {
    const names = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0)
        .slice(0, 40),
    );
    fail(`No button matched ${pattern}. Buttons: ${names.join(" | ") || "(none)"}`);
  }
  await button.first().click();
}

async function createdId(page: Page, before: Set<string>): Promise<string> {
  await page.waitForTimeout(800);
  const ids = [...new Set(await selectableIds(page))].filter((id) => !before.has(id));
  if (ids.length !== 1) fail(`Expected one new element, found ${ids.length}: ${ids.join(", ") || "(none)"}`);
  return ids[0];
}

const publishedPermission = /editable in published version \(all access levels\)/i;

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

async function createPage(page: Page, name: string): Promise<void> {
  const before = new Set((await pageTabs(page)).map((tab) => tab.id));
  await clickExactButton(page, "Add page");
  await page.waitForTimeout(600);
  const created = (await pageTabs(page)).filter((tab) => !before.has(tab.id));
  if (created.length !== 1) fail(`Expected one new page, found ${created.length}.`);
  const id = created[0].id;
  await page.locator(`[data-testid="page-dropdown-${id}"]`).click();
  await page.locator('[data-testid="menuitem-rename"]').click();
  const field = page.locator('input[aria-label^="Rename"]');
  await field.fill(name);
  await field.press("Enter");
  try {
    await page.waitForFunction(
      (pageName) => {
        const input = document.querySelector('input[aria-label^="Rename"]');
        if (input instanceof HTMLElement && input.getClientRects().length > 0) return false;
        return [...document.querySelectorAll('[data-testid^="page-item-"]')].some(
          (el) => (el.textContent || "").trim() === pageName,
        );
      },
      name,
      { timeout: 5000 },
    );
  } catch {
    fail(`Page ${JSON.stringify(name)} was not created.`);
  }
}

async function createInputTable(page: Page, title: string, column: string): Promise<void> {
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Input");
  await page.waitForTimeout(300);
  await clickMatchingButton(page, /^empty$/i);
  await page.waitForTimeout(400);
  await clickExactButton(page, "Create table");
  const id = await createdId(page, before);
  await renameTitle(page, id, title);
  const draft = page.getByRole("button", { name: /editable in draft/i });
  if ((await draft.count()) > 0) {
    await draft.first().click();
    const published = page.getByRole("menuitemradio", { name: publishedPermission });
    if ((await published.count()) > 0) await published.first().click();
    else await page.getByText("Editable in published version (all access levels)", { exact: true }).click();
  }
  try {
    await page.getByRole("button", { name: publishedPermission }).first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Input table is not editable in the published version.");
  }
  await renameInputColumn(page, column);
}

async function renameInputColumn(page: Page, column: string): Promise<void> {
  const item = page.locator('[data-testid^="sheet-column-item-"]').first();
  try {
    await item.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Input table has no column to name.");
  }
  await item.click();
  const current = ((await item.innerText()) || "").trim().split("\n")[0];
  await page.locator('[data-testid="column-menu-kebab"]').first().click();
  await page.locator('[data-testid="menuitem-rename"]').click();
  const field = page.getByRole("textbox", { name: current, exact: true });
  await field.fill(column);
  await field.press("Enter");
  try {
    await page.waitForFunction(
      (wanted) => {
        const columnItem = document.querySelector('[data-testid^="sheet-column-item-"]');
        const line = (columnItem instanceof HTMLElement ? columnItem.innerText : "").trim().split("\n")[0]?.trim();
        return line === wanted;
      },
      column,
      { timeout: 5000 },
    );
  } catch {
    fail(`Column is not ${JSON.stringify(column)}.`);
  }
}

async function createTextControl(page: Page, title: string): Promise<void> {
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Controls");
  await page.waitForTimeout(300);
  await clickMatchingButton(page, /^text input$/i);
  const id = await createdId(page, before);
  await renameTitle(page, id, title);
}

async function createButton(page: Page, title: string): Promise<void> {
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "UI");
  await page.waitForTimeout(300);
  await clickMatchingButton(page, /^button$/i);
  const id = await createdId(page, before);
  const host = page.locator(`[data-selectable="${id}"], [data-testid="element-${id}"]`).first();
  await host.click();
  const tile = page.locator('[data-testid="text-tile"]').filter({ hasText: /^Click Me$/ }).last();
  await tile.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(title);
  await page.keyboard.press("Enter");
  try {
    await host.getByRole("button", { name: title, exact: true }).waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Button label is not ${JSON.stringify(title)}.`);
  }
}

async function saveButtonInsert(
  page: Page,
  button: string,
  table: string,
  column: string,
  controlTitle: string,
): Promise<void> {
  const target = await locateTitle(page, table);
  const found = await locateTitle(page, button);
  await page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first().click();
  await page.getByRole("tab", { name: "Actions" }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("button", { name: "Open options Action" }).click();
  await page.getByRole("option", { name: "Insert row", exact: true }).click();
  const heading = page.getByRole("heading", { name: /insert row into/i });
  await heading.waitFor({ state: "visible", timeout: 5000 });
  const dialog = await insertRowDialog(page, heading);
  await selectIntoTable(page, dialog, table, target.id);
  try {
    await dialog.getByText(column, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Insert row did not target column ${JSON.stringify(column)}.`);
  }
  const handle = controlTitle.replace(/^v\./, "");
  if (!(await chipShows(dialog, controlTitle)) && !(await chipShows(dialog, handle))) {
    const row = columnRow(dialog, column);
    await chooseRowOption(page, row, ["Control"]);
    await chooseRowOption(page, row, [controlTitle, handle]);
  }
  if (!(await chipShows(dialog, column))) fail(`Insert row did not target column ${JSON.stringify(column)}.`);
  if (!(await chipShows(dialog, controlTitle)) && !(await chipShows(dialog, handle))) {
    fail(`Insert row did not take its value from ${JSON.stringify(controlTitle)}.`);
  }
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  if ((await close.count()) > 0) await close.first().click();
  else await page.getByRole("button", { name: "Close", exact: true }).last().click();
  try {
    await heading.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    fail("Insert row dialog did not close.");
  }
}

async function publishWorkbook(page: Page): Promise<void> {
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  if ((await publish.count()) < 1) fail("Publish was not found.");
  if (await publish.first().isDisabled()) fail("Publish is not available.");
  await publish.first().click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true });
  if ((await confirm.count()) === 1) await confirm.click();
  try {
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((node) => {
          const label = (node.getAttribute("aria-label") || node.textContent || "").trim();
          return label === "Publish" || label.startsWith("Publish");
        });
        return button instanceof HTMLButtonElement && (button.disabled || button.getAttribute("aria-disabled") === "true");
      },
      null,
      { timeout: 30000 },
    );
  } catch {
    fail("Publish did not finish.");
  }
}

const gridSelector = "[role='grid'], [role='table']";

function buttonLabel(aria: string | null, text: string): string {
  return (aria || text).replace(/\s+/g, " ").trim();
}

async function currentLayout(page: Page): Promise<Locator> {
  const id = await page.evaluate(() => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    return (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
  });
  if (!id) return page.locator("body");
  return page.locator(`[data-layout-id="layout-body-${id}"]`);
}

async function readControlValue(page: Page, id: string): Promise<string> {
  const host = page.locator(`[data-selectable="${id}"]`);
  const field = host.locator("input, textarea, [contenteditable='true'], [contenteditable='']").first();
  try {
    await field.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Control ${id} has no value field.`);
  }
  const editable = await field.getAttribute("contenteditable");
  if (editable !== null) return ((await field.innerText()) || "").replace(/\u00a0/g, " ").trim();
  return field.inputValue();
}

async function readColumnValue(page: Page, column: string): Promise<string> {
  const root = await currentLayout(page);
  const headers = root.getByRole("columnheader");
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    const header = headers.nth(i);
    const text = ((await header.innerText()) || "").trim().split("\n")[0]?.trim();
    if (text !== column) continue;
    const grid = root.locator(gridSelector).filter({ has: header }).last();
    const localHeaders = grid.getByRole("columnheader");
    const localCount = await localHeaders.count();
    let index = -1;
    for (let h = 0; h < localCount; h++) {
      const line = ((await localHeaders.nth(h).innerText()) || "").trim().split("\n")[0]?.trim();
      if (line === column) {
        index = h;
        break;
      }
    }
    if (index < 0) continue;
    const rows = grid.getByRole("row");
    const rowCount = await rows.count();
    for (let r = 0; r < rowCount; r++) {
      const row = rows.nth(r);
      if ((await row.getByRole("columnheader").count()) > 0) continue;
      const cells = row.getByRole("gridcell").or(row.getByRole("cell"));
      if ((await cells.count()) <= index) continue;
      const cell = cells.nth(index);
      const input = cell.locator("input, textarea").first();
      if ((await input.count()) > 0) return input.inputValue();
      return ((await cell.innerText()) || "").trim();
    }
    fail(`Column ${JSON.stringify(column)} has no value.`);
  }
  fail(`Column ${JSON.stringify(column)} was not found.`);
}

/** Reads `--from-handle` and `--column` for set-control. Static values do not use this. */
export function sourceLookup(page: Page): {
  control: (handle: string) => Promise<string>;
  column: (column: string) => Promise<string>;
} {
  return {
    async control(handle) {
      const title = controlTitle("variable", handle);
      const found = await locateTitle(page, title);
      return readControlValue(page, found.id);
    },
    column: (column) => readColumnValue(page, column),
  };
}

async function openPublishMenu(page: Page): Promise<void> {
  const publish = page.getByRole("button", { name: "Publish", exact: true }).first();
  try {
    await publish.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Publish menu was not found.");
  }
  let scope = publish.locator("xpath=..");
  for (let depth = 0; depth < 4; depth++) {
    const buttons = scope.locator("xpath=./button | ./*[@role='button']");
    const count = await buttons.count();
    const others: Locator[] = [];
    let sawPublish = false;
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const label = buttonLabel(await button.getAttribute("aria-label"), (await button.innerText()) || "");
      if (label === "Publish") {
        sawPublish = true;
        continue;
      }
      others.push(button);
    }
    if (sawPublish && others.length === 1) {
      const arrow = others[0];
      if (arrow) {
        await arrow.click();
        return;
      }
    }
    if (sawPublish && others.length > 1) {
      for (const button of others) {
        const popup = await button.getAttribute("aria-haspopup");
        if (popup === "menu" || popup === "true" || popup === "listbox") {
          await button.click();
          return;
        }
      }
    }
    scope = scope.locator("xpath=..");
  }
  fail("Publish menu was not found.");
}

async function goToPublishedVersion(page: Page): Promise<void> {
  await openPublishMenu(page);
  const item = page.getByRole("menuitem", { name: "Go to published version", exact: true });
  const option = page.getByRole("option", { name: "Go to published version", exact: true });
  const target = (await item.count()) > 0 ? item.first() : option.first();
  try {
    await target.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Go to published version was not found.");
  }
  await target.click();
  try {
    await page.waitForURL((url) => !url.pathname.replace(/\/$/, "").endsWith("/edit"), { timeout: 30000 });
    await page.locator('[data-testid="workbook-canvas"]').waitFor({ state: "visible", timeout: 30000 });
  } catch {
    fail("Published version did not open.");
  }
}

async function showNamedPage(page: Page, name: string): Promise<void> {
  const tabs = await pageTabs(page);
  const match = tabs.find((tab) => tab.name === name);
  if (!match || match.selected) return;
  await page.locator(`[data-testid="page-item-${match.id}"]`).click();
  await page.locator(`[data-layout-id="layout-body-${match.id}"]`).waitFor({ state: "visible", timeout: 15000 });
}

async function clickEditData(page: Page, host: Locator): Promise<void> {
  await host.click();
  const local = host.getByRole("button", { name: "Edit data", exact: true });
  const button = (await local.count()) > 0 ? local.first() : page.getByRole("button", { name: "Edit data", exact: true }).first();
  if ((await button.count()) < 1) fail("Edit data was not found.");
  if (await button.isDisabled()) fail("Edit data is not available.");
  await button.click();
}

async function clickSave(page: Page, host: Locator): Promise<void> {
  const local = host.getByRole("button", { name: "Save", exact: true });
  const button = (await local.count()) > 0 ? local.first() : page.getByRole("button", { name: "Save", exact: true }).first();
  try {
    await button.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    fail("Save was not found.");
  }
  if (await button.isDisabled()) fail("Save is not available.");
  await button.click();
}

async function editPublishedTable(page: Page, title: string, edit: (host: Locator) => Promise<void>): Promise<void> {
  const found = await locateTitle(page, title);
  const selected = (await pageTabs(page)).find((tab) => tab.selected)?.name;
  await goToPublishedVersion(page);
  if (selected) await showNamedPage(page, selected);
  const host = page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first();
  try {
    await host.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    fail(`Input table ${JSON.stringify(title)} is not on the published page.`);
  }
  await clickEditData(page, host);
  await edit(host);
  await clickSave(page, host);
}

async function firstDataRow(host: Locator): Promise<Locator | undefined> {
  const grid = host.locator(gridSelector).first();
  if ((await grid.count()) < 1) return undefined;
  const rows = grid.getByRole("row");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if ((await row.getByRole("columnheader").count()) > 0) continue;
    const cells = row.getByRole("gridcell").or(row.getByRole("cell"));
    if ((await cells.count()) > 0) return row;
  }
  return undefined;
}

async function chooseMenu(page: Page, item: string): Promise<void> {
  const menuItem = page.getByRole("menuitem", { name: item, exact: true });
  try {
    await menuItem.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Menu item ${JSON.stringify(item)} was not found.`);
  }
  await menuItem.first().click();
}

async function insertOnePublishedRow(page: Page, host: Locator): Promise<void> {
  const row = await firstDataRow(host);
  if (row) {
    await row.click();
    await row.click({ button: "right" });
    const below = page.getByRole("menuitem", { name: "Insert 1 row below", exact: true });
    if ((await below.count()) > 0) {
      await below.first().click();
      return;
    }
    await page.keyboard.press("Escape");
  }
  const add = host.locator("[aria-label='Add row']");
  const addButton = host.getByRole("button", { name: "Add row", exact: true });
  if ((await addButton.count()) > 0) {
    await addButton.first().click();
    return;
  }
  if ((await add.count()) > 0) {
    await add.first().click();
    return;
  }
  fail("Menu item \"Insert 1 row below\" was not found.");
}

async function pastePublishedRows(page: Page, host: Locator, rows: string[][]): Promise<void> {
  if (rows.length === 0) fail("insert-rows has no rows to paste.");
  if (rows.length > 2000 || rows.some((row) => row.length > 25)) {
    fail("Paste accepts at most 2,000 rows and 25 columns.");
  }
  const grid = host.locator(gridSelector).first();
  const cell = grid.getByRole("gridcell").or(grid.getByRole("cell")).first();
  if ((await cell.count()) < 1) fail("Input table has no cell to paste into.");
  await cell.click();
  const tsv = rows.map((row) => row.join("\t")).join("\n");
  try {
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, tsv);
  } catch {
    fail("Could not copy rows to the clipboard for Paste.");
  }
  await cell.click({ button: "right" });
  const paste = page.getByRole("menuitem", { name: "Paste", exact: true });
  if ((await paste.count()) > 0) {
    await paste.first().click();
    return;
  }
  await page.keyboard.press("Meta+V");
}

async function typePublishedCell(page: Page, host: Locator, column: string, value: string): Promise<void> {
  const grid = host.locator(gridSelector).first();
  const headers = grid.getByRole("columnheader");
  const count = await headers.count();
  let index = -1;
  for (let i = 0; i < count; i++) {
    const line = ((await headers.nth(i).innerText()) || "").trim().split("\n")[0]?.trim();
    if (line === column) {
      index = i;
      break;
    }
  }
  if (index < 0) fail(`Column ${JSON.stringify(column)} was not found.`);
  const row = await firstDataRow(host);
  if (!row) fail(`Column ${JSON.stringify(column)} has no cell.`);
  const cells = row.getByRole("gridcell").or(row.getByRole("cell"));
  if ((await cells.count()) <= index) fail(`Column ${JSON.stringify(column)} has no cell.`);
  const cell = cells.nth(index);
  await cell.click();
  const field = page.locator("input:focus, textarea:focus, [contenteditable='true']:focus").first();
  if ((await field.count()) > 0) await field.fill(value);
  else if (value) await page.keyboard.insertText(value);
  else await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
}

async function deleteOnePublishedRow(page: Page, host: Locator): Promise<void> {
  const row = await firstDataRow(host);
  if (!row) fail("Input table has no row to delete.");
  await row.click();
  await row.click({ button: "right" });
  await chooseMenu(page, "Delete 1 row");
}

async function insertRowDialog(page: Page, heading: Locator): Promise<Locator> {
  const byHeading = page.getByRole("dialog").filter({ has: heading });
  if ((await byHeading.count()) >= 1) return byHeading.last();
  const byText = page.getByRole("dialog").filter({ hasText: /insert row into/i });
  if ((await byText.count()) >= 1) return byText.last();
  fail("Insert row dialog was not found.");
}

function intoShowsTable(shown: string): boolean {
  const value = shown.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/^into$/i.test(value)) return false;
  if (/^open options into$/i.test(value)) return false;
  if (/^insert row into$/i.test(value)) return false;
  if (/^select\b/i.test(value)) return false;
  return true;
}

async function intoFieldText(dialog: Locator): Promise<string> {
  const open = dialog.getByRole("button", { name: /open options into/i });
  if ((await open.count()) > 0) {
    const text = ((await open.first().innerText()) || "").trim();
    if (text) return text;
  }
  const combo = dialog.getByRole("combobox", { name: /into/i });
  if ((await combo.count()) > 0) return ((await combo.first().innerText()) || "").trim();
  const named = dialog.getByRole("button", { name: /^into\b/i });
  if ((await named.count()) > 0) return ((await named.first().innerText()) || "").trim();
  return "";
}

async function openIntoList(dialog: Locator): Promise<void> {
  const open = dialog.getByRole("button", { name: /open options into/i });
  if ((await open.count()) > 0) {
    await open.first().click();
    return;
  }
  const combo = dialog.getByRole("combobox", { name: /^into$/i });
  if ((await combo.count()) > 0) {
    await combo.first().click();
    return;
  }
  const named = dialog.getByRole("button", { name: /^into$/i });
  if ((await named.count()) > 0) {
    await named.first().click();
    return;
  }
  fail("Insert row has no Into field.");
}

async function sheetLabel(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const host =
      document.querySelector(`[data-selectable="${elementId}"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"]`);
    if (!(host instanceof HTMLElement)) return "";
    const nodes: Element[] = [host, ...host.querySelectorAll("[data-testid]")];
    for (const node of nodes) {
      const match = /^sheet-(.+)$/.exec(node.getAttribute("data-testid") || "");
      if (match?.[1]) return match[1];
    }
    return "";
  }, id);
}

function sameTableLabel(shown: string, table: string, sheet: string): boolean {
  const value = shown.replace(/\s+/g, " ").trim();
  if (!intoShowsTable(value)) return false;
  const first = value.split("\n")[0]?.trim() ?? value;
  if (first === table || value === table) return true;
  if (!sheet) return false;
  return first === sheet || value === sheet || first.startsWith(`${sheet} (`);
}

async function selectIntoTable(page: Page, dialog: Locator, table: string, elementId: string): Promise<void> {
  const sheet = await sheetLabel(page, elementId);
  if (sameTableLabel(await intoFieldText(dialog), table, sheet)) return;
  await openIntoList(dialog);
  const list = page.getByRole("listbox");
  const options = (await list.count()) > 0 ? list.last().getByRole("option") : page.getByRole("option");
  try {
    await options.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Insert row Into options did not open.");
  }
  const count = await options.count();
  let titleMatch = -1;
  let idMatch = -1;
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const name = ((await option.innerText()) || "").replace(/\s+/g, " ").trim();
    names.push(name);
    const firstLine = name.split(" ").length ? ((await option.innerText()) || "").trim().split("\n")[0]?.trim() : name;
    if (sameTableLabel(name, table, sheet) || sameTableLabel(firstLine ?? "", table, sheet)) titleMatch = i;
    if (elementId) {
      const blob = await option.evaluate((node) => {
        const el = node as HTMLElement;
        return [el.id, el.getAttribute("data-id") || "", el.getAttribute("data-value") || "", el.getAttribute("aria-label") || "", el.innerText || ""].join(" ");
      });
      if (blob.includes(elementId)) idMatch = i;
    }
  }
  const index = titleMatch >= 0 ? titleMatch : idMatch;
  if (index < 0) {
    fail(`Insert row Into options did not include ${JSON.stringify(table)}. Options: ${names.join(" | ") || "(none)"}`);
  }
  await options.nth(index).click();
  const shown = await intoFieldText(dialog);
  // The Into control may show the sheet name. The heading "insert row into" is not that value.
  if (!intoShowsTable(shown) && titleMatch < 0) {
    fail(`Insert row did not target a table. Into shows ${JSON.stringify(shown)}.`);
  }
}

async function chipShows(scope: Locator, label: string): Promise<boolean> {
  if (!label) return false;
  if ((await scope.getByText(label, { exact: true }).count()) > 0) return true;
  return (await scope.getByRole("button", { name: label, exact: true }).count()) > 0;
}

function columnRow(dialog: Locator, column: string): Locator {
  return dialog.getByText(column, { exact: true }).first().locator("xpath=ancestor::*[.//button][1]");
}

async function chooseRowOption(page: Page, row: Locator, names: string[]): Promise<boolean> {
  const openers = row.getByRole("button", { name: /open options|static values|^control$|^formula$/i });
  const count = await openers.count();
  for (let i = 0; i < count; i++) {
    const opener = openers.nth(i);
    const label = buttonLabel(await opener.getAttribute("aria-label"), (await opener.innerText()) || "");
    if (/open options (action|into)/i.test(label)) continue;
    await opener.click();
    const options = page.getByRole("option");
    try {
      await options.first().waitFor({ state: "visible", timeout: 3000 });
    } catch {
      continue;
    }
    for (const name of names) {
      const match = page.getByRole("option", { name, exact: true });
      if ((await match.count()) > 0) {
        await match.first().click();
        return true;
      }
    }
    await page.keyboard.press("Escape");
  }
  return false;
}
