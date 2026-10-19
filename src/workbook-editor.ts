import type { Locator, Page } from "playwright";
import type { DrawerSettings, Editor, InsertValue } from "./editor.js";
import { Exit, fail } from "./errors.js";
import { locateTitle } from "./edit.js";
import { controlTitle, resolveListControl, type HandleKind } from "./handles.js";
import { groupShortcut, inspectorHeader, selectionClick } from "./container.js";
import { toEditUrl } from "./chrome.js";
import { confirmSelected, elementHosts, placeArea, readModel, selectElement } from "./place.js";
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
    async setListSource(title, source, column) {
      await setExistingListSource(page, title, source, column);
    },
    async addButton(title) {
      await createButton(page, title);
    },
    async setInsertAction(button, table, column, controlTitle) {
      await saveButtonInsert(page, button, table, column, controlTitle);
    },
    async setInsertRow(button, table, values) {
      await saveMappedInsert(page, button, table, values);
    },
    async renameColumn(title, column, name) {
      await renameExistingColumn(page, title, column, name);
    },
    async deleteColumn(title, column) {
      await deleteExistingColumn(page, title, column);
    },
    async deleteElement(title) {
      await deleteExistingElement(page, title);
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
      return (await readContainer(page, title)).id !== null;
    },
    async containerStyled(title) {
      return (await readContainer(page, title)).styled;
    },
    async paintContainer(title, border, radius) {
      const found = await readContainer(page, title);
      if (!found.id) fail(`Container ${title} was not found.`);
      const pageId = await selectedPageId(page);
      await selectContainer(page, found.id);
      try {
        await paintContainer(page, found.id, border, radius);
      } finally {
        await returnToPageNode(page, pageId);
      }
      rememberContainer(page, { title, id: found.id, styled: true });
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
    await item.first().waitFor({ state: "visible", timeout: 1500 });
  } catch {
    // Layout tiles are not menuitems. The Drawer tile is a sized div.
  }
  if ((await item.count()) === 1) await item.click();
  else await clickNamedTile(page, "Drawer");
  await page.waitForTimeout(600);
  const created = (await pageTabs(page)).filter((tab) => !before.has(tab.id));
  if (created.length !== 1) fail(`Expected one new drawer, found ${created.length}.`);
  const id = created[0].id;
  await page.keyboard.press("Escape");
  await page.locator(`[data-testid="page-dropdown-${id}"]`).click({ force: true });
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

async function buttonBesideLabel(panel: Locator, label: string): Promise<Locator | null> {
  const found = await panel.evaluate((root, wanted) => {
    root.querySelectorAll("[data-size-target]").forEach((el) => el.removeAttribute("data-size-target"));
    const ownText = (el: Element) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    const visible = (el: Element) => {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const labels = [...root.querySelectorAll("*")].filter((el) => ownText(el) === wanted && visible(el));
    for (const marked of labels) {
      let scope: HTMLElement | null = marked.parentElement;
      for (let depth = 0; depth < 6 && scope; depth += 1) {
        const buttons = [...scope.querySelectorAll("button")].filter((button) => {
          if (!visible(button)) return false;
          const text = (button.textContent || "").replace(/\s+/g, " ").trim();
          if (!/^(?:Small|Medium|Large)$/.test(text)) return false;
          const labelBox = marked.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return Math.abs(box.top - labelBox.top) < 28;
        });
        if (buttons.length === 1 && buttons[0] instanceof HTMLElement) {
          buttons[0].setAttribute("data-size-target", "1");
          return true;
        }
        scope = scope.parentElement;
      }
    }
    return false;
  }, label);
  if (!found) return null;
  return panel.locator("[data-size-target='1']").first();
}

async function chooseWord(page: Page, panel: Locator, name: RegExp, value: string, label: string): Promise<void> {
  const word = sizeWord(value);
  const button = panel.getByRole("button", { name });
  const combo = panel.getByRole("combobox", { name });
  const beside = (await button.count()) === 1 || (await combo.count()) === 1 ? null : await buttonBesideLabel(panel, label);
  const control = (await button.count()) === 1 ? button : (await combo.count()) === 1 ? combo : beside;
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

async function setHeaderSwitch(page: Page, panel: Locator, label: string, wantOn: boolean): Promise<void> {
  const read = async () =>
    panel.evaluate((root, wanted) => {
      root.querySelectorAll("[data-header-switch]").forEach((el) => el.removeAttribute("data-header-switch"));
      const ownText = (el: Element) =>
        [...el.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      const visible = (el: Element) => {
        if (!(el instanceof HTMLElement)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const markedOn = (el: Element) => {
        const named = el instanceof HTMLElement ? el.className.toString() : "";
        if (named.includes("khymoU")) return true;
        return [...el.querySelectorAll("*")].some(
          (node) => node instanceof HTMLElement && node.className.toString().includes("khymoU"),
        );
      };
      const labels = [...root.querySelectorAll("*")].filter((el) => ownText(el) === wanted && visible(el));
      if (labels.length !== 1) return { count: labels.length, on: false };
      const marked = labels[0];
      if (!(marked instanceof HTMLElement)) return { count: 0, on: false };
      let scope: HTMLElement | null = marked.parentElement;
      for (let depth = 0; depth < 6 && scope; depth += 1) {
        const buttons = [...scope.querySelectorAll("button, [role='switch']")].filter((button) => {
          if (!(button instanceof HTMLElement) || !visible(button)) return false;
          const text = (button.textContent || "").replace(/\s+/g, " ").trim();
          if (/^(?:Small|Medium|Large)$/.test(text)) return false;
          const labelBox = marked.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return Math.abs(box.top - labelBox.top) < 28;
        });
        if (buttons.length === 1 && buttons[0] instanceof HTMLElement) {
          buttons[0].setAttribute("data-header-switch", "1");
          return { count: 1, on: markedOn(buttons[0]) };
        }
        scope = scope.parentElement;
      }
      return { count: 0, on: false };
    }, label);
  const before = await read();
  if (before.count !== 1) fail(`${label} switch was not found.`);
  if (before.on === wantOn) return;
  const sw = panel.locator("[data-header-switch='1']").first();
  const box = await sw.boundingBox();
  if (!box) fail(`${label} switch was not found.`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const after = await read();
  if (after.on !== wantOn) fail(`${label} did not turn ${wantOn ? "on" : "off"}.`);
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
  if (settings.header) await setHeaderSwitch(page, panel, "Show title", settings.header === "on");
  if (settings.closeIcon) await setHeaderSwitch(page, panel, "Show close icon", settings.closeIcon === "on");
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
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  if ((await settings.count()) > 0) await settings.first().click();
  else if ((await properties.count()) > 0) await properties.first().click();
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

type ContainerRead = { title: string; id: string | null; styled: boolean };

const containerReads = new WeakMap<Page, ContainerRead>();

function rememberContainer(page: Page, read: ContainerRead): void {
  containerReads.set(page, read);
}

async function readContainer(page: Page, title: string): Promise<ContainerRead> {
  const cached = containerReads.get(page);
  if (cached?.title === title) return cached;
  const read = await scanContainer(page, title);
  containerReads.set(page, read);
  return read;
}

async function selectedPageId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    return (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
  });
}

async function returnToPageNode(page: Page, pageId: string): Promise<void> {
  if (!pageId) return;
  const current = new URL(page.url());
  const nodeId = current.searchParams.get(":nodeId") || current.searchParams.get("nodeId") || "";
  if (nodeId === pageId) return;
  const next = new URL(toEditUrl(page.url()));
  next.search = `:${new URLSearchParams({ nodeId: pageId }).toString()}`;
  await page.goto(next.toString(), { waitUntil: "domcontentloaded" });
  await page.locator(`[data-layout-id="layout-body-${pageId}"]`).waitFor({ state: "visible", timeout: 15000 });
}

async function selectContainer(page: Page, id: string): Promise<void> {
  const host = page.locator(elementHosts(id).join(", ")).first();
  await host.scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await host.click({ force: true, position: { x: 4, y: 4 } });
  } catch {
    await host.click({ force: true });
  }
}

async function inspectorHeaderLine(page: Page): Promise<string> {
  const header = page.locator(`[data-testid="${inspectorHeader}"]`);
  await header.waitFor({ state: "visible", timeout: 2000 }).catch(() => undefined);
  const raw = (await header.innerText().catch(() => "")) || "";
  return raw.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
}

async function containerFramed(page: Page, id: string, radius: string): Promise<boolean> {
  return page.evaluate(({ elementId, wantedRadius }) => {
    const host =
      document.querySelector(`[data-testid="element_${elementId}"]`) ??
      document.querySelector(`[data-testid="element-${elementId}"]`) ??
      document.querySelector(`[data-selectable="${elementId}"]`);
    if (!(host instanceof HTMLElement)) return false;
    const selectable = host.matches("[data-selectable]") ? host : host.querySelector("[data-selectable]");
    const containerId = selectable?.getAttribute("data-selectable") || elementId;
    return [...host.querySelectorAll("div")].some((el) => {
      const owner = el.closest("[data-selectable]");
      if (!(owner instanceof HTMLElement) || owner.getAttribute("data-selectable") !== containerId) return false;
      const style = getComputedStyle(el);
      return style.borderTopWidth === "1px" && style.borderTopStyle === "solid" && style.borderRadius === wantedRadius;
    });
  }, { elementId: id, wantedRadius: radius });
}

async function containerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
}

async function scanContainer(page: Page, title: string): Promise<ContainerRead> {
  const pageId = await selectedPageId(page);
  await returnToPageNode(page, pageId);
  const ids = await containerIds(page);
  let found: ContainerRead = { title, id: null, styled: false };
  try {
    for (const id of ids) {
      await selectContainer(page, id);
      if ((await inspectorHeaderLine(page)) !== title) continue;
      found = { title, id, styled: await containerFramed(page, id, "8px") };
      break;
    }
  } finally {
    await returnToPageNode(page, pageId);
  }
  return found;
}

async function writeInspectorTitle(page: Page, title: string): Promise<void> {
  const header = page.locator(`[data-testid="${inspectorHeader}"]`);
  const point = await page.evaluate((testId) => {
    const root = document.querySelector(`[data-testid="${testId}"]`);
    if (!(root instanceof HTMLElement)) return null;
    const label = [...root.querySelectorAll("div")].find((node) =>
      [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent || "").trim().length > 0),
    );
    if (!(label instanceof HTMLElement)) return null;
    const rect = label.getBoundingClientRect();
    return { x: rect.x + Math.min(24, rect.width / 2), y: rect.y + rect.height / 2 };
  }, inspectorHeader);
  if (!point) fail("Container title was not found.");
  await page.mouse.dblclick(point.x, point.y);
  const input = header.locator("input");
  try {
    await input.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Container title was not found.");
  }
  await input.fill(title);
  await input.press("Enter");
  try {
    await header.filter({ hasText: title }).waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Container title is not ${JSON.stringify(title)}.`);
  }
}

async function containerAround(page: Page, ids: string[]): Promise<string | null> {
  return page.evaluate((elementIds) => {
    const elementOf = (id: string) =>
      document.querySelector(`[data-testid="element_${id}"]`) ??
      document.querySelector(`[data-testid="element-${id}"]`);
    const parentOf = (id: string) => {
      const el = elementOf(id);
      const parent = el?.parentElement?.closest('[data-testid^="element_"], [data-testid^="element-"]');
      const testId = parent?.getAttribute("data-testid") || "";
      const parentId = testId.replace(/^element[_-]/, "");
      if (!parentId || parentId === id) return "";
      return parentId;
    };
    const parents = elementIds.map(parentOf);
    if (parents.some((id) => id.length === 0)) return null;
    if (new Set(parents).size !== 1) return null;
    const parentId = parents[0];
    const members = [...document.querySelectorAll('[data-testid^="element_"], [data-testid^="element-"]')]
      .map((el) => (el.getAttribute("data-testid") || "").replace(/^element[_-]/, ""))
      .filter((id) => id.length > 0 && parentOf(id) === parentId);
    const wanted = new Set(elementIds);
    if (members.length !== wanted.size || members.some((id) => !wanted.has(id))) return null;
    return parentId;
  }, ids);
}

async function createContainer(page: Page, titles: string[], title: string, border: string, radius: string): Promise<void> {
  containerReads.delete(page);
  await returnToPageNode(page, await selectedPageId(page));
  const ids: string[] = [];
  for (const elementTitle of titles) ids.push((await locateTitle(page, elementTitle)).id);
  const existing = await containerAround(page, ids);
  if (existing) {
    const host = page.locator(elementHosts(existing).join(", ")).first();
    await host.scrollIntoViewIfNeeded();
    await host.click({ force: true });
    await writeInspectorTitle(page, title);
    await paintContainer(page, existing, border, radius);
    rememberContainer(page, { title, id: existing, styled: true });
    return;
  }
  for (const [index, elementTitle] of titles.entries()) {
    const found = await locateTitle(page, elementTitle);
    const gesture = selectionClick(index);
    const host = page.locator(elementHosts(found.id).join(", ")).first();
    await host.scrollIntoViewIfNeeded();
    await host.click({ modifiers: gesture.modifiers, force: gesture.force, position: { x: 12, y: 8 } });
    try {
      await page.locator(`[data-testid="selection-border--${found.id}"]`).waitFor({ state: "attached", timeout: 5000 });
    } catch {
      fail(`${elementTitle} was not selected.`);
    }
  }
  const before = new Set(await selectableIds(page));
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="workbook-canvas"]');
    if (!(canvas instanceof HTMLElement)) return;
    canvas.tabIndex = -1;
    canvas.focus();
  });
  await page.keyboard.press(groupShortcut);
  const id = await createdId(page, before);
  await writeInspectorTitle(page, title);
  await paintContainer(page, id, border, radius);
  rememberContainer(page, { title, id, styled: true });
}

async function inspectorText(page: Page, label: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((wanted) => {
    const minX = window.innerWidth * 0.7;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.textContent || "").trim() !== wanted) continue;
      const el = node.parentElement;
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.x < minX || rect.width < 2 || rect.height < 2 || rect.height > 40) continue;
      return { x: rect.x + Math.min(12, rect.width / 2), y: rect.y + rect.height / 2 };
    }
    return null;
  }, label);
}

async function paintContainer(page: Page, id: string, border: string, radius: string): Promise<void> {
  const format = page.getByRole("tab", { name: /^format$/i });
  if ((await format.count()) >= 1) await format.first().click();
  const width = border.match(/^(\d+)px/)?.[1] ?? "";
  if (!width) fail(`Container border is not a pixel width: ${border}`);
  if (!(await inspectorText(page, "Border"))) {
    const style = (await inspectorText(page, "Style*")) ?? (await inspectorText(page, "Style"));
    if (!style) fail("Border width was not found.");
    await page.mouse.click(style.x, style.y);
  }
  const stroke = page.locator("button").filter({ hasText: /^(?:None|\d+px)$/ }).last();
  try {
    await stroke.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail("Border width was not found.");
  }
  await stroke.click();
  const option = await page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('[role="option"], [role="menuitem"]')) {
      if ((el.textContent || "").replace(/\s+/g, " ").trim() !== wanted) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      return { x: rect.x + 8, y: rect.y + rect.height / 2 };
    }
    return null;
  }, `${width}px`);
  if (!option) fail("Border width was not found.");
  await page.mouse.click(option.x, option.y);
  const pill = page.locator('[aria-label="Pill"]');
  if ((await pill.count()) < 1) fail("Pill corner was not found.");
  await pill.first().click();
  if (!(await containerFramed(page, id, radius))) {
    fail("Container style did not land. Expected a 1px solid border and 8px corners.");
  }
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
  await saveMappedInsert(page, button, table, [{ column, kind: "control", control: controlTitle }]);
}

async function saveMappedInsert(
  page: Page,
  button: string,
  table: string,
  values: InsertValue[],
): Promise<void> {
  let targetId = "";
  try {
    targetId = (await locateTitle(page, table)).id;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  const { heading, dialog } = await openInsertDialog(page, button);
  await selectIntoTable(page, dialog, table, targetId);
  for (const value of values) {
    try {
      await dialog.getByText(value.column, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      fail(`Insert row did not target column ${JSON.stringify(value.column)}.`);
    }
    await writeInsertValue(page, dialog, value);
    console.log(`${value.column} <= ${insertValueLabel(value)}`);
  }
  const mapped = values.map((value) => value.column);
  await clearUnmappedInsertColumns(page, mapped);
  await page.waitForTimeout(400);
  for (const value of values) {
    if (!(await insertValueCommitted(page, value))) fail(insertMiss(value));
  }
  const stuck = await page.evaluate(insertBridge, { op: "stuck", wanted: mapped });
  if (stuck.length > 0) fail(`Insert row still maps ${stuck.join(", ")}.`);
  const blanks = await blankInsertColumns(page, mapped);
  for (const column of blanks) console.log(`${column} <= blank`);
  await closeActionDialog(page, dialog, heading);
}

async function dismissInsertError(page: Page): Promise<void> {
  const error = page.getByRole("heading", { name: /error in insert row/i });
  if ((await error.count()) < 1) return;
  const close = page.getByRole("button", { name: "Close", exact: true });
  if ((await close.count()) > 0) await close.last().click();
  else await page.keyboard.press("Escape");
  try {
    await error.first().waitFor({ state: "hidden", timeout: 3000 });
  } catch {
    await page.keyboard.press("Escape");
  }
}

async function openInsertDialog(page: Page, button: string): Promise<{ heading: Locator; dialog: Locator }> {
  const listed = await actionPanelText(page, button);
  await dismissInsertError(page);
  const heading = page.getByRole("heading", { name: /insert row into/i }).last();
  if (/insert row/i.test(listed)) {
    const row = page.getByRole("button", { name: /insert row into/i }).first();
    try {
      await row.hover();
      const more = row
        .locator("xpath=ancestor::*[.//button[normalize-space()='More…']][1]")
        .getByRole("button", { name: "More…" })
        .last();
      await more.click();
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      await page.getByText("Set column values", { exact: true }).waitFor({ state: "visible", timeout: 8000 });
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      fail(`Insert row is on the button, but it did not open. ${message}`);
    }
    return { heading, dialog: await insertEditor(page, heading) };
  }
  const addAction = page.getByRole("button", { name: "Add action", exact: true });
  if ((await addAction.count()) < 1) {
    const addSequence = page.getByRole("button", { name: "Add action sequence", exact: true });
    if ((await addSequence.count()) < 1) fail("Insert row has no action sequence to add to.");
    await addSequence.click();
  }
  await page.getByRole("button", { name: "Add action", exact: true }).first().click();
  await page.getByRole("button", { name: "Open options Action" }).click();
  await page.getByRole("option", { name: "Insert row", exact: true }).click();
  await page.getByText("Set column values", { exact: true }).waitFor({ state: "visible", timeout: 8000 });
  return { heading, dialog: await insertEditor(page, heading) };
}

async function insertEditor(page: Page, heading: Locator): Promise<Locator> {
  const form = page.locator("div").filter({ has: heading }).filter({ hasText: "Set column values" });
  if ((await form.count()) > 0) return form.last();
  return actionSurface(page, heading);
}

type InsertCommit = {
  column: string;
  kind: InsertValue["kind"];
  control: string;
  text: string;
  formula: string;
};

function insertCommit(value: InsertValue): InsertCommit {
  return {
    column: value.column,
    kind: value.kind,
    control: value.kind === "control" ? value.control : "",
    text: value.kind === "static" ? value.value : "",
    formula: value.kind === "formula" ? value.formula : "",
  };
}

function insertValueLabel(value: InsertValue): string {
  if (value.kind === "control") return value.control;
  if (value.kind === "static") return value.value;
  return value.formula;
}

async function writeInsertValue(page: Page, dialog: Locator, value: InsertValue): Promise<void> {
  if (await insertValueCommitted(page, value)) return;
  const commit = insertCommit(value);
  let result = await page.evaluate(insertBridge, { op: "commit", commit });
  for (let attempt = 0; result.retry && attempt < 2; attempt++) {
    await page.waitForTimeout(400);
    result = await page.evaluate(insertBridge, { op: "commit", commit });
  }
  if (!result.ok) fail(result.error || insertMiss(value));
  if (value.kind === "formula" && result.retry) {
    await writeRowField(page, columnRow(dialog, value.column), value.formula);
  }
  await page.waitForTimeout(150);
  if (!(await insertValueCommitted(page, value))) fail(insertMiss(value));
}

async function clearUnmappedInsertColumns(page: Page, wanted: string[]): Promise<void> {
  const failed = await page.evaluate(insertBridge, { op: "clear", wanted });
  if (failed) fail(failed);
}

async function blankInsertColumns(page: Page, wanted: string[]): Promise<string[]> {
  return page.evaluate(insertBridge, { op: "blanks", wanted });
}

async function insertValueCommitted(page: Page, value: InsertValue): Promise<boolean> {
  return page.evaluate(insertBridge, { op: "match", commit: insertCommit(value) });
}

function insertBridge(request: any): any {
function commitInsertValue(input: InsertCommit): { ok: boolean; error: string; retry: boolean } {
  const root = insertColumnRoot(input.column);
  if (!root) return { ok: false, error: `Insert row did not target column ${JSON.stringify(input.column)}.`, retry: false };
  if (input.kind === "static") {
    const setter = insertSetter(root);
    if (!setter) return { ok: false, error: `Insert row has no value for ${JSON.stringify(input.column)}.`, retry: false };
    const payload = staticInsertPayload(root, input.text);
    if (!payload) {
      return { ok: false, error: `Insert row cannot store ${JSON.stringify(input.text)} on ${JSON.stringify(input.column)}.`, retry: false };
    }
    setter.memoizedProps.setValue(payload);
    return { ok: true, error: "", retry: false };
  }
  if (input.kind === "control") {
    const picker = insertControlPicker(root);
    if (!picker) {
      const select = insertKindSelect(root);
      if (!select) return { ok: false, error: `Insert row did not offer Control for ${JSON.stringify(input.column)}.`, retry: false };
      setNativeSelect(select, "variable");
      return { ok: false, error: "", retry: true };
    }
    const leaf = findControlLeaf(picker.memoizedProps.pageSummaries, input.control);
    if (!leaf) return { ok: false, error: `Insert row did not offer ${JSON.stringify(input.control)}.`, retry: false };
    picker.memoizedProps.onSelect(leaf.id);
    return { ok: true, error: "", retry: false };
  }
  const select = insertKindSelect(root);
  if (!select) return { ok: false, error: `Insert row did not offer Formula for ${JSON.stringify(input.column)}.`, retry: false };
  if (select.value !== "formula") {
    setNativeSelect(select, "formula");
    return { ok: true, error: "", retry: true };
  }
  return { ok: true, error: "", retry: true };
}

function clearOtherInsertColumns(wanted: string[]): string {
  const keep = new Set(wanted);
  let error = "";
  eachInsertColumn((column, root) => {
    if (keep.has(column)) return;
    const select = insertKindSelect(root);
    if (select && select.value !== "const") setNativeSelect(select, "const");
    const setter = insertSetter(root);
    if (!setter) return;
    try {
      setter.memoizedProps.setValue(emptyInsertPayload(root));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  });
  return error;
}

function blankInsertColumnNames(wanted: string[]): string[] {
  const keep = new Set(wanted);
  const blanks: string[] = [];
  eachInsertColumn((column, root) => {
    if (keep.has(column)) return;
    const setter = insertSetter(root);
    const value = setter?.memoizedProps.value;
    const inner = value?.type === "const" ? value.value : null;
    const type = inner && typeof inner === "object" ? inner.type : "";
    if (typeof type === "string" && type.endsWith("-null")) blanks.push(column);
  });
  return blanks;
}

function insertValueMatches(input: InsertCommit): boolean {
  const root = insertColumnRoot(input.column);
  if (!root) return false;
  const setter = insertSetter(root);
  const value = setter?.memoizedProps.value;
  if (input.kind === "static") {
    const payload = staticInsertPayload(root, input.text);
    return JSON.stringify(value) === JSON.stringify(payload);
  }
  if (input.kind === "control") {
    const picker = insertControlPicker(root);
    if (!picker) return false;
    const leaf = findControlLeaf(picker.memoizedProps.pageSummaries, input.control);
    if (!leaf) return false;
    const selected = picker.memoizedProps.selected;
    if (Array.isArray(selected) && selected.includes(leaf.id)) return true;
    return insertSectionText(input.column).includes(leaf.name);
  }
  return insertSectionText(input.column).includes(input.formula);
}

function insertSectionText(column: string): string {
  const label = [...document.querySelectorAll("*")].find((el) => ownText(el) === column);
  let node = label?.parentElement ?? null;
  let section: Element | null = null;
  while (node) {
    const text = node.textContent || "";
    if (text.includes(column) && text.length < 1500) section = node;
    if (text.length > 1500) break;
    node = node.parentElement;
  }
  return (section?.textContent || "").replace(/\s+/g, " ");
}

function staticInsertPayload(root: InsertFiber, text: string): { type: "const"; value: unknown } | null {
  const typed = columnValueType(root);
  if (typed.startsWith("date")) {
    const epoch = Date.parse(`${text}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(epoch)) return null;
    return { type: "const", value: { type: "date", value: { type: "fixed", date: epoch } } };
  }
  if (typed.startsWith("number")) {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return null;
    return { type: "const", value: { type: "number", value: parsed } };
  }
  if (typed.startsWith("boolean")) {
    if (text !== "true" && text !== "false") return null;
    return { type: "const", value: { type: "boolean", value: text === "true" } };
  }
  return { type: "const", value: { type: "text", value: text } };
}

function emptyInsertPayload(root: InsertFiber): { type: "const"; value: { type: string } } {
  const typed = columnValueType(root);
  const type = typed.endsWith("-null") ? typed : `${typed || "text"}-null`;
  return { type: "const", value: { type } };
}

function columnValueType(root: InsertFiber): string {
  const typed = findInsertFiber(root, (node) => {
    const type = node.memoizedProps?.valueRestrictions?.defaultValue?.type;
    return typeof type === "string";
  });
  return typed?.memoizedProps.valueRestrictions.defaultValue.type || "text-null";
}

type InsertFiber = {
  child: InsertFiber | null;
  sibling: InsertFiber | null;
  return: InsertFiber | null;
  stateNode: unknown;
  memoizedProps: any;
};

function insertColumnRoot(column: string): InsertFiber | null {
  const labels = [...document.querySelectorAll("*")].filter((el) => ownText(el) === column);
  for (const label of labels) {
    let fiber = reactFiber(label);
    for (let i = 0; fiber && i < 50; i++, fiber = fiber.return) {
      if (fiber.memoizedProps?.label === column && insertSetter(fiber)) return fiber;
    }
  }
  return null;
}

function eachInsertColumn(visit: (column: string, root: InsertFiber) => void): void {
  const seen = new Set<string>();
  for (const el of document.querySelectorAll("*")) {
    const text = ownText(el);
    if (!text || seen.has(text) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) continue;
    const root = insertColumnRoot(text);
    if (!root) continue;
    seen.add(text);
    visit(text, root);
  }
}

function insertSetter(root: InsertFiber): InsertFiber | null {
  return findInsertFiber(
    root,
    (node) => typeof node.memoizedProps?.setValue === "function" && typeof node.memoizedProps?.columnId === "string",
  );
}

function insertControlPicker(root: InsertFiber): InsertFiber | null {
  return findInsertFiber(
    root,
    (node) => typeof node.memoizedProps?.onSelect === "function" && Array.isArray(node.memoizedProps?.pageSummaries),
  );
}

function insertKindSelect(root: InsertFiber): HTMLSelectElement | null {
  const column = root.memoizedProps?.label;
  if (typeof column !== "string") return null;
  const label = [...document.querySelectorAll("*")].find((el) => ownText(el) === column);
  let node = label?.parentElement ?? null;
  let section: Element | null = null;
  while (node) {
    const text = node.textContent || "";
    if (text.includes(column) && text.includes("Formula") && text.length < 900) section = node;
    if (text.length > 900) break;
    node = node.parentElement;
  }
  const select = section?.querySelector("select");
  return select instanceof HTMLSelectElement ? select : null;
}

function findControlLeaf(pages: unknown, handle: string): { id: string; name: string } | null {
  const stack = Array.isArray(pages) ? [...pages] : [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const record = node as { id?: unknown; name?: unknown; secondaryName?: unknown; children?: unknown };
    if (record.secondaryName === handle && typeof record.id === "string") {
      return { id: record.id, name: typeof record.name === "string" ? record.name : handle };
    }
    if (Array.isArray(record.children)) stack.push(...record.children);
  }
  return null;
}

function findInsertFiber(root: InsertFiber | null, pred: (node: InsertFiber) => boolean, depth = 0): InsertFiber | null {
  if (!root || depth > 28) return null;
  if (pred(root)) return root;
  let child = root.child;
  while (child) {
    const found = findInsertFiber(child, pred, depth + 1);
    if (found) return found;
    child = child.sibling;
  }
  return null;
}

function setNativeSelect(select: HTMLSelectElement, value: string): void {
  const tracked = select as HTMLSelectElement & { _valueTracker?: { setValue: (next: string) => void } };
  tracked._valueTracker?.setValue(select.value === value ? "" : select.value);
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function reactFiber(el: Element): InsertFiber | null {
  const key = Object.keys(el).find((name) => name.startsWith("__reactFiber"));
  return key ? (el as unknown as Record<string, InsertFiber>)[key] ?? null : null;
}

function ownText(el: Element): string {
  return [...el.childNodes]
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent || "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function stuckInsertColumns(wanted: string[]): string[] {
  const keep = new Set(wanted);
  const stuck: string[] = [];
  eachInsertColumn((column, root) => {
    if (keep.has(column)) return;
    const setter = insertSetter(root);
    const value = setter?.memoizedProps.value;
    const inner = value?.type === "const" ? value.value : null;
    const type = inner && typeof inner === "object" ? inner.type : "";
    if (typeof type === "string" && type.endsWith("-null")) return;
    stuck.push(column);
  });
  return stuck;
}

  if (request.op === "commit" && request.commit) return commitInsertValue(request.commit);
  if (request.op === "match" && request.commit) return insertValueMatches(request.commit);
  if (request.op === "clear") return clearOtherInsertColumns(request.wanted ?? []);
  if (request.op === "stuck") return stuckInsertColumns(request.wanted ?? []);
  return blankInsertColumnNames(request.wanted ?? []);
}

async function writeRowField(page: Page, row: Locator, value: string): Promise<void> {
  const field = row.locator("input, textarea, [contenteditable='true'], .cm-content").last();
  try {
    await field.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    fail(`Insert row has no field for ${JSON.stringify(value)}.`);
  }
  await field.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(value);
  await page.keyboard.press("Tab");
}

async function insertValueShown(dialog: Locator, value: InsertValue): Promise<boolean> {
  if (value.kind === "control") {
    const handle = value.control.replace(/^[cv]\./, "");
    return (await chipShows(dialog, value.control)) || (await chipShows(dialog, handle));
  }
  const wanted = value.kind === "static" ? value.value : value.formula;
  const row = columnRow(dialog, value.column);
  const text = ((await row.innerText()) || "").replace(/\s+/g, " ");
  if (text.includes(wanted)) return true;
  const fields = row.locator("input, textarea");
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const current = await fields.nth(i).inputValue().catch(() => "");
    if (current.includes(wanted)) return true;
  }
  return false;
}

function insertMiss(value: InsertValue): string {
  if (value.kind === "control") return `Insert row did not take its value from ${JSON.stringify(value.control)}.`;
  if (value.kind === "static") return `Insert row did not set ${JSON.stringify(value.column)} to ${JSON.stringify(value.value)}.`;
  return `Insert row did not set ${JSON.stringify(value.column)} from ${JSON.stringify(value.formula)}.`;
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
  const addColumn = page.getByRole("button", { name: /^add column/i });
  const current = new URL(page.url());
  const nodeId = current.searchParams.get(":nodeId") || current.searchParams.get("nodeId") || "";
  if (nodeId !== found.id) {
    current.search = `:${new URLSearchParams({ nodeId: found.id }).toString()}`;
    await page.goto(current.toString(), { waitUntil: "domcontentloaded" });
  }
  await page.locator('[data-testid^="sheet-column-item-"]').first().waitFor({ state: "visible", timeout: 8000 });
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')]
      .map((node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0),
  );
  if (before.length === 0) fail("Column header was not found.");
  if (before.includes(column)) return;
  await addColumn.first().click();
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
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')]
      .map((node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0),
  );
  const created = after.find((label) => !before.includes(label));
  if (!created) fail(`Column ${JSON.stringify(column)} was not added to ${JSON.stringify(title)}.`);
  if (created === column) return;
  await renameColumnItem(page, created, column);
}

async function renameExistingColumn(page: Page, title: string, current: string, wanted: string): Promise<void> {
  const found = await locateTitle(page, title);
  const labels = await headerLabels(page, found.id);
  if (labels.includes(wanted)) return;
  if (!labels.includes(current)) fail(`Column ${JSON.stringify(current)} was not found on ${JSON.stringify(title)}.`);
  await renameColumnItem(page, current, wanted);
}

async function canvasTitleListed(page: Page, title: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    return [...document.querySelectorAll('[data-testid="dynamic-title"]')].some(
      (node) => (node.textContent || "").trim() === wanted,
    );
  }, title);
}

async function titleStillPresent(page: Page, title: string): Promise<boolean> {
  try {
    await locateTitle(page, title);
    return true;
  } catch (error) {
    if (error instanceof Exit && error.message.includes("was not found")) return false;
    throw error;
  }
}

async function leaveTitleEdit(page: Page, id: string, title: string): Promise<void> {
  const editing = await page.evaluate((elementId) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const editable =
      active.getAttribute("contenteditable") !== null || active.tagName === "INPUT" || active.tagName === "TEXTAREA";
    if (!editable) return false;
    const host = active.closest(
      `[data-selectable="${elementId}"], [data-testid="element_${elementId}"], [data-testid="element-${elementId}"]`,
    );
    return host instanceof HTMLElement;
  }, id);
  if (!editing) return;
  await page.keyboard.press("Escape");
  await selectElement(page, id, title);
  await confirmSelected(page, id, title);
}

async function confirmElementDelete(page: Page, title: string): Promise<void> {
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  const started = Date.now();
  while (Date.now() - started < 2500) {
    const count = await dialog.count();
    for (let i = count - 1; i >= 0; i--) {
      const surface = dialog.nth(i);
      if (!(await surface.isVisible().catch(() => false))) continue;
      const text = ((await surface.innerText().catch(() => "")) || "").toLowerCase();
      if (!text.includes("delete")) continue;
      const confirm = surface.getByRole("button", { name: /^(delete( element)?|confirm|yes|remove|ok)$/i });
      if ((await confirm.count()) < 1) continue;
      const button = confirm.first();
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click();
      return;
    }
    if (!(await canvasTitleListed(page, title))) return;
    await page.waitForTimeout(100);
  }
}

async function pressElementDelete(page: Page, title: string, key: "Delete" | "Backspace"): Promise<void> {
  await page.keyboard.press(key);
  await confirmElementDelete(page, title);
  const started = Date.now();
  while (Date.now() - started < 2000) {
    if (!(await canvasTitleListed(page, title))) return;
    await page.waitForTimeout(100);
  }
}

/** Selects the element and deletes it with Delete, then Backspace. Confirms when Sigma asks. */
async function deleteExistingElement(page: Page, title: string): Promise<void> {
  let found: { id: string };
  try {
    found = await locateTitle(page, title);
  } catch (error) {
    if (error instanceof Exit && error.message.includes("was not found")) return;
    throw error;
  }
  const onDialog = (dialog: { accept: () => Promise<void> }) => {
    void dialog.accept();
  };
  page.on("dialog", onDialog);
  try {
    for (const key of ["Delete", "Backspace"] as const) {
      if (!(await titleStillPresent(page, title))) break;
      await selectElement(page, found.id, title);
      await confirmSelected(page, found.id, title);
      await leaveTitleEdit(page, found.id, title);
      await pressElementDelete(page, title, key);
    }
  } finally {
    page.off("dialog", onDialog);
  }
  if (await titleStillPresent(page, title)) fail(`Element ${JSON.stringify(title)} was not deleted.`);
}

async function deleteExistingColumn(page: Page, title: string, column: string): Promise<void> {
  const found = await locateTitle(page, title);
  const labels = await headerLabels(page, found.id);
  if (!labels.includes(column)) return;
  await deleteColumnItem(page, column);
}

async function columnHeaderListed(page: Page, column: string): Promise<boolean> {
  return page.evaluate(
    (name) =>
      [...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].some(
        (node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim() === name,
      ),
    column,
  );
}

async function confirmColumnDelete(page: Page, column: string): Promise<void> {
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  const started = Date.now();
  while (Date.now() - started < 2500) {
    if (!(await columnHeaderListed(page, column))) return;
    const count = await dialog.count();
    for (let i = count - 1; i >= 0; i--) {
      const surface = dialog.nth(i);
      if (!(await surface.isVisible().catch(() => false))) continue;
      const text = ((await surface.innerText().catch(() => "")) || "").toLowerCase();
      if (!text.includes("delete")) continue;
      const confirm = surface.getByRole("button", { name: /^(delete( column)?|confirm|yes|remove|ok)$/i });
      if ((await confirm.count()) < 1) continue;
      const button = confirm.first();
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click();
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function deleteColumnItem(page: Page, column: string): Promise<void> {
  const item = page.locator('[data-testid^="sheet-column-item-"]').filter({
    has: page.getByText(column, { exact: true }),
  }).first();
  await item.click();
  await item.locator('button[aria-label="Column menu"]').click({ force: true });
  const action = page.getByText("Delete column", { exact: true });
  try {
    await action.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    fail(`Column menu did not include "Delete column".`);
  }
  const onDialog = (dialog: { accept: () => Promise<void> }) => {
    void dialog.accept();
  };
  page.on("dialog", onDialog);
  try {
    await action.first().click();
    await confirmColumnDelete(page, column);
  } finally {
    page.off("dialog", onDialog);
  }
  try {
    await page.waitForFunction(
      (name) =>
        ![...document.querySelectorAll('[data-testid^="sheet-column-item-"]')].some(
          (node) => (node.textContent || "").replace(/Column menu/g, "").replace(/\s+/g, " ").trim() === name,
        ),
      column,
      { timeout: 5000 },
    );
  } catch {
    fail(`Column ${JSON.stringify(column)} was not deleted.`);
  }
}

async function renameColumnItem(page: Page, current: string, wanted: string): Promise<void> {
  const item = page.locator('[data-testid^="sheet-column-item-"]').filter({
    has: page.getByText(current, { exact: true }),
  }).first();
  await item.click();
  await item.locator('button[aria-label="Column menu"]').click({ force: true });
  await page.getByText("Rename column", { exact: true }).click();
  await page.waitForFunction(
    (name) => [...document.querySelectorAll("input")].some((el) => el.value === name),
    current,
  );
  await page.evaluate((name) => {
    const input = [...document.querySelectorAll("input")].find((el) => (el as HTMLInputElement).value === name);
    if (!(input instanceof HTMLInputElement)) return;
    input.focus();
    input.select();
  }, current);
  await page.keyboard.insertText(wanted);
  await page.keyboard.press("Enter");
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

async function clickNamedTile(page: Page, label: string): Promise<void> {
  const point = await page.evaluate((wanted) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.textContent || "").trim() !== wanted) continue;
      let el = node.parentElement;
      for (let depth = 0; depth < 4 && el; depth++) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 48 && rect.width <= 96 && rect.height >= 56 && rect.height <= 96) {
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        el = el.parentElement;
      }
    }
    return null;
  }, label);
  if (!point) fail(`Control tile ${JSON.stringify(label)} was not found.`);
  await page.mouse.click(point.x, point.y);
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
  if (!point) {
    await clickNamedTile(page, label);
    return;
  }
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
  await writeCanvasTitle(page, id, title);
}

async function writeCanvasTitle(page: Page, id: string, title: string): Promise<void> {
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
    const seen = await page.evaluate((elementId) => {
      const node = document.querySelector(`[data-testid="element_${elementId}"] [data-testid="dynamic-title"]`);
      return (node?.textContent || "").trim();
    }, id);
    fail(`Title is ${JSON.stringify(seen)}, expected ${JSON.stringify(title)}.`);
  }
}

async function labeledFieldButton(page: Page, label: string) {
  const handle = await page.evaluateHandle((wanted) => {
    const labels = [...document.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return own === wanted;
    });
    for (const marked of labels) {
      const field = marked.closest("[data-phi-field='true']") || marked.parentElement;
      const buttons = [...(field?.querySelectorAll("button") ?? [])].filter((button) => {
        return button instanceof HTMLElement && button.getBoundingClientRect().width >= 80;
      });
      if (buttons[0] instanceof HTMLElement) return buttons[0];
    }
    return null;
  }, label);
  return handle.asElement();
}

async function chooseNamedValue(page: Page, label: string, value: string): Promise<void> {
  const pattern = new RegExp(label, "i");
  const box = page.getByRole("combobox", { name: pattern });
  const button = page.getByRole("button", { name: pattern });
  const named = (await box.count()) > 0 ? box.first() : (await button.count()) > 0 ? button.first() : null;
  const control = named ?? (await labeledFieldButton(page, label));
  if (!control) fail(`${label} was not found.`);
  const current = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
  if (current === value) return;
  const opener = await control.boundingBox();
  if (!opener) fail(`${label} was not found.`);
  await page.mouse.click(opener.x + opener.width / 2, opener.y + opener.height / 2);
  const dialog = page.getByRole("dialog").last();
  const search = dialog.locator("input").first();
  const searchable = await search
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (searchable) {
    await search.fill(value);
    const row = dialog.getByText(value, { exact: true }).last();
    try {
      await row.waitFor({ state: "visible", timeout: 5000 });
    } catch {
      fail(`${label} did not offer ${JSON.stringify(value)}.`);
    }
    const box = await row.boundingBox();
    if (!box) fail(`${label} did not offer ${JSON.stringify(value)}.`);
    await page.mouse.click(box.x + Math.min(12, box.width / 2), box.y + box.height / 2);
  } else {
    const option = page.getByRole("option", { name: value, exact: true });
    try {
      await option.first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      fail(`${label} did not offer ${JSON.stringify(value)}.`);
    }
    await option.first().click();
  }
  try {
    await page.waitForFunction(
      ({ wanted, fieldLabel }) => {
        const ownText = (el: Element) =>
          [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join("")
            .replace(/\s+/g, " ")
            .trim();
        const labels = [...document.querySelectorAll("*")].filter((el) => ownText(el) === fieldLabel);
        for (const marked of labels) {
          const field = marked.closest("[data-phi-field='true']") || marked.parentElement;
          const button = field?.querySelector("button, [role='combobox']");
          const text = (button?.textContent || "").replace(/\s+/g, " ").trim();
          if (text === wanted) return true;
        }
        return false;
      },
      { wanted: value, fieldLabel: label },
      { timeout: 3000 },
    );
  } catch {
    const after = ((await control.innerText()) || "").replace(/\s+/g, " ").trim();
    if (after !== value) fail(`${label} is ${JSON.stringify(after)}, wanted ${JSON.stringify(value)}.`);
  }
}

async function setPhiCheck(page: Page, label: string, wantOn: boolean): Promise<void> {
  const found = await page.evaluate((wanted) => {
    const visible = (el: Element) => {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    document.querySelectorAll("[data-phi-target]").forEach((el) => el.removeAttribute("data-phi-target"));
    const labels = [...document.querySelectorAll("[data-phi-label='true']")].filter((node) => {
      return (node.textContent || "").replace(/\s+/g, " ").trim() === wanted && visible(node);
    });
    const inputs: HTMLInputElement[] = [];
    for (const marked of labels) {
      if (!(marked instanceof HTMLElement) || marked.id.length === 0) continue;
      const owner = [...document.querySelectorAll("[aria-labelledby]")].find((node) =>
        (node.getAttribute("aria-labelledby") || "").split(/\s+/).includes(marked.id),
      );
      const input = owner?.querySelector("input[type='checkbox']");
      if (input instanceof HTMLInputElement && visible(input)) inputs.push(input);
    }
    if (inputs.length !== 1) return inputs.length;
    inputs[0]?.setAttribute("data-phi-target", "1");
    return 1;
  }, label);
  if (found === 0) fail(`${label} checkbox was not found.`);
  if (found !== 1) fail(`${label} matches ${found} checkboxes.`);
  const element = page.locator("[data-phi-target='1']").first();
  const checked = await element.evaluate((node) => node instanceof HTMLInputElement && node.checked);
  if (checked === wantOn) return;
  const tick = await element.boundingBox();
  if (!tick || tick.width <= 0 || tick.height <= 0) fail(`${label} checkbox was not found.`);
  await page.mouse.click(tick.x + tick.width / 2, tick.y + tick.height / 2);
  const after = await element.evaluate((node) => node instanceof HTMLInputElement && node.checked);
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

/** Properties → Value source and Source column. Does not write the control id or the canvas title. */
async function applyListValueSource(page: Page, id: string, source: string, column: string): Promise<void> {
  const host = page.locator(`[data-testid="element_${id}"]`).first();
  await host.click({ force: true });
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  if ((await properties.count()) < 1) fail("Properties tab was not found.");
  await properties.first().click();
  await chooseNamedValue(page, "Value source", source);
  await chooseNamedValue(page, "Source column", column);
}

/** Reads the control id. Does not fill the field or press Enter. */
async function readControlId(page: Page, elementId: string): Promise<string> {
  const host = page.locator(`[data-selectable="${elementId}"], [data-testid="element_${elementId}"]`).first();
  if ((await host.count()) < 1) return "";
  try {
    await host.click({ force: true, timeout: 2000 });
  } catch {
    return "";
  }
  const settings = page.getByRole("tab", { name: "Settings", exact: true });
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  if ((await settings.count()) > 0) await settings.first().click();
  else if ((await properties.count()) > 0) await properties.first().click();
  else return "";
  const named = page.getByRole("textbox", { name: /control id/i });
  const placeholder = page.locator('input[placeholder="control-id"], input[placeholder="Control ID"]');
  const field = (await named.count()) > 0 ? named.first() : (await placeholder.count()) > 0 ? placeholder.first() : null;
  if (!field) return "";
  if (!(await field.isVisible().catch(() => false))) return "";
  return (await field.inputValue().catch(() => "")).trim();
}

/** Fallback lookup. Returns the element id whose control id already equals `controlId`. */
async function findByControlId(page: Page, controlId: string): Promise<string | null> {
  const ids = [...new Set(await selectableIds(page))];
  const matches: string[] = [];
  for (const id of ids) {
    const value = await readControlId(page, id);
    if (value === controlId) matches.push(id);
  }
  if (matches.length > 1) {
    fail(`Control id ${JSON.stringify(controlId)} matches ${matches.length} controls. Nothing was changed.`);
  }
  return matches[0] ?? null;
}

/** Updates Value source and Source column on a control that already exists. */
async function setExistingListSource(page: Page, title: string, source: string, column: string): Promise<void> {
  let canvasId: string | null = null;
  try {
    canvasId = (await locateTitle(page, title)).id;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  const controlId = canvasId ? null : await findByControlId(page, title);
  const id = resolveListControl(canvasId, controlId, title);
  await applyListValueSource(page, id, source, column);
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
  let id: string | null = null;
  try {
    id = (await locateTitle(page, title)).id;
  } catch (error) {
    if (!(error instanceof Exit) || !error.message.includes("was not found")) throw error;
  }
  if (!id) {
    const before = new Set(await selectableIds(page));
    await clickExactButton(page, "Controls");
    await page.waitForTimeout(300);
    await clickControlTile(page, "List values");
    id = await createdId(page, before);
  }
  await applyListValueSource(page, id, source, column);
  await setControlId(page, id, title);
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  await properties.first().click();
  await setPhiCheck(page, "Allow multiple selection", multiple === "on");
  await setPhiCheck(page, "Show null option", nullOption === "on");
  await setPhiCheck(page, "Show clear button", clear === "on");
  await setPhiCheck(page, "Show search box", search === "on");
  await writeCanvasTitle(page, id, title);
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
  const labeled = dialog.getByText(/\(Data\)$/).first();
  if ((await labeled.count()) > 0) return ((await labeled.innerText()) || "").trim();
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
  const current = dialog.getByText(/\(Data\)$/).first();
  if ((await current.count()) > 0) {
    await current.click();
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
  if (first === table || value === table || first.startsWith(`${table} (`)) return true;
  if (!sheet) return false;
  return first === sheet || value === sheet || first.startsWith(`${sheet} (`);
}

async function selectIntoTable(page: Page, dialog: Locator, table: string, elementId: string): Promise<void> {
  const sheet = await sheetLabel(page, elementId);
  if (sameTableLabel(await intoFieldText(dialog), table, sheet)) return;
  await openIntoList(dialog);
  const plain = page.getByText(table, { exact: true });
  if ((await plain.count()) > 0) {
    await plain.last().click();
    const shown = await intoFieldText(dialog);
    if (sameTableLabel(shown, table, sheet) || shown.startsWith(table)) return;
  }
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
