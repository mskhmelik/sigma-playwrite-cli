import type { Locator, Page } from "playwright";
import type { DrawerSettings, Editor } from "./editor.js";
import { Exit, fail } from "./errors.js";
import { locateTitle } from "./edit.js";
import { controlTitle, type HandleKind } from "./handles.js";
import { createContainerButton, inspectorHeader, selectionClick } from "./container.js";
import { confirmSelected, elementHosts, placeArea, readModel } from "./place.js";
import { columnTitle } from "./system-columns.js";

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
          .filter((title) => title.startsWith("c.") || title.startsWith("v."));
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
    async addModal(name) {
      await createModal(page, name);
    },
    async addDrawer(name, settings) {
      await createDrawer(page, name, settings);
    },
    async addInputTable(title, column) {
      await createInputTable(page, title, column);
    },
    async addTextControl(title, area) {
      let id: string;
      try {
        id = (await locateTitle(page, title)).id;
      } catch (error) {
        if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
        id = await createTextControl(page, title);
      }
      if (area) await placeArea(page, id, area, () => {}, title);
    },
    async addSegmentedControl(title, options) {
      await createSegmentedControl(page, title, options);
    },
    async addDateControl(title) {
      await createDateControl(page, title);
    },
    async addListControl(title, source, column, multiple, nullOption, clear, search) {
      await createListControl(page, title, source, column, multiple, nullOption, clear, search);
    },
    async addButton(title) {
      await createButton(page, title);
    },
    async setInsertAction(button, table, column, controlTitle) {
      await saveButtonInsert(page, button, table, column, controlTitle);
    },
    async setCloseModal(button) {
      await saveButtonClose(page, button);
    },
    async setIfElse(button, table, column, controlTitle, modal, formula) {
      await saveButtonIfElse(page, button, table, column, controlTitle, modal, formula);
    },
    async listColumns(title) {
      const found = await locateTitle(page, title);
      return headerLabels(page, found.id);
    },
    async addSystemColumn(title, column) {
      await showSystemColumn(page, title, column);
    },
    async groupingKeys(title) {
      await openColumnPanel(page, title);
      return readGroupingLevels(page);
    },
    async groupWith(title, column, withColumn) {
      await dragOntoGrouping(page, title, column, withColumn);
    },
    async addSelectColumn(title, column, options) {
      await showSelectColumn(page, title, column, options);
    },
    async addCalculation(title, column, formula) {
      await showCalculation(page, title, column, formula);
    },
    async addTypedColumn(title, name, type) {
      await showTypedColumn(page, title, name, type);
    },
    async setOnSelectControl(table, clickColumn, control, sourceColumn) {
      await saveColumnSelect(page, table, clickColumn, control, sourceColumn);
    },
    async setUpdateRow(button, table, column, valueControl, rowIdControl) {
      await saveButtonUpdate(page, button, table, column, valueControl, rowIdControl);
    },
    async publish() {
      await publishWorkbook(page);
    },
    async styleModalPage(header) {
      await formatErrorModal(page, header);
    },
    async ensureModalSentence(sentence) {
      return ensureSentence(page, sentence);
    },
    async ensureModalButton(label) {
      return ensureButton(page, label);
    },
    async stackModalBody(sentenceId, sentenceArea, buttonId, buttonArea) {
      await placeArea(page, sentenceId, sentenceArea, () => {}, "sentence");
      await placeArea(page, buttonId, buttonArea, () => {}, "button");
    },
    async hasContainer(title) {
      return containerHeaderIs(page, title);
    },
    async addContainer(titles, title, border, radius) {
      await createContainer(page, titles, title, border, radius);
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

async function clickAddModal(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Add modal", exact: true });
  if ((await button.count()) > 0) {
    await button.first().click();
    return;
  }
  const visible = page.getByRole("menuitem", { name: "Add modal", exact: true });
  if ((await visible.count()) > 0) {
    await visible.first().click();
    return;
  }
  await page.locator('[data-testid="add-page-button"]').locator("xpath=..").getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Add modal", exact: true }).click();
}

async function createModal(page: Page, name: string): Promise<void> {
  const before = new Set((await pageTabs(page)).map((tab) => tab.id));
  await clickAddModal(page);
  await page.waitForTimeout(600);
  const created = (await pageTabs(page)).filter((tab) => !before.has(tab.id));
  if (created.length !== 1) fail(`Expected one new modal, found ${created.length}.`);
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
        const named = [...document.querySelectorAll('[data-testid^="page-item-"]')].some(
          (el) => (el.textContent || "").trim() === pageName,
        );
        const heading = [...document.querySelectorAll("h1, h2, h3")].some(
          (el) => (el.textContent || "").trim() === pageName,
        );
        return named && heading;
      },
      name,
      { timeout: 5000 },
    );
  } catch {
    fail(`Modal ${JSON.stringify(name)} was not created.`);
  }
}

async function clickBottomButton(page: Page, name: string): Promise<void> {
  const buttons = page.getByRole("button", { name, exact: true });
  const count = await buttons.count();
  if (count < 1) fail(`Button ${JSON.stringify(name)} was not found.`);
  const index = await buttons.evaluateAll((nodes) => {
    let best = -1;
    let bestBottom = -1;
    nodes.forEach((node, i) => {
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      if (box.bottom >= bestBottom) {
        bestBottom = box.bottom;
        best = i;
      }
    });
    return best;
  });
  if (index < 0) fail(`Button ${JSON.stringify(name)} was not found.`);
  await buttons.nth(index).click();
}

async function createDrawer(page: Page, name: string, settings: DrawerSettings): Promise<void> {
  const before = new Set((await pageTabs(page)).map((tab) => tab.id));
  await clickBottomButton(page, "Layout");
  const item = page.getByRole("menuitem", { name: "Drawer", exact: true });
  try {
    await item.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Drawer menu item was not found.");
  }
  if ((await item.count()) !== 1) fail("Drawer menu item was not found.");
  await item.click();
  await page.waitForTimeout(600);
  const created = (await pageTabs(page)).filter((tab) => !before.has(tab.id));
  if (created.length !== 1) fail(`Expected one new drawer, found ${created.length}.`);
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
    fail(`Drawer ${JSON.stringify(name)} was not created.`);
  }
  if (!drawerSettingsPassed(settings)) return;
  await page.locator(`[data-testid="page-item-${id}"]`).click();
  await page.locator(`[data-layout-id="layout-body-${id}"]`).waitFor({ state: "visible", timeout: 15000 });
  await applyDrawerSettings(page, settings);
}

function drawerSettingsPassed(settings: DrawerSettings): boolean {
  return (
    settings.width !== undefined ||
    settings.spacing !== undefined ||
    settings.padding !== undefined ||
    settings.elementGap !== undefined ||
    settings.pageOverlay !== undefined ||
    settings.background !== undefined ||
    settings.header !== undefined ||
    settings.closeIcon !== undefined
  );
}

async function formatPanel(page: Page): Promise<Locator> {
  const named = page.getByRole("tabpanel", { name: /^format$/i });
  if ((await named.count()) >= 1) return named.first();
  const panel = page.getByRole("tabpanel");
  if ((await panel.count()) < 1) fail("Format tab was not found.");
  return panel.first();
}

async function expandCollapsedSection(panel: Locator, name: string): Promise<void> {
  const index = await panel.evaluate((root, sectionName) => {
    const buttons = [...root.querySelectorAll("button")];
    const labelOf = (button: Element) =>
      ((button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim());
    const named = buttons.findIndex((button) => labelOf(button) === sectionName);
    const labels = [...root.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return own === sectionName;
    });
    for (const label of labels) {
      const scope = label.parentElement;
      const chevron = scope?.querySelector("button[data-collapsed]");
      if (chevron instanceof HTMLButtonElement) {
        const at = buttons.indexOf(chevron);
        if (at >= 0) return at;
      }
    }
    return named;
  }, name);
  if (index < 0) return;
  const button = panel.locator("button").nth(index);
  const collapsed = await button.getAttribute("data-collapsed");
  const expanded = await button.getAttribute("aria-expanded");
  if (collapsed === "true" || expanded === "false") await button.click();
}

function sizeWord(value: string): string {
  if (value === "small") return "Small";
  if (value === "medium") return "Medium";
  return "Large";
}

async function chooseWord(page: Page, panel: Locator, name: RegExp, value: string, label: string): Promise<void> {
  const word = sizeWord(value);
  const button = panel.getByRole("button", { name });
  const combo = panel.getByRole("combobox", { name });
  const control = (await button.count()) === 1 ? button : (await combo.count()) === 1 ? combo : null;
  if (!control) fail(`${label} control was not found.`);
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    const current = await control.inputValue();
    if (current === value || current === word) return;
    await control.selectOption(word);
    return;
  }
  try {
    await control.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`${label} control was not found.`);
  }
  const current = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
  if (new RegExp(`\\b${word}\\b`).test(current)) return;
  await control.click();
  const option = page.getByRole("option", { name: word, exact: true });
  const appeared = await option
    .first()
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await option.first().click();
  else if (!(await selectNearby(control, word))) fail(`Option ${word} was not found.`);
  try {
    await control.filter({ hasText: new RegExp(`\\b${word}\\b`) }).waitFor({ state: "visible", timeout: 3000 });
  } catch {
    const after = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
    fail(`${label} is ${JSON.stringify(after)}, wanted ${word}.`);
  }
}

async function selectNearby(button: Locator, word: string): Promise<boolean> {
  const handle = await button.evaluateHandle((node, wanted) => {
    if (!(node instanceof HTMLElement)) return null;
    let current: HTMLElement | null = node;
    for (let depth = 0; depth < 8 && current; depth++) {
      const selects = [...current.querySelectorAll("select")].filter((select) =>
        [...select.options].some((option) => option.text.trim() === wanted),
      );
      if (selects.length === 1) return selects[0];
      current = current.parentElement;
    }
    return null;
  }, word);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return false;
  }
  const index = await element.evaluate((select, wanted) => {
    if (!(select instanceof HTMLSelectElement)) return -1;
    return [...select.options].findIndex((option) => option.text.trim() === wanted);
  }, word);
  if (index < 0) {
    await element.dispose();
    return false;
  }
  await element.selectOption({ index });
  await element.dispose();
  return true;
}

async function setChecked(panel: Locator, name: RegExp, wantOn: boolean, label: string): Promise<void> {
  const box = panel.getByRole("checkbox", { name });
  const sw = panel.getByRole("switch", { name });
  const control = (await box.count()) === 1 ? box : (await sw.count()) === 1 ? sw : null;
  if (!control) fail(`${label} checkbox was not found.`);
  const checked = async () =>
    (await control.isChecked()) || (await control.getAttribute("aria-checked")) === "true";
  if ((await checked()) === wantOn) return;
  await control.click();
  if ((await checked()) !== wantOn) fail(`${label} did not turn ${wantOn ? "on" : "off"}.`);
}

function normalizeHex(value: string): string {
  const raw = value.trim().toLowerCase();
  const long = raw.match(/^#([0-9a-f]{6})$/);
  if (long?.[1]) return `#${long[1]}`;
  const short = raw.match(/^#([0-9a-f]{3})$/);
  if (short?.[1]) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!rgb?.[1] || !rgb[2] || !rgb[3]) return "";
  const parts = [rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0"));
  return `#${parts.join("")}`;
}

async function paintOf(button: Locator): Promise<string> {
  const raw = await button.evaluate((node) => {
    if (!(node instanceof HTMLElement)) return "";
    return node.style.getPropertyValue("--selected-color");
  });
  return normalizeHex(raw);
}

async function fillHexField(page: Page, color: string): Promise<boolean> {
  const inputs = page.locator("input, textarea");
  const match = await inputs.evaluateAll((nodes) => {
    const hits: { index: number; value: string }[] = [];
    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("placeholder") || ""}`.toLowerCase();
      const value = node.value.trim();
      const hexValue = /^#?[0-9a-fA-F]{3,8}$/.test(value);
      const hexLabel = /\bhex\b/.test(label) || label.includes("#");
      if (!hexValue && !hexLabel) return;
      hits.push({ index, value });
    });
    return hits;
  });
  if (match.length !== 1) return false;
  const hit = match[0];
  if (!hit) return false;
  const next = hit.value.startsWith("#") || hit.value === "" ? color : color.slice(1);
  const field = inputs.nth(hit.index);
  await field.fill(next);
  await field.press("Enter");
  return true;
}

async function setBackground(page: Page, panel: Locator, color: string): Promise<void> {
  const button = panel.getByRole("button", { name: "Background color", exact: true });
  try {
    await button.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Background color ${color} was not found.`);
  }
  if ((await button.count()) !== 1) fail(`Background color ${color} was not found.`);
  if ((await paintOf(button)) === color.toLowerCase()) return;
  await button.click();
  if (!(await fillHexField(page, color))) fail(`Background color ${color} has no hex field.`);
  const wanted = color.toLowerCase();
  let seen = "";
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    seen = await paintOf(button);
    if (seen === wanted) return;
    await page.waitForTimeout(100);
  }
  fail(`Background color ${color} is ${JSON.stringify(seen)}.`);
}

async function applyDrawerSettings(page: Page, settings: DrawerSettings): Promise<void> {
  const tab = page.getByRole("tab", { name: /^format$/i });
  if ((await tab.count()) < 1) fail("Format tab was not found.");
  await tab.first().click();
  const panel = await formatPanel(page);
  const style =
    settings.width !== undefined ||
    settings.spacing !== undefined ||
    settings.padding !== undefined ||
    settings.elementGap !== undefined ||
    settings.pageOverlay !== undefined ||
    settings.background !== undefined;
  if (style) await expandCollapsedSection(panel, "Drawer style");
  if (settings.header !== undefined || settings.closeIcon !== undefined) await expandCollapsedSection(panel, "Header");
  if (settings.width) await chooseWord(page, panel, /Width$/, settings.width, "Width");
  if (settings.spacing) await chooseWord(page, panel, /Spacing$/, settings.spacing, "Spacing");
  if (settings.padding) await setChecked(panel, /Padding/, settings.padding === "on", "Padding");
  if (settings.elementGap) await setChecked(panel, /Element gap/, settings.elementGap === "on", "Element gap");
  if (settings.pageOverlay) await setChecked(panel, /Page overlay/, settings.pageOverlay === "on", "Page overlay");
  if (settings.header) await setChecked(panel, /Show title/, settings.header === "on", "Show title");
  if (settings.closeIcon) await setChecked(panel, /Show close icon/, settings.closeIcon === "on", "Show close icon");
  if (settings.background) await setBackground(page, panel, settings.background);
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

async function setControlId(page: Page, elementId: string, title: string): Promise<void> {
  await page.locator(`[data-selectable="${elementId}"], [data-testid="element-${elementId}"]`).first().click();
  const settings = page.getByRole("tab", { name: "Settings", exact: true });
  if ((await settings.count()) > 0) await settings.first().click();
  const named = page.getByRole("textbox", { name: /control id/i });
  const placeholder = page.locator('input[placeholder="control-id"], input[placeholder="Control ID"]');
  const field = (await named.count()) > 0 ? named.first() : placeholder.first();
  try {
    await field.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Control ${elementId} has no control id field.`);
  }
  await field.fill(title);
  await field.press("Enter");
  try {
    await page.waitForFunction(
      (wanted) => {
        const inputs = [...document.querySelectorAll("input")];
        return inputs.some((node) => {
          const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("placeholder") || ""}`;
          return /control id/i.test(label) && node.value === wanted;
        });
      },
      title,
      { timeout: 5000 },
    );
  } catch {
    fail(`Control id is not ${JSON.stringify(title)}.`);
  }
}

async function readCanvasTitle(page: Page, id: string): Promise<string> {
  const node = page.locator(`[data-selectable="${id}"] [data-testid="dynamic-title"]`).first();
  return ((await node.innerText().catch(() => "")) || "").trim();
}

async function createTextControl(page: Page, title: string): Promise<string> {
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Controls");
  await page.waitForTimeout(300);
  await clickMatchingButton(page, /^text input$/i);
  const id = await createdId(page, before);
  // The control-id field sentence-cases the canvas title when it is saved.
  // Write the id first, then the title, so v.id_name_selected is what later commands find.
  await setControlId(page, id, title);
  await renameTitle(page, id, title);
  await page.waitForTimeout(600);
  if ((await readCanvasTitle(page, id)) !== title) await renameTitle(page, id, title);
  return id;
}

async function containerHeaderIs(page: Page, title: string): Promise<boolean> {
  const ids = await page.evaluate(() => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    const pageId = (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
    const root = pageId ? document.querySelector(`[data-layout-id="layout-body-${pageId}"]`) : document.body;
    if (!root) return [] as string[];
    return [...root.querySelectorAll("[data-element-container][data-selectable]")]
      .filter((el) => [...el.querySelectorAll("[data-element-container][data-selectable]")].some((node) => node !== el))
      .map((el) => el.getAttribute("data-selectable") || "")
      .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);
  });
  for (const id of ids) {
    const host = page.locator(elementHosts(id).join(", ")).first();
    await host.scrollIntoViewIfNeeded().catch(() => undefined);
    await host.click({ force: true });
    const header = page.locator(`[data-testid="${inspectorHeader}"]`);
    const raw = (await header.innerText().catch(() => "")) || "";
    const line = raw.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
    if (line === title) return true;
  }
  return false;
}

async function createContainer(page: Page, titles: string[], title: string, border: string, radius: string): Promise<void> {
  for (const [index, elementTitle] of titles.entries()) {
    const found = await locateTitle(page, elementTitle);
    const gesture = selectionClick(index);
    const host = page.locator(elementHosts(found.id).join(", ")).first();
    await host.scrollIntoViewIfNeeded();
    await host.click({ modifiers: gesture.modifiers, force: gesture.force });
    try {
      await page.locator(`[data-testid="selection-border--${found.id}"]`).waitFor({ state: "attached", timeout: 5000 });
    } catch {
      fail(`${elementTitle} was not selected.`);
    }
  }
  const before = new Set(await selectableIds(page));
  const button = page.locator(`[data-testid="${createContainerButton}"]`);
  try {
    await button.click({ timeout: 5000 });
  } catch {
    fail("Create container was not found.");
  }
  const id = await createdId(page, before);
  const header = page.locator(`[data-testid="${inspectorHeader}"]`);
  await header.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(title);
  await page.keyboard.press("Enter");
  try {
    await header.filter({ hasText: title }).waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Container title is not ${JSON.stringify(title)}.`);
  }
  await paintContainer(page, id, border, radius);
}

async function paintContainer(page: Page, id: string, border: string, radius: string): Promise<void> {
  const format = page.getByRole("tab", { name: /^format$/i });
  if ((await format.count()) >= 1) await format.first().click();
  const style = page.getByRole("button", { name: /^style\b/i });
  if ((await style.count()) > 0 && (await style.first().getAttribute("aria-expanded")) !== "true") {
    await style.first().click();
  }
  const width = border.match(/^(\d+)px/)?.[1] ?? "";
  if (!width) fail(`Container border is not a pixel width: ${border}`);
  const borderField = page.getByRole("spinbutton", { name: /border/i });
  const borderText = page.getByRole("textbox", { name: /border/i });
  if ((await borderField.count()) + (await borderText.count()) < 1) fail("Border width was not found.");
  const field = (await borderField.count()) > 0 ? borderField.first() : borderText.first();
  await field.fill(width);
  await field.press("Enter");
  const pill = page.locator('[aria-label="Pill"]');
  if ((await pill.count()) < 1) fail("Pill corner was not found.");
  await pill.first().click();
  const painted = await page.evaluate(({ elementId, wantedRadius }) => {
    const host =
      document.querySelector(`[data-testid="element_${elementId}"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"]`) ??
      document.querySelector(`[data-selectable="${elementId}"]`);
    if (!(host instanceof HTMLElement)) return false;
    const style = getComputedStyle(host);
    return style.borderTopWidth === "1px" && style.borderTopStyle === "solid" && style.borderRadius === wantedRadius;
  }, { elementId: id, wantedRadius: radius });
  if (!painted) fail("Container style did not land. Expected a 1px solid border and 8px corners.");
}

async function createButton(page: Page, title: string): Promise<void> {
  try {
    await locateTitle(page, title);
    return;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
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
  const handle = controlTitle.replace(/^[cv]\./, "");
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

function headingPattern(effect: string): RegExp {
  if (effect === "Close modal/drawer") return /close modal/i;
  if (effect === "If/else") return /if\s*\/\s*else/i;
  return new RegExp(effect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function openEffect(page: Page, button: string, effect: string): Promise<{ heading: Locator; dialog: Locator }> {
  const found = await locateTitle(page, button);
  await page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first().click();
  await page.getByRole("tab", { name: "Actions" }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("button", { name: "Open options Action" }).click();
  await page.getByRole("option", { name: effect, exact: true }).click();
  const heading = page.getByRole("heading", { name: headingPattern(effect) });
  await heading.waitFor({ state: "visible", timeout: 5000 });
  const dialog = await insertRowDialog(page, heading);
  return { heading, dialog };
}

async function closeActionDialog(page: Page, dialog: Locator, heading: Locator): Promise<void> {
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  if ((await close.count()) > 0) await close.first().click();
  else await page.getByRole("button", { name: "Close", exact: true }).last().click();
  try {
    await heading.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    fail("Action dialog did not close.");
  }
}

async function actionPanelText(page: Page, button: string): Promise<string> {
  const found = await locateTitle(page, button);
  await page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first().click();
  await page.getByRole("tab", { name: "Actions" }).click();
  const panel = page.getByRole("tabpanel");
  if ((await panel.count()) < 1) return "";
  return ((await panel.first().innerText()) || "").replace(/\s+/g, " ");
}

async function saveButtonClose(page: Page, button: string): Promise<void> {
  const listed = await actionPanelText(page, button);
  if (/close modal/i.test(listed)) return;
  const { heading, dialog } = await openEffect(page, button, "Close modal/drawer");
  const text = ((await dialog.innerText()) || "").toLowerCase();
  if (!text.includes("close modal")) fail("Close modal was not saved.");
  await closeActionDialog(page, dialog, heading);
}

async function fillCondition(page: Page, dialog: Locator, formula: string): Promise<void> {
  const field = dialog.locator("textarea, [contenteditable='true']").last();
  try {
    await field.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("If/else has no condition field.");
  }
  await field.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(formula);
  await page.keyboard.press("Enter");
  try {
    await page.waitForFunction(
      (wanted) => {
        const dialogs = [...document.querySelectorAll("[role='dialog']")];
        return dialogs.some((node) => (node.textContent || "").includes(wanted));
      },
      formula,
      { timeout: 5000 },
    );
  } catch {
    fail(`If/else condition is not ${JSON.stringify(formula)}.`);
  }
}

async function chooseBranchEffect(page: Page, dialog: Locator, branch: string, effect: string): Promise<void> {
  const row = dialog.getByText(branch, { exact: true }).first().locator("xpath=ancestor::*[.//button][1]");
  const opened = await chooseRowOption(page, row, [effect]);
  if (!opened) {
    const option = page.getByRole("option", { name: effect, exact: true });
    if ((await option.count()) < 1) fail(`If/else ${branch} did not offer ${JSON.stringify(effect)}.`);
    await option.first().click();
  }
}

async function saveButtonIfElse(
  page: Page,
  button: string,
  table: string,
  column: string,
  control: string,
  modal: string,
  formula: string,
): Promise<void> {
  const listed = await actionPanelText(page, button);
  if (/if\s*\/\s*else/i.test(listed)) return;
  if (/insert row/i.test(listed)) {
    fail("Button already has Insert row. Remove it before if/else, or a failed check still writes the row.");
  }
  const target = await locateTitle(page, table);
  const { heading, dialog } = await openEffect(page, button, "If/else");
  await fillCondition(page, dialog, formula);
  await chooseBranchEffect(page, dialog, "Then", "Open modal/drawer");
  const modalOption = page.getByRole("option", { name: modal, exact: true });
  if ((await modalOption.count()) > 0) await modalOption.first().click();
  else await chooseRowOption(page, dialog, [modal]);
  if (!(await chipShows(dialog, modal)) && !((await dialog.innerText()) || "").includes(modal)) {
    fail(`If/else did not open modal ${JSON.stringify(modal)}.`);
  }
  await chooseBranchEffect(page, dialog, "Else", "Insert row");
  await selectIntoTable(page, dialog, table, target.id);
  if (!(await chipShows(dialog, column))) fail(`If/else did not target column ${JSON.stringify(column)}.`);
  const handle = control.replace(/^[cv]\./, "");
  if (!(await chipShows(dialog, control)) && !(await chipShows(dialog, handle))) {
    const row = columnRow(dialog, column);
    await chooseRowOption(page, row, ["Control"]);
    await chooseRowOption(page, row, [control, handle]);
  }
  if (!(await chipShows(dialog, control)) && !(await chipShows(dialog, handle))) {
    fail(`If/else did not take its value from ${JSON.stringify(control)}.`);
  }
  if (!((await dialog.innerText()) || "").includes(formula)) fail(`If/else condition is not ${JSON.stringify(formula)}.`);
  await closeActionDialog(page, dialog, heading);
}

async function openColumnPanel(page: Page, title: string): Promise<void> {
  const found = await locateTitle(page, title);
  await page.locator(`[data-selectable="${found.id}"]`).first().click({ position: { x: 24, y: 24 } });
  try {
    await page.locator('[data-testid="groupings"]').waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Groupings were not open for ${JSON.stringify(title)}.`);
  }
}

async function readGroupingLevels(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const label = (node: Element) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim();
    const root = document.querySelector('[data-testid="groupings"]')?.parentElement;
    const list = root?.querySelector("ul");
    if (!list) return [];
    return [...list.children]
      .map((row) =>
        [...row.querySelectorAll('[data-testid^="sheet-column-item-"]')].map(label).filter((value) => value.length > 0),
      )
      .filter((keys) => keys.length > 0);
  });
}

async function columnChip(page: Page, name: string, where: "list" | "grouping"): Promise<string> {
  const testId = await page.evaluate(
    ({ name, where }) => {
      const label = (node: Element) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim();
      const root = document.querySelector('[data-testid="groupings"]')?.parentElement;
      const match = [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].find((node) => {
        const inGroup = root ? root.contains(node) : false;
        return label(node) === name && (where === "grouping" ? inGroup : !inGroup);
      });
      return match?.getAttribute("data-testid") ?? null;
    },
    { name, where },
  );
  if (!testId) {
    fail(
      where === "list"
        ? `Column ${JSON.stringify(name)} is not in the column list.`
        : `Column ${JSON.stringify(name)} is not in the grouping.`,
    );
  }
  return testId;
}

async function dragOntoGrouping(page: Page, title: string, column: string, withColumn: string): Promise<void> {
  await openColumnPanel(page, title);
  const sourceId = await columnChip(page, column, "list");
  const targetId = await columnChip(page, withColumn, "grouping");
  const source = page.locator(`[data-testid="${sourceId}"]`).first();
  const target = page.locator(`[data-testid="${targetId}"]`).first();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) fail(`Could not see ${JSON.stringify(column)} and ${JSON.stringify(withColumn)}.`);
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
  try {
    await page.waitForFunction(
      (name) => {
        const label = (node: Element) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim();
        const root = document.querySelector('[data-testid="groupings"]')?.parentElement;
        const list = root?.querySelector("ul");
        if (!list) return false;
        return [...list.querySelectorAll('[data-testid^="sheet-column-item-"]')].some((node) => label(node) === name);
      },
      column,
      { timeout: 5000 },
    );
  } catch {
    fail(
      `${JSON.stringify(column)} did not join the grouping that holds ${JSON.stringify(withColumn)}. Group column starts a second grouping and was not used.`,
    );
  }
}

async function headerLabels(page: Page, id: string): Promise<string[]> {
  const host = page.locator(`[data-selectable="${id}"]`).first();
  await host.click({ position: { x: 24, y: 24 } });
  try {
    await page.locator('[data-testid^="sheet-column-item-"]').first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    return [];
  }
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')]
      .map((node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0),
  );
}

async function clickAddColumn(page: Page, id: string): Promise<void> {
  const byTest = page.locator('[data-testid="add-column"]');
  if ((await byTest.count()) > 0) {
    await byTest.first().click();
    return;
  }
  const named = page.getByRole("button", { name: /add (new )?column/i });
  if ((await named.count()) > 0) {
    await named.first().click();
    return;
  }
  const opened = await page.evaluate((elementId) => {
    const host =
      document.querySelector(`[data-selectable="${elementId}"]`) ??
      document.querySelector(`[data-testid="element_${elementId}"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"]`);
    if (!(host instanceof HTMLElement)) return null;
    const headers = [...host.querySelectorAll('[role="columnheader"]')];
    const last = headers[headers.length - 1];
    if (!(last instanceof HTMLElement)) return null;
    const rect = last.getBoundingClientRect();
    return { x: Math.round(rect.right + 18), y: Math.round(rect.top + rect.height / 2) };
  }, id);
  if (!opened) fail("Add column was not found.");
  await page.mouse.click(opened.x, opened.y);
}

async function pickMenuLabel(page: Page, label: string): Promise<void> {
  const item = page
    .getByRole("menuitem", { name: label, exact: true })
    .or(page.getByRole("option", { name: label, exact: true }));
  const visible = async () => (await item.count()) > 0;
  if (!(await visible())) {
    const history = page
      .getByRole("menuitem", { name: /row edit history/i })
      .or(page.getByRole("option", { name: /row edit history/i }));
    if ((await history.count()) > 0) {
      await history.first().hover();
      await page.waitForTimeout(200);
    }
  }
  if (!(await visible())) {
    const addNew = page
      .getByRole("menuitem", { name: /add new column/i })
      .or(page.getByRole("option", { name: /add new column/i }));
    if ((await addNew.count()) > 0) {
      await addNew.first().hover();
      await page.waitForTimeout(200);
    }
  }
  if (!(await visible())) {
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemcheckbox"]')]
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0)
        .slice(0, 40),
    );
    fail(`Column menu did not include ${JSON.stringify(label)}. Menu: ${names.join(" | ") || "(none)"}`);
  }
  await item.first().click();
}

async function showSystemColumn(page: Page, title: string, column: string): Promise<void> {
  const found = await locateTitle(page, title);
  const visible = columnTitle(column);
  if ((await headerLabels(page, found.id)).includes(visible)) return;
  await clickAddColumn(page, found.id);
  await page.waitForTimeout(300);
  await pickMenuLabel(page, column);
  try {
    await page.waitForFunction(
      (wanted) =>
        [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].some((node) =>
          (node.textContent || "").replace(/Column menu/g, "").trim() === wanted,
        ),
      visible,
      { timeout: 8000 },
    );
  } catch {
    fail(`Column ${JSON.stringify(column)} was not added to ${JSON.stringify(title)}.`);
  }
}

async function showTypedColumn(page: Page, title: string, name: string, type: "text" | "date"): Promise<void> {
  const found = await locateTitle(page, title);
  const before = await headerLabels(page, found.id);
  if (before.includes(name)) return;
  await clickAddColumn(page, found.id);
  await page.waitForTimeout(300);
  await pickMenuLabel(page, type === "date" ? "Date" : "Text");
  try {
    await page.waitForFunction(
      (previous) => {
        const labels = [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].map((node) =>
          (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim(),
        );
        return labels.some((label) => label.length > 0 && !previous.includes(label));
      },
      before,
      { timeout: 8000 },
    );
  } catch {
    fail(`Column ${JSON.stringify(name)} was not added to ${JSON.stringify(title)}.`);
  }
  const after = await headerLabels(page, found.id);
  const created = after.find((label) => !before.includes(label));
  if (!created) fail(`Column ${JSON.stringify(name)} was not added to ${JSON.stringify(title)}.`);
  if (created !== name) await renameColumnItem(page, created, name);
}

async function showSelectColumn(page: Page, title: string, column: string, options: string[]): Promise<void> {
  const found = await locateTitle(page, title);
  const before = await headerLabels(page, found.id);
  if (before.includes(column)) return;
  await clickAddColumn(page, found.id);
  await page.waitForTimeout(300);
  await pickMenuLabel(page, "Single-select");
  await page.waitForTimeout(200);
  const valueType = page
    .getByRole("menuitem", { name: "Text", exact: true })
    .or(page.getByRole("option", { name: "Text", exact: true }));
  if ((await valueType.count()) > 0) await valueType.first().click();
  await page.waitForTimeout(400);
  const dialog = page.getByRole("dialog").last();
  if ((await dialog.count()) > 0 && (await dialog.isVisible())) {
    await fillChoiceDialog(page, dialog, column, options);
    return;
  }
  try {
    await page.waitForFunction(
      (previous) => {
        const labels = [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].map((node) =>
          (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim(),
        );
        return labels.some((label) => label.length > 0 && !previous.includes(label));
      },
      before,
      { timeout: 8000 },
    );
  } catch {
    fail(`Single-select column was not added to ${JSON.stringify(title)}.`);
  }
  const after = await headerLabels(page, found.id);
  const created = after.find((label) => !before.includes(label));
  if (!created) fail(`Single-select column was not added to ${JSON.stringify(title)}.`);
  if (created !== column) await renameColumnItem(page, created, column);
  await addColumnChoices(page, column, options);
}

async function rightClickHeader(page: Page, id: string, label?: string): Promise<void> {
  const headers = page.locator(`[data-selectable="${id}"] [role="columnheader"]`);
  const header = label ? headers.filter({ hasText: label }).last() : headers.last();
  try {
    await header.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Column header was not found.");
  }
  await header.click({ button: "right" });
}

async function clickPlainText(page: Page, label: string): Promise<void> {
  const item = page.getByText(label, { exact: true });
  try {
    await item.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`${label} was not found.`);
  }
  await item.first().click();
}

async function showCalculation(page: Page, title: string, column: string, formula: string): Promise<void> {
  const found = await locateTitle(page, title);
  const before = await headerLabels(page, found.id);
  if (before.includes(column)) return;
  await rightClickHeader(page, found.id);
  await clickPlainText(page, "Add new column");
  const bar = page.locator(".cm-content").first();
  try {
    await bar.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Formula bar was not found.");
  }
  await bar.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(formula);
  await page.keyboard.press("Enter");
  try {
    await page.waitForFunction(
      (previous) => {
        const labels = [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].map((node) =>
          (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim(),
        );
        return labels.some((label) => label.length > 0 && !previous.includes(label));
      },
      before,
      { timeout: 8000 },
    );
  } catch {
    fail(`Column ${JSON.stringify(column)} was not added to ${JSON.stringify(title)}.`);
  }
  const after = await headerLabels(page, found.id);
  const created = after.find((label) => !before.includes(label));
  if (!created) fail(`Column ${JSON.stringify(column)} was not added to ${JSON.stringify(title)}.`);
  if (created === column) return;
  await rightClickHeader(page, found.id, created);
  await clickPlainText(page, "Rename column");
  const field = page.getByRole("textbox", { name: created, exact: true });
  await field.fill(column);
  await field.press("Enter");
  try {
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].some(
          (node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim() === name,
        ),
      column,
      { timeout: 5000 },
    );
  } catch {
    fail(`Column is not ${JSON.stringify(column)}.`);
  }
}

async function renameColumnItem(page: Page, current: string, wanted: string): Promise<void> {
  const item = page.locator('[data-testid^="sheet-column-item-"]').filter({ hasText: current }).first();
  await item.click();
  await item.locator('button[aria-label="Column menu"]').click({ force: true });
  await page.getByText("Rename column", { exact: true }).click();
  const field = page.getByRole("textbox", { name: current, exact: true });
  await field.fill(wanted);
  await field.press("Enter");
  try {
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].some(
          (node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim() === name,
        ),
      wanted,
      { timeout: 5000 },
    );
  } catch {
    fail(`Column is not ${JSON.stringify(wanted)}.`);
  }
}

async function addColumnChoices(page: Page, column: string, options: string[]): Promise<void> {
  const item = page.locator('[data-testid^="sheet-column-item-"]').filter({ hasText: column }).first();
  await item.click();
  await item.locator('button[aria-label="Column menu"]').click({ force: true });
  await page.getByText("Edit options…", { exact: true }).click();
  const field = page.getByRole("textbox", { name: /add text value/i });
  try {
    await field.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Column ${JSON.stringify(column)} has no place to add choices.`);
  }
  for (const option of options) {
    await field.fill(option);
    await field.press("Enter");
    try {
      await page.waitForFunction((wanted) => (document.body.innerText || "").includes(wanted), option, { timeout: 5000 });
    } catch {
      fail(`Column ${JSON.stringify(column)} did not keep ${JSON.stringify(option)}.`);
    }
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function choiceShown(page: Page, option: string): Promise<boolean> {
  const text = page.getByText(option, { exact: true });
  return (await text.count()) > 0;
}

async function fillChoiceDialog(page: Page, dialog: Locator, column: string, options: string[]): Promise<void> {
  const name = dialog.getByRole("textbox").first();
  await name.fill(column);
  for (const option of options) {
    const field = dialog.getByRole("textbox").last();
    await field.fill(option);
    await field.press("Enter");
  }
  const done = dialog.getByRole("button", { name: /save|create|done|add/i });
  if ((await done.count()) > 0) await done.first().click();
  else await page.keyboard.press("Enter");
}

async function clickControlTile(page: Page, label: string): Promise<void> {
  const point = await page.evaluate((wanted) => {
    const tiles = [...document.querySelectorAll("div, button")].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text !== wanted) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 48 && rect.width <= 96 && rect.height >= 56 && rect.height <= 96;
    });
    const tile = tiles[0];
    if (!(tile instanceof HTMLElement)) return null;
    const rect = tile.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  }, label);
  if (!point) fail(`Control tile ${JSON.stringify(label)} was not found.`);
  await page.mouse.click(point.x, point.y);
}

async function nameControl(page: Page, id: string, title: string): Promise<void> {
  const host = page.locator(`[data-testid="element_${id}"]`).first();
  try {
    await host.click({ force: true, timeout: 5000 });
  } catch {
    fail(`Control ${id} was not found.`);
  }
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  if ((await properties.count()) < 1) fail("Properties tab was not found.");
  await properties.first().click();
  const field = page.locator('input[placeholder="control-id"]');
  try {
    await field.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Control ${id} has no control id field.`);
  }
  await field.first().fill(title);
  await field.first().press("Enter");
  const writeTitle = async () => {
    const editable = page.locator(`[data-testid="element_${id}"] [data-testid="dynamic-title"] [contenteditable="true"]`).first();
    const titleNode = page.locator(`[data-testid="element_${id}"] [data-testid="dynamic-title"]`).first();
    const target = (await editable.count()) > 0 ? editable : titleNode;
    await target.click({ force: true });
    await page.keyboard.press("Meta+A");
    await page.keyboard.insertText(title);
    await page.keyboard.press("Enter");
  };
  await writeTitle();
  await page.waitForTimeout(600);
  const shown = await page.evaluate((elementId) => {
    const node = document.querySelector(`[data-testid="element_${elementId}"] [data-testid="dynamic-title"]`);
    return (node?.textContent || "").trim();
  }, id);
  if (shown !== title) await writeTitle();
  try {
    await page.waitForFunction(
      ({ elementId, wanted }) => {
        const node = document.querySelector(`[data-testid="element_${elementId}"] [data-testid="dynamic-title"]`);
        return (node?.textContent || "").trim() === wanted;
      },
      { elementId: id, wanted: title },
      { timeout: 5000 },
    );
  } catch {
    fail(`Title is not ${JSON.stringify(title)}.`);
  }
}

async function chooseNamedValue(page: Page, label: string, value: string): Promise<void> {
  const pattern = new RegExp(label, "i");
  const box = page.getByRole("combobox", { name: pattern });
  const button = page.getByRole("button", { name: pattern });
  const control = (await box.count()) > 0 ? box.first() : (await button.count()) > 0 ? button.first() : null;
  if (!control) fail(`${label} was not found.`);
  const current = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
  if (current === value) return;
  await control.click();
  const option = page.getByRole("option", { name: value, exact: true });
  try {
    await option.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`${label} did not offer ${JSON.stringify(value)}.`);
  }
  await option.first().click();
  try {
    await control.filter({ hasText: value }).waitFor({ state: "visible", timeout: 3000 });
  } catch {
    const after = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
    fail(`${label} is ${JSON.stringify(after)}, wanted ${JSON.stringify(value)}.`);
  }
}

async function setPhiCheck(page: Page, label: string, wantOn: boolean): Promise<void> {
  const box = await page.evaluateHandle((wanted) => {
    const labels = [...document.querySelectorAll("[data-phi-label='true']")].filter((node) => {
      return (node.textContent || "").replace(/\s+/g, " ").trim() === wanted;
    });
    const marked = labels.find((node) => node instanceof HTMLElement && node.id.length > 0);
    if (!(marked instanceof HTMLElement)) return null;
    const owner = [...document.querySelectorAll("[aria-labelledby]")].find((node) =>
      (node.getAttribute("aria-labelledby") || "").split(/\s+/).includes(marked.id),
    );
    const input = owner?.querySelector("input[type='checkbox']");
    return input instanceof HTMLInputElement ? input : null;
  }, label);
  const element = box.asElement();
  if (!element) {
    await box.dispose();
    fail(`${label} checkbox was not found.`);
  }
  const checked = await element.evaluate((node) => node instanceof HTMLInputElement && node.checked);
  if (checked === wantOn) {
    await element.dispose();
    return;
  }
  await element.click();
  const after = await element.evaluate((node) => node instanceof HTMLInputElement && node.checked);
  await element.dispose();
  if (after !== wantOn) fail(`${label} did not turn ${wantOn ? "on" : "off"}.`);
}

async function createDateControl(page: Page, title: string): Promise<void> {
  try {
    await locateTitle(page, title);
    return;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Controls");
  await page.waitForTimeout(300);
  await clickControlTile(page, "Date");
  const id = await createdId(page, before);
  await nameControl(page, id, title);
}

async function createListControl(
  page: Page,
  title: string,
  source: string,
  column: string,
  multiple: "on" | "off",
  nullOption: "on" | "off",
  clear: "on" | "off",
  search: "on" | "off",
): Promise<void> {
  try {
    await locateTitle(page, title);
    return;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Controls");
  await page.waitForTimeout(300);
  await clickControlTile(page, "List values");
  const id = await createdId(page, before);
  await nameControl(page, id, title);
  await chooseNamedValue(page, "Value source", source);
  await chooseNamedValue(page, "Source column", column);
  await setPhiCheck(page, "Allow multiple selection", multiple === "on");
  await setPhiCheck(page, "Show null option", nullOption === "on");
  await setPhiCheck(page, "Show clear button", clear === "on");
  await setPhiCheck(page, "Show search box", search === "on");
}

async function createSegmentedControl(page: Page, title: string, options: string[]): Promise<void> {
  try {
    await locateTitle(page, title);
    return;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  const before = new Set(await selectableIds(page));
  await clickExactButton(page, "Controls");
  await page.waitForTimeout(300);
  await clickMatchingButton(page, /^segmented$/i);
  const id = await createdId(page, before);
  await setControlId(page, id, title);
  await renameTitle(page, id, title);
  await page.waitForTimeout(600);
  if ((await readCanvasTitle(page, id)) !== title) await renameTitle(page, id, title);
  await fillControlValues(page, options);
}

async function fillControlValues(page: Page, options: string[]): Promise<void> {
  for (const option of options) {
    if (await choiceShown(page, option)) continue;
    const add = page.getByRole("button", { name: /add value|add option/i });
    if ((await add.count()) > 0) await add.first().click();
    const field = page.getByRole("textbox", { name: /value/i }).last();
    try {
      await field.waitFor({ state: "visible", timeout: 3000 });
    } catch {
      fail(`Segmented control has no place to add ${JSON.stringify(option)}.`);
    }
    await field.fill(option);
    await field.press("Enter");
    try {
      await page.waitForFunction((wanted) => (document.body.innerText || "").includes(wanted), option, { timeout: 5000 });
    } catch {
      fail(`Segmented control did not keep ${JSON.stringify(option)}.`);
    }
  }
}

async function saveButtonUpdate(
  page: Page,
  button: string,
  table: string,
  column: string,
  valueControl: string,
  rowIdControl: string,
): Promise<void> {
  const found = await locateTitle(page, button);
  await page.locator(`[data-selectable="${found.id}"], [data-testid="element-${found.id}"]`).first().click();
  await page.getByRole("tab", { name: "Actions" }).click();
  const already = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
  if (
    /update row/i.test(already) &&
    already.includes(table) &&
    already.includes(column) &&
    already.includes(valueControl) &&
    already.includes(rowIdControl)
  ) {
    return;
  }
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("button", { name: "Open options Action" }).click();
  const effect = page.getByRole("option", { name: /^update row/i });
  if ((await effect.count()) < 1) fail("Update row was not offered.");
  await effect.first().click();
  const heading = page.getByRole("heading", { name: /update row/i });
  await heading.waitFor({ state: "visible", timeout: 5000 });
  const dialog = await actionSurface(page, heading);
  const target = await locateTitle(page, table);
  await selectIntoTable(page, dialog, table, target.id);
  if (!/single row/i.test((await dialog.innerText()) || "")) {
    const picked = await chooseRowOption(page, dialog, ["Single row"]);
    if (!picked) fail("Update row did not offer Single row.");
  }
  if (!((await dialog.innerText()) || "").includes(rowIdControl)) {
    const picked = await chooseRowOption(page, dialog, ["Control", rowIdControl]);
    if (!picked) await chooseRowOption(page, dialog, [rowIdControl]);
  }
  if (!((await dialog.innerText()) || "").includes(rowIdControl)) {
    await dialog.getByText(/\(test\)/).first().click();
    if (!(await clickControlChoice(page, rowIdControl))) {
      fail(`Update row did not offer ${JSON.stringify(rowIdControl)}.`);
    }
  }
  if ((await dialog.getByRole("button", { name: column, exact: true }).count()) < 1) {
    const current = dialog.getByRole("button", { name: /^(name|ID)$/ });
    if ((await current.count()) < 1) fail(`Update row did not target column ${JSON.stringify(column)}.`);
    await current.first().click();
    const choice = page.getByText(column, { exact: true }).last();
    try {
      await choice.click({ timeout: 5000 });
    } catch {
      fail(`Update row did not offer column ${JSON.stringify(column)}.`);
    }
  }
  if (!showsControl((await dialog.innerText()) || "", valueControl)) {
    const row = columnRow(dialog, column);
    await chooseRowOption(page, row, ["Control"]);
    await chooseRowOption(page, row, [valueControl]);
  }
  if (!showsControl((await dialog.innerText()) || "", valueControl)) {
    await dialog.getByText(/\(test\)/).last().click();
    if (!(await clickControlChoice(page, valueControl))) {
      fail(`Update row did not offer ${JSON.stringify(valueControl)}.`);
    }
  }
  const shown = (await dialog.innerText()) || "";
  if (!showsControl(shown, rowIdControl)) fail(`Update row did not match ${JSON.stringify(rowIdControl)}.`);
  if (!showsControl(shown, valueControl)) fail(`Update row did not write ${JSON.stringify(valueControl)}.`);
  if (!/single row/i.test(shown)) fail("Update row did not use a single row.");
  await closeActionDialog(page, dialog, heading);
}

async function actionSurface(page: Page, heading: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog").filter({ has: heading });
  if ((await dialog.count()) >= 1) return dialog.last();
  const surface = page.locator("div").filter({ has: heading }).filter({
    has: page.getByRole("button", { name: "Close", exact: true }),
  });
  if ((await surface.count()) >= 1) return surface.last();
  fail("Action dialog was not found.");
}

async function saveColumnSelect(
  page: Page,
  table: string,
  clickColumn: string,
  control: string,
  sourceColumn: string,
): Promise<void> {
  const found = await locateTitle(page, table);
  await headerLabels(page, found.id);
  const columnItem = page.locator('[data-testid^="sheet-column-item-"]').filter({ hasText: clickColumn }).first();
  try {
    await columnItem.click({ timeout: 5000 });
  } catch {
    fail(`Column ${JSON.stringify(clickColumn)} was not found on ${JSON.stringify(table)}.`);
  }
  await page.getByRole("tab", { name: "Actions" }).click();
  const onSelect = page.getByRole("button", { name: "On select", exact: true });
  if ((await onSelect.count()) < 1) {
    const addSequence = page.getByRole("button", { name: "Add action sequence", exact: true });
    if ((await addSequence.count()) < 1) fail("On select was not on the column.");
    await addSequence.click();
  }
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  const actionOptions = page.getByRole("button", { name: "Open options Action" });
  if ((await actionOptions.count()) > 0) await actionOptions.first().click();
  const effect = page.getByRole("option", { name: "Set control value", exact: true });
  if ((await effect.count()) > 0) await effect.first().click();
  const heading = page.getByRole("heading", { name: /^set /i });
  await heading.waitFor({ state: "visible", timeout: 5000 });
  const dialog = await insertRowDialog(page, heading);
  if (!((await dialog.innerText()) || "").includes(control)) {
    const update = dialog.getByText("Update control", { exact: true }).locator("xpath=following::*[1]");
    await update.click();
    const option = page.getByText(control, { exact: true }).last();
    try {
      await option.click({ timeout: 5000 });
    } catch {
      fail(`Set control value did not offer ${JSON.stringify(control)}.`);
    }
  }
  if (!/set value as[\s\S]*column/i.test((await dialog.innerText()) || "")) {
    await dialog.getByRole("combobox", { name: /static values/i }).click();
    await page.getByRole("option", { name: "Column", exact: true }).click();
  }
  const sourceButton = dialog.getByRole("button", { name: sourceColumn, exact: true });
  if ((await sourceButton.count()) < 1) {
    const current = dialog.getByRole("button", { name: clickColumn, exact: true });
    if ((await current.count()) > 0) await current.first().click();
    else await dialog.getByText("Column", { exact: true }).last().click();
    const cell = page.getByRole("gridcell", { name: sourceColumn, exact: true });
    try {
      await cell.click({ timeout: 5000 });
    } catch {
      fail(`Set control value did not offer column ${JSON.stringify(sourceColumn)}.`);
    }
  }
  const selection = dialog.getByText(/set control selection to/i);
  if ((await selection.count()) > 0 && !/replace previous selection/i.test((await dialog.innerText()) || "")) {
    await selection.first().locator("xpath=ancestor::*[.//button][1]").click();
    await page.getByRole("option", { name: "Replace previous selection", exact: true }).click();
  }
  const shown = (await dialog.innerText()) || "";
  if (!shown.includes(control)) fail(`Set control value did not target ${JSON.stringify(control)}.`);
  if (!shown.includes(sourceColumn)) fail(`Set control value did not read ${JSON.stringify(sourceColumn)}.`);
  await closeActionDialog(page, dialog, heading);
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
  control: (kind: HandleKind, handle: string) => Promise<string>;
  column: (column: string) => Promise<string>;
} {
  return {
    async control(kind, handle) {
      const title = controlTitle(kind, handle);
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
  const path = new URL(page.url()).pathname.replace(/\/$/, "");
  if (!path.endsWith("/edit")) {
    await page.locator('[data-testid="workbook-canvas"]').waitFor({ state: "visible", timeout: 30000 });
    return;
  }
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

function showsControl(text: string, title: string): boolean {
  if (text.includes(title)) return true;
  const sentence = title
    .replace(/^[cv]\./, "")
    .split(/[_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return sentence.length > 0 && text.includes(sentence);
}

async function clickControlChoice(page: Page, wanted: string): Promise<boolean> {
  await page.waitForTimeout(300);
  return page.evaluate((name) => {
    const nodes = [...document.querySelectorAll("div")].filter((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text !== name) return false;
      const box = node.getBoundingClientRect();
      return box.width >= 40 && box.width <= 280 && box.height >= 14 && box.height <= 40;
    });
    const hit = nodes[nodes.length - 1];
    if (!(hit instanceof HTMLElement)) return false;
    hit.click();
    return true;
  }, wanted);
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

const WARNING = "rgb(238, 138, 43)";

async function existingId(page: Page, title: string): Promise<string | undefined> {
  try {
    return (await locateTitle(page, title)).id;
  } catch (error) {
    if (error instanceof Exit && error.message.includes("was not found")) return undefined;
    throw error;
  }
}

async function rightmost(locator: Locator, missing: string): Promise<Locator> {
  const count = await locator.count();
  if (count < 1) fail(missing);
  if (count === 1) return locator.first();
  const index = await locator.evaluateAll((nodes) => {
    let best = 0;
    let bestX = -1;
    nodes.forEach((node, i) => {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.x >= bestX) {
        bestX = box.x;
        best = i;
      }
    });
    return best;
  });
  return locator.nth(index);
}

async function openPageFormat(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const tab = page.getByRole("tab", { name: /^format$/i });
  if ((await tab.count()) < 1) fail("Format tab was not found.");
  await tab.first().click();
}

async function chooseCombobox(page: Page, name: RegExp, value: string, label: string): Promise<void> {
  const box = await rightmost(page.getByRole("combobox", { name }), `Combobox ${name} was not found.`);
  const tag = await box.evaluate((el) => el.tagName.toLowerCase());
  const current =
    tag === "select" ? await box.inputValue() : ((await box.innerText()) || "").replace(/\s+/g, " ").trim();
  if (current === value || current === label) return;
  if (tag === "select") {
    await box.selectOption(value);
    return;
  }
  await box.click();
  const byValue = page.locator(`[role="option"][data-value="${value}"]`);
  if ((await byValue.count()) > 0) {
    await byValue.first().click();
    return;
  }
  const option = page.getByRole("option", { name: label, exact: true });
  if ((await option.count()) < 1) fail(`Option ${label} was not found.`);
  await option.first().click();
}

async function openDisclosure(page: Page, name: string): Promise<void> {
  const button = await rightmost(page.getByRole("button", { name, exact: true }), `${name} disclosure was not found.`);
  if ((await button.getAttribute("aria-expanded")) === "true") return;
  await button.click();
}

async function switchFor(page: Page, label: string): Promise<Locator> {
  const nested = page.locator(`[aria-label="${label}"] [role="switch"]`);
  if ((await nested.count()) > 0) return nested.first();
  const self = page.locator(`[role="switch"][aria-label="${label}"]`);
  if ((await self.count()) > 0) return self.first();
  const named = page.getByRole("switch", { name: label, exact: true });
  if ((await named.count()) > 0) return named.first();
  fail(`${label} switch was not found.`);
}

async function setSwitch(page: Page, label: string, wantOn: boolean): Promise<void> {
  const sw = await switchFor(page, label);
  if (((await sw.getAttribute("aria-checked")) === "true") === wantOn) return;
  await sw.click();
  try {
    await page.waitForFunction(
      ({ name, want }) => {
        const match = [...document.querySelectorAll('[role="switch"]')].find((el) => {
          const row = el.closest("[aria-label]")?.getAttribute("aria-label") || el.getAttribute("aria-label") || "";
          return row === name;
        });
        return match?.getAttribute("aria-checked") === (want ? "true" : "false");
      },
      { name: label, want: wantOn },
      { timeout: 3000 },
    );
  } catch {
    fail(`${label} did not turn ${wantOn ? "on" : "off"}.`);
  }
}

async function ensureOn(page: Page, label: string): Promise<void> {
  for (const role of ["switch", "checkbox", "button"] as const) {
    const found = page.getByRole(role, { name: label, exact: true });
    if ((await found.count()) < 1) continue;
    const control = found.first();
    const on =
      (await control.getAttribute("aria-checked")) === "true" ||
      (await control.getAttribute("aria-pressed")) === "true";
    if (!on) await control.click();
    return;
  }
  fail(`${label} control was not found.`);
}

async function commitHeaderTitle(page: Page, header: string): Promise<void> {
  const result = await page.evaluate((title) => {
    function shown(node: HTMLElement): string {
      return (node.textContent || "").replace(/\s+/g, " ").trim();
    }
    function commit(editable: HTMLElement): string {
      if (shown(editable) === title) return shown(editable);
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      const selection = window.getSelection();
      if (!selection) return "";
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, title);
      editable.blur();
      return shown(editable);
    }
    const panel = [...document.querySelectorAll("button")].find((button) => {
      return (button.textContent || "").trim() === "Header" && button.getBoundingClientRect().width > 0;
    });
    let node = panel?.parentElement ?? null;
    for (let depth = 0; depth < 8 && node; depth++) {
      const editable = node.querySelector(
        "[data-testid='text-tile'] [contenteditable='true'], [data-testid='dynamic-title'] [contenteditable='true']",
      );
      if (editable instanceof HTMLElement && !editable.closest("[data-selectable]")) {
        const text = commit(editable);
        return { ok: text === title, text };
      }
      node = node.parentElement;
    }
    for (const heading of document.querySelectorAll("h1, h2, h3")) {
      const editable = heading.querySelector(
        "[data-testid='dynamic-title'] [contenteditable='true'], [data-testid='text-tile'] [contenteditable='true'], [contenteditable='true']",
      );
      if (editable instanceof HTMLElement) {
        const text = commit(editable);
        return { ok: text === title, text };
      }
    }
    return { ok: false, text: "" };
  }, header);
  if (!result.ok) fail(`Header title is ${JSON.stringify(result.text)}, wanted ${JSON.stringify(header)}.`);
}

async function formatErrorModal(page: Page, header: string): Promise<void> {
  await openPageFormat(page);
  await chooseCombobox(page, /width/i, "xSmall", "Extra small");
  await chooseCombobox(page, /spacing/i, "medium", "Medium");
  await ensureOn(page, "Padding");
  await ensureOn(page, "Element gap");
  await openDisclosure(page, "Footer");
  await setSwitch(page, "Show primary button", false);
  await setSwitch(page, "Show secondary button", false);
  await openDisclosure(page, "Header");
  await commitHeaderTitle(page, header);
  await setSwitch(page, "Show close icon", false);
}

async function clickAddElement(page: Page): Promise<void> {
  const add = page.getByRole("button", { name: /^add element\b/i });
  if ((await add.count()) >= 1) {
    await add.first().click();
    return;
  }
  await clickExactButton(page, "UI");
}

async function clickTextType(page: Page): Promise<void> {
  const named = [
    page.getByRole("menuitem", { name: /^text$/i }),
    page.getByRole("option", { name: /^text$/i }),
    page.getByRole("button", { name: /^text$/i }),
  ];
  for (const locator of named) {
    if ((await locator.count()) >= 1) {
      await locator.first().click();
      return;
    }
  }
  fail("Text element type was not found.");
}

async function addText(page: Page): Promise<string> {
  const before = new Set(await selectableIds(page));
  await clickAddElement(page);
  await page.waitForTimeout(300);
  await clickTextType(page);
  return createdId(page, before);
}

async function readSentence(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const host = document.querySelector(`[data-selectable="${elementId}"]`);
    const editable = host?.querySelector("[contenteditable='true'], [contenteditable='']");
    const source = editable ?? host;
    return (source?.textContent || "").replace(/\s+/g, " ").trim();
  }, id);
}

async function writeSentence(page: Page, id: string, sentence: string): Promise<void> {
  if ((await readSentence(page, id)) === sentence) return;
  const field = page
    .locator(`[data-selectable="${id}"] [contenteditable="true"], [data-selectable="${id}"] [contenteditable=""]`)
    .first();
  try {
    await field.click({ timeout: 5000 });
  } catch {
    fail(`Sentence field was not found on ${id}.`);
  }
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(sentence);
  await page.keyboard.press("Escape");
  const after = await readSentence(page, id);
  if (after !== sentence) fail(`Sentence is ${JSON.stringify(after)}, wanted ${JSON.stringify(sentence)}.`);
}

async function selectFrame(page: Page, id: string, label: string): Promise<void> {
  const host = page.locator(`[data-testid="element-${id}"]`);
  try {
    await host.waitFor({ state: "attached", timeout: 5000 });
  } catch {
    fail(`${label}: element-${id} is not on the page.`);
  }
  await host.click({ position: { x: 2, y: 2 } });
  const editing = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && (active.isContentEditable || !!active.closest("[contenteditable='true']"));
  });
  if (editing) {
    await page.keyboard.press("Escape");
    const handle = page.locator(`[data-testid="selection_resizers_container_${id}"]`).getByRole("button", { name: /drag/i });
    if ((await handle.count()) > 0) await handle.first().click();
    else await host.click({ position: { x: 2, y: 2 } });
  }
  await confirmSelected(page, id, label);
}

async function alignLeft(page: Page, id: string): Promise<void> {
  await selectFrame(page, id, "sentence");
  const button = page.getByRole("button", { name: "Left align", exact: true });
  if ((await button.count()) < 1) fail("Left align was not found.");
  await button.first().click();
  const align = await page.evaluate((elementId) => {
    const host = document.querySelector(`[data-selectable="${elementId}"]`);
    const block = host?.querySelector("p") ?? host?.querySelector("[contenteditable='true']");
    if (!(block instanceof HTMLElement)) return "";
    const inline = block.getAttribute("style") || "";
    if (/text-align:\s*left/i.test(inline)) return "left";
    return getComputedStyle(block).textAlign;
  }, id);
  if (align !== "left" && align !== "start") fail(`Sentence alignment is ${align || "unset"}.`);
}

async function ensureSentence(page: Page, sentence: string): Promise<string> {
  const existing = await existingId(page, sentence);
  const id = existing ?? (await addText(page));
  await writeSentence(page, id, sentence);
  await alignLeft(page, id);
  return id;
}

async function clickHorizontalStretch(page: Page): Promise<void> {
  const group = page.getByRole("radiogroup", { name: /^horizontal$/i });
  if ((await group.count()) > 0) {
    const radio = group.first().getByRole("radio", { name: /^stretch$/i });
    if ((await radio.count()) > 0) {
      await radio.first().click();
      return;
    }
  }
  const radios = page.getByRole("radio", { name: /^stretch$/i });
  const count = await radios.count();
  if (count < 1) fail("Horizontal Stretch was not found.");
  if (count === 1) {
    await radios.first().click();
    return;
  }
  const index = await radios.evaluateAll((nodes) => {
    const match = nodes.findIndex((node) => {
      let parent: Element | null = node.parentElement;
      for (let depth = 0; depth < 8 && parent; depth++) {
        const label = parent.getAttribute("aria-label") || "";
        const text = parent instanceof HTMLElement ? parent.innerText.slice(0, 40) : "";
        if (label === "Horizontal" || /^horizontal\b/i.test(text)) return true;
        parent = parent.parentElement;
      }
      return false;
    });
    return match < 0 ? 0 : match;
  });
  await radios.nth(index).click();
}

async function paintWarning(page: Page, id: string): Promise<void> {
  const fill = page.getByRole("button", { name: /^fill color$/i });
  if ((await fill.count()) < 1) fail("Fill color was not found.");
  await fill.first().click();
  const named = page.getByRole("button", { name: /^warning$/i });
  const option = page.getByRole("option", { name: /^warning$/i });
  if ((await named.count()) > 0) await named.first().click();
  else if ((await option.count()) > 0) await option.first().click();
  else {
    const point = await page.evaluate((warning) => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1) ?? document.body;
      for (const node of dialog.querySelectorAll("*")) {
        if (!(node instanceof HTMLElement)) continue;
        const label = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`.trim();
        if (/^warning$/i.test(label)) {
          const rect = node.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      for (const node of dialog.querySelectorAll("*")) {
        if (!(node instanceof HTMLElement)) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 8 || rect.width > 40 || rect.height < 8 || rect.height > 40) continue;
        if (getComputedStyle(node).backgroundColor === warning) {
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    }, WARNING);
    if (!point) fail("Warning swatch was not found.");
    await page.mouse.click(point.x, point.y);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const painted = await page.evaluate(
    ({ elementId, warning }) => {
      const host = document.querySelector(`[data-selectable="${elementId}"]`);
      if (!(host instanceof HTMLElement)) return "";
      for (const node of [host, ...host.querySelectorAll("*")]) {
        if (!(node instanceof HTMLElement)) continue;
        if (getComputedStyle(node).backgroundColor === warning) return warning;
        const style = node.getAttribute("style") || "";
        if (style.includes("--colors-warningFill") || /ee8a2b/i.test(style)) return "warningFill";
      }
      return "";
    },
    { elementId: id, warning: WARNING },
  );
  if (!painted) fail("Button fill is not Warning.");
}

/** addButton already wrote this label. A later onTitleChange rename is a different commit. */
async function ensureButton(page: Page, label: string): Promise<string> {
  let id = await existingId(page, label);
  if (!id) {
    await createButton(page, label);
    id = await existingId(page, label);
    if (!id) fail(`Button ${JSON.stringify(label)} was not created.`);
  }
  await page.locator(`[data-selectable="${id}"], [data-testid="element-${id}"]`).first().click();
  const properties = page.getByRole("tab", { name: /^properties$/i });
  if ((await properties.count()) > 0) await properties.first().click();
  await clickHorizontalStretch(page);
  await paintWarning(page, id);
  await saveButtonClose(page, label);
  return id;
}
