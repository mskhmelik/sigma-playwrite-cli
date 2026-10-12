import type { Page } from "playwright";
import type { Editor } from "./editor.js";
import { fail } from "./errors.js";
import { locateTitle } from "./edit.js";
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
      if (!tabs.some((tab) => tab.name === name)) throw new Error(`missing page ${JSON.stringify(name)}`);
      fail(`Page ${JSON.stringify(name)} cannot be opened as a modal from this command.`);
    },
    async insertRow() {
      fail("row write refused");
    },
    async insertRows() {
      fail("row write refused");
    },
    async editCell() {
      fail("row write refused");
    },
    async deleteRow() {
      fail("row write refused");
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

async function insertActionText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll("h3")].find((el) => /insert row into/i.test(el.textContent || ""));
    let node: HTMLElement | null = heading instanceof HTMLElement ? heading.parentElement : null;
    while (node && !(node.innerText || "").includes("Set column values")) node = node.parentElement;
    return node?.innerText ?? "";
  });
}

async function saveButtonInsert(
  page: Page,
  button: string,
  table: string,
  column: string,
  controlTitle: string,
): Promise<void> {
  void table;
  const found = await locateTitle(page, button);
  await page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first().click();
  await page.getByRole("tab", { name: "Actions" }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("button", { name: "Open options Action" }).click();
  await page.getByRole("option", { name: "Insert row", exact: true }).click();
  const heading = page.getByRole("heading", { name: /insert row into/i });
  await heading.waitFor({ state: "visible", timeout: 5000 });
  const text = await insertActionText(page);
  if (!text.includes(column)) fail(`Insert row did not target column ${JSON.stringify(column)}.`);
  const handle = controlTitle.replace(/^v\./, "");
  if (!text.includes(controlTitle) && !new RegExp(`\\b${handle}\\b`, "i").test(text)) {
    fail(`Insert row did not take its value from ${JSON.stringify(controlTitle)}.`);
  }
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
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
