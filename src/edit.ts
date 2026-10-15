import type { Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { Exit, fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import {
  confirmSelected,
  ensureEditor,
  applySize,
  elementHosts,
  parseArea,
  parseSize,
  placeArea,
  readGridArea,
  readModel,
  selectElement,
  type ComponentInfo,
  type GridArea,
} from "./place.js";
import { workbookIdentity } from "./sigma-api.js";
import { controlFor, parseSettings, validateSettings, type Setting } from "./settings.js";

type Flags = {
  url?: string;
  page?: string;
  title?: string;
  area?: string;
  size?: string;
  type?: string;
  set: string[];
};

type ThemeChip = {
  bg: string;
  x: number;
  y: number;
};

function parseFlags(args: string[], allowed: string[]): Flags {
  const flags: Flags = { set: [] };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag?.startsWith("--")) fail(`Unknown argument: ${flag}`);
    const name = flag.slice(2);
    if (!allowed.includes(name)) fail(`Unknown argument: ${flag}`);
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    if (name === "set") flags.set.push(value);
    else if (name === "url" || name === "page" || name === "title" || name === "area" || name === "size" || name === "type") {
      if (flags[name]) fail(`Duplicate ${flag}`);
      flags[name] = value;
    }
    i++;
  }
  return flags;
}

function requireUrl(flags: Flags, command: string): string {
  if (!flags.url) fail(`${command} requires --url`);
  return flags.url;
}

async function identityFor(page: Page, url: string, requestedPage: string | undefined): Promise<Omit<OwnedWorkbook, "markedAt">> {
  await ensureEditor(page, url, requestedPage);
  const segment = pathSegmentFromUrl(page.url());
  return { ...workbookIdentity(segment), pathSegment: segment };
}

function titlesOn(components: ComponentInfo[]): string {
  return components.map((component) => component.label).join(", ") || "(none)";
}

export async function locateTitle(page: Page, title: string): Promise<ComponentInfo> {
  const components = (await readModel(page)).groups.flatMap((group) => group.components);
  const matches = components.filter((component) => component.label === title);
  if (matches.length > 1) {
    fail(`Title ${JSON.stringify(title)} matches ${matches.length} components. Nothing was changed.`);
  }
  if (matches.length === 1) return matches[0];

  const byText = await page.evaluate((wanted) => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    const pageId = (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
    const root = pageId ? document.querySelector(`[data-layout-id="layout-body-${pageId}"]`) : document.body;
    if (!root) return [];
    const ids: string[] = [];
    for (const node of root.querySelectorAll("[data-selectable], [data-testid^='element_']")) {
      const selectable = node.getAttribute("data-selectable") || "";
      const testId = node.getAttribute("data-testid") || "";
      const id = selectable || (testId.startsWith("element_") ? testId.slice("element_".length) : "");
      if (!id || ids.includes(id)) continue;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text === wanted) ids.push(id);
    }
    return ids;
  }, title);
  if (byText.length === 1) {
    const found = components.find((component) => component.id === byText[0]);
    if (found) return found;
    return {
      id: byText[0],
      label: title,
      layoutId: "",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }
  fail(
    `Title ${JSON.stringify(title)} was not found. Nothing was changed.\nTitles on this page: ${titlesOn(components)}`,
  );
}

export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export type PaddingCandidate = { kind: "label" | "input"; text: string; row: number };

export function paddingInput(candidates: readonly PaddingCandidate[]): number | null {
  const row = candidates.find((item) => item.kind === "label" && item.text === "Padding")?.row;
  if (row === undefined) return null;
  const index = candidates.findIndex((item) => item.kind === "input" && item.text === "Select" && item.row === row);
  return index < 0 ? null : index;
}

export function paddingOn(style: string, computedPx: string): boolean {
  return computedPx === "16px" || style.includes("calc(2 * var(--space-unit))");
}

export function paddingBoxes(hosts: readonly string[]): string[] {
  return hosts.map((host) => `${host} [data-testid="text-element-box"]`);
}

export function textColorLanded(html: string, selection: string): boolean {
  const mark = /<fontcolor\b[^>]*style="[^"]*color:\s*rgb\(255,\s*255,\s*255\)/i.test(html);
  return mark && selection.length > 0;
}

async function selectableIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selected =
      document.querySelector('[data-testid^="page-item-"][data-selected="true"]') ??
      document.querySelector('[data-testid^="page-item-"][aria-selected="true"]');
    const pageId = (selected?.getAttribute("data-testid") || "").replace(/^page-item-/, "");
    const root = pageId ? document.querySelector(`[data-layout-id="layout-body-${pageId}"]`) : document.body;
    if (!root) return [];
    const ids: string[] = [];
    for (const node of root.querySelectorAll("[data-selectable]")) {
      const id = node.getAttribute("data-selectable");
      if (id) ids.push(id);
    }
    return ids;
  }).then(uniqueIds);
}

async function controlNames(page: Page): Promise<string> {
  const lines = await page.evaluate(() => {
    function names(selector: string): string[] {
      return [...document.querySelectorAll(selector)]
        .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0)
        .slice(0, 40);
    }
    return [
      `buttons: ${names("button").join(" | ") || "(none)"}`,
      `menuitems: ${names('[role="menuitem"]').join(" | ") || "(none)"}`,
      `tabs: ${names('[role="tab"]').join(" | ") || "(none)"}`,
      `checkboxes: ${names('input[type="checkbox"], [role="checkbox"], [role="switch"]').join(" | ") || "(none)"}`,
    ];
  });
  return lines.join("\n");
}

async function detectType(page: Page, id: string): Promise<string> {
  return page.evaluate((selectors) => {
    const hosts = selectors
      .map((selector) => document.querySelector(selector))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (hosts.length === 0) return "";
    if (hosts.some((host) => host.querySelector('[role="grid"], [role="table"], [role="columnheader"]'))) return "table";
    if (hosts.some((host) => host.querySelector("[contenteditable='true'], [contenteditable=''], [data-testid='text-element-box']"))) {
      return "text";
    }
    return "";
  }, elementHosts(id));
}

function markOnFirstChange(identity: Omit<OwnedWorkbook, "markedAt">): { edited: () => boolean; touch: () => void } {
  let edited = false;
  return {
    edited: () => edited,
    touch: () => {
      if (edited) return;
      edited = true;
      markOwned(identity);
    },
  };
}

export async function runSelect(args: string[]): Promise<void> {
  const flags = parseFlags(args, ["url", "page", "title"]);
  const url = requireUrl(flags, "select");
  if (!flags.title) fail("select requires --title");
  const title = flags.title;

  await withChrome(url, async (page) => {
    await ensureEditor(page, url, flags.page);
    const component = await locateTitle(page, title);
    await selectElement(page, component.id, title);
    await confirmSelected(page, component.id, title);
    console.log(component.id);
  });
}

export async function runSize(args: string[]): Promise<void> {
  const flags = parseFlags(args, ["url", "page", "title", "area", "size"]);
  const url = requireUrl(flags, "size");
  if (!flags.title) fail("size requires --title");
  if (flags.area && flags.size) fail("size takes --area or --size, not both");
  if (!flags.area && !flags.size) fail("size requires --area or --size");
  const title = flags.title;
  let fixed: GridArea | undefined;
  let elementSize: ReturnType<typeof parseSize> | undefined;
  try {
    if (flags.area) fixed = parseArea(flags.area);
    if (flags.size) elementSize = parseSize(flags.size);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  await withChrome(url, async (page) => {
    const identity = await identityFor(page, url, flags.page);
    const component = await locateTitle(page, title);
    const area = elementSize ? applySize(await readGridArea(page, component.id), elementSize) : fixed!;
    const change = markOnFirstChange(identity);
    try {
      await placeArea(page, component.id, area, change.touch, title);
    } catch (error) {
      if (change.edited()) markOwned(identity);
      throw error;
    }
    console.log(page.url());
    console.log(component.id);
  });
}

async function openFormat(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: /^format$/i });
  if ((await tab.count()) === 1) {
    await tab.click();
    return;
  }
  const button = page.getByRole("button", { name: /^format$/i });
  if ((await button.count()) === 1) await button.click();
}

async function applyContent(page: Page, id: string, text: string, touch: () => void, label: string): Promise<void> {
  const read = () =>
    page.evaluate((selectors) => {
      const host = selectors.map((selector) => document.querySelector(selector)).find((node) => node);
      const editable = host?.querySelector("[contenteditable='true'], [contenteditable='']");
      const source = editable ?? host;
      return (source?.textContent || "").replace(/\s+/g, " ").trim();
    }, elementHosts(id));

  if ((await read()) === text) return;
  const point = await page.evaluate((selectors) => {
    const host = selectors.map((selector) => document.querySelector(selector)).find((node) => node);
    const editable = host?.querySelector("[contenteditable='true'], [contenteditable='']");
    const target = editable ?? host;
    if (!(target instanceof HTMLElement)) return null;
    const rect = target.getBoundingClientRect();
    return { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + Math.min(12, rect.height / 2) };
  }, elementHosts(id));
  if (!point) fail(`${label}: text field was not found`);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(text);
  touch();
  await page.waitForTimeout(400);
  const after = await read();
  if (after !== text) {
    fail(`${label}: content is ${JSON.stringify(after)}, wanted ${JSON.stringify(text)}`);
  }
}

async function applyFill(page: Page, value: string, touch: () => void): Promise<void> {
  const swatchName = value.slice("theme:".length);
  await openFormat(page);
  const background = page.getByRole("button", { name: /background/i });
  const count = await background.count();
  if (count === 0) {
    fail(`Background fill control was not found.\n${await controlNames(page)}`);
  }
  const labels = await background.evaluateAll((nodes) =>
    nodes.map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim()),
  );
  let index = labels.findIndex((label) => /^background( color)?$/i.test(label));
  if (index < 0) {
    const loose = labels
      .map((label, labelIndex) => ({ label, labelIndex }))
      .filter((item) => /background/i.test(item.label) && !/border/i.test(item.label));
    if (loose.length !== 1) {
      fail(`Background fill control was ambiguous.\n${labels.filter(Boolean).join(" | ") || (await controlNames(page))}`);
    }
    index = loose[0]?.labelIndex ?? -1;
  }
  if (index < 0) fail(`Background fill control was not found.\n${await controlNames(page)}`);
  await background.nth(index).click();
  await page.waitForTimeout(300);
  const wanted = swatchName.toLowerCase();
  const named = page.getByRole("button", { name: new RegExp(`^${wanted}$`, "i") });
  if (wanted !== "blue" && (await named.count()) === 1) {
    await named.click();
    touch();
    console.log(`fill ${value} -> ${swatchName}`);
    await page.keyboard.press("Escape");
    return;
  }
  const chip = await page.evaluate((colorName): ThemeChip | { error: string } => {
    function hueOf(rgb: string): { h: number; s: number } | null {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const r = Number(match[1]) / 255;
      const g = Number(match[2]) / 255;
      const b = Number(match[3]) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (delta === 0) return { h: 0, s: 0 };
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
      return { h: hue, s: max === 0 ? 0 : delta / max };
    }
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) =>
      (node.textContent || "").toUpperCase().includes("THEME PALETTE"),
    );
    if (!dialog) return { error: "Theme palette was not open" };
    const chips = [...dialog.querySelectorAll("div")].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 16 || rect.width > 28 || rect.height < 16 || rect.height > 28) return false;
      const bg = getComputedStyle(node).backgroundColor;
      return bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)";
    });
    const rows = new Map<number, HTMLElement[]>();
    for (const node of chips) {
      if (!(node instanceof HTMLElement)) continue;
      const y = Math.round(node.getBoundingClientRect().y);
      const key = [...rows.keys()].find((row) => Math.abs(row - y) < 4) ?? y;
      const list = rows.get(key) ?? [];
      list.push(node);
      rows.set(key, list);
    }
    const themeRow = [...rows.entries()].sort((left, right) => left[0] - right[0])[0]?.[1] ?? [];
    const described = themeRow.map((node) => {
      const bg = getComputedStyle(node).backgroundColor;
      const rect = node.getBoundingClientRect();
      return { bg, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, hs: hueOf(bg) };
    });
    const colors = described.map((item) => item.bg).join(", ") || "(none)";
    if (colorName !== "blue") return { error: `Theme palette has no label for ${colorName}. Colors: ${colors}` };
    const blues = described.filter((item) => item.hs && item.hs.h > 190 && item.hs.h < 250 && item.hs.s > 0.4);
    if (blues.length !== 1 || !blues[0]) {
      return { error: `Theme palette blue was not a single swatch. Colors: ${colors}` };
    }
    return { bg: blues[0].bg, x: blues[0].x, y: blues[0].y };
  }, wanted);
  if ("error" in chip) fail(chip.error);
  await page.mouse.click(chip.x, chip.y);
  touch();
  console.log(`fill ${value} -> ${chip.bg}`);
  await page.keyboard.press("Escape");
}

async function selectTileText(page: Page, id: string): Promise<string> {
  const selection = await page.evaluate((selectors) => {
    const host = selectors.map((selector) => document.querySelector(selector)).find((node) => node);
    const editable = host?.querySelector("[contenteditable='true'], [contenteditable='']");
    const target = editable ?? host?.querySelector('[data-testid="text-element-box"]') ?? host;
    if (!(target instanceof HTMLElement)) return "";
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    if (!selected) return "";
    selected.removeAllRanges();
    selected.addRange(range);
    return selected.toString();
  }, elementHosts(id));
  if (!selection) fail(`${id}: text contents were not selected`);
  return selection;
}

async function applyColor(page: Page, id: string, type: string, value: string, touch: () => void): Promise<void> {
  if (controlFor(type, "color") !== "text-toolbar") {
    fail(`color for ${type} does not use the text toolbar`);
  }
  const selection = await selectTileText(page, id);
  const buttons = page.getByRole("button", { name: /^text color$/i });
  const count = await buttons.count();
  if (count === 0) {
    fail(`Text color control was not found.\n${await controlNames(page)}`);
  }
  const index = await buttons.evaluateAll((nodes) => {
    const bold = [...document.querySelectorAll("button")].find(
      (node) => (node.getAttribute("aria-label") || "").toLowerCase() === "bold",
    );
    const boldBox = bold?.getBoundingClientRect();
    const ranked = nodes.map((node, nodeIndex) => {
      const box = node.getBoundingClientRect();
      const nearBold = boldBox ? Math.abs(box.top - boldBox.top) + Math.abs(box.left - boldBox.right) : box.top;
      return { nodeIndex, nearBold };
    });
    ranked.sort((left, right) => left.nearBold - right.nearBold);
    return ranked[0]?.nodeIndex ?? 0;
  });
  await buttons.nth(index).click();
  await page.waitForTimeout(300);
  const chip = await page.evaluate((): ThemeChip | { error: string } => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) =>
      /color/i.test(node.getAttribute("aria-label") || node.textContent || ""),
    );
    const root = dialog ?? document.body;
    const chips = [...root.querySelectorAll("div")].flatMap((node) => {
      if (!(node instanceof HTMLElement)) return [];
      const rect = node.getBoundingClientRect();
      if (rect.width < 16 || rect.width > 28 || rect.height < 16 || rect.height > 28) return [];
      const bg = getComputedStyle(node).backgroundColor;
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return [];
      const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
      const white = channels.every((channel) => channel >= 250);
      if (!white) return [];
      return [{ bg, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }];
    });
    if (chips.length === 0) return { error: "White swatch was not in the text color palette" };
    chips.sort((left, right) => left.y - right.y || left.x - right.x);
    return chips[0];
  });
  if ("error" in chip || !chip) fail("error" in chip ? chip.error : "White swatch was not in the text color palette");
  await page.mouse.click(chip.x, chip.y);
  touch();
  console.log(`color ${value} -> ${chip.bg}`);
  await page.keyboard.press("Escape");
  if (value !== "white") return;
  const html = await page.evaluate((selectors) => {
    const host = selectors.map((selector) => document.querySelector(selector)).find((node) => node);
    return host?.innerHTML || "";
  }, elementHosts(id));
  if (!textColorLanded(html, selection)) {
    fail("Text color did not land. Expected <fontcolor style=\"color: rgb(255, 255, 255);\"> on the selected text.");
  }
}

async function paddingCandidates(page: Page): Promise<PaddingCandidate[]> {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]') ?? document.body;
    const rows = new Map<Element, number>();
    function rowOf(node: Element): number {
      let current: Element | null = node;
      for (let depth = 0; depth < 8 && current; depth += 1) {
        const leaves = [...current.querySelectorAll("*")].filter((child) => child.childElementCount === 0);
        const hasLabel = leaves.some((child) => (child.textContent || "").replace(/\s+/g, " ").trim() === "Padding");
        const hasInput = current.querySelector('input, [role="checkbox"]') !== null;
        if (hasLabel && hasInput) {
          const known = rows.get(current);
          if (known !== undefined) return known;
          const id = rows.size;
          rows.set(current, id);
          return id;
        }
        current = current.parentElement;
      }
      return -1;
    }
    const found: { kind: "label" | "input"; text: string; row: number }[] = [];
    for (const node of panel.querySelectorAll("*")) {
      if (node.childElementCount !== 0) continue;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text !== "Padding") continue;
      const row = rowOf(node);
      if (row >= 0) found.push({ kind: "label", text, row });
    }
    for (const node of panel.querySelectorAll('input, [role="checkbox"]')) {
      const row = rowOf(node);
      if (row < 0) continue;
      found.push({ kind: "input", text: node.getAttribute("aria-label") || "", row });
    }
    return found;
  });
}

async function applyPadding(page: Page, id: string, value: string, touch: () => void): Promise<void> {
  const wantOn = value === "on";
  await openFormat(page);
  const candidates = await paddingCandidates(page);
  const index = paddingInput(candidates);
  const picked = index === null ? null : candidates[index];
  if (!picked) fail(`Padding control was not found.\n${await controlNames(page)}`);
  const clicked = await page.evaluate(({ row, wantOn: turnOn }) => {
    const panel = document.querySelector('[role="tabpanel"]') ?? document.body;
    const rows = new Map<Element, number>();
    function rowOf(node: Element): number {
      let current: Element | null = node;
      for (let depth = 0; depth < 8 && current; depth += 1) {
        const leaves = [...current.querySelectorAll("*")].filter((child) => child.childElementCount === 0);
        const hasLabel = leaves.some((child) => (child.textContent || "").replace(/\s+/g, " ").trim() === "Padding");
        const hasInput = current.querySelector('input, [role="checkbox"]') !== null;
        if (hasLabel && hasInput) {
          const known = rows.get(current);
          if (known !== undefined) return known;
          const id = rows.size;
          rows.set(current, id);
          return id;
        }
        current = current.parentElement;
      }
      return -1;
    }
    const input = [...panel.querySelectorAll('input, [role="checkbox"]')].find((node) => {
      return rowOf(node) === row && (node.getAttribute("aria-label") || "") === "Select";
    });
    if (!(input instanceof HTMLElement)) return { error: "Padding checkbox was not found" };
    const on = input.getAttribute("aria-checked") === "true" || (input instanceof HTMLInputElement && input.checked);
    if (on === turnOn) return { already: true };
    input.click();
    return { clicked: true };
  }, { row: picked.row, wantOn });
  if ("error" in clicked && clicked.error) fail(clicked.error);
  if ("clicked" in clicked && clicked.clicked) touch();
  if (!wantOn) return;
  const mark = await page
    .waitForFunction((selectors) => {
      for (const selector of selectors) {
        const box = document.querySelector(selector);
        if (!(box instanceof HTMLElement)) continue;
        const style = `${box.getAttribute("style") || ""} ${getComputedStyle(box).padding}`;
        const computedPx = getComputedStyle(box).paddingTop;
        if (computedPx === "16px" || style.includes("calc(2 * var(--space-unit))")) {
          return { style, computedPx };
        }
      }
      return null;
    }, paddingBoxes(elementHosts(id)), { timeout: 3000 })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  if (!mark || !paddingOn(mark.style, mark.computedPx)) {
    fail("Padding did not turn on. Expected 16px, calc(2 * var(--space-unit)), on text-element-box.");
  }
}

async function applySetting(
  page: Page,
  id: string,
  type: string,
  setting: Setting,
  touch: () => void,
  label: string,
): Promise<void> {
  if (setting.key === "content") {
    await applyContent(page, id, setting.value, touch, label);
    return;
  }
  if (setting.key === "fill") {
    await applyFill(page, setting.value, touch);
    return;
  }
  if (setting.key === "padding") {
    await applyPadding(page, id, setting.value, touch);
    return;
  }
  if (setting.key === "color") {
    await applyColor(page, id, type, setting.value, touch);
    return;
  }
  fail(`Unknown setting ${setting.key}`);
}

export async function runSet(args: string[]): Promise<void> {
  const flags = parseFlags(args, ["url", "page", "title", "set"]);
  const url = requireUrl(flags, "set");
  if (!flags.title) fail("set requires --title");
  if (flags.set.length === 0) fail("set requires --set");
  const title = flags.title;
  let settings: Setting[];
  try {
    settings = parseSettings(flags.set);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  await withChrome(url, async (page) => {
    const identity = await identityFor(page, url, flags.page);
    const component = await locateTitle(page, title);
    const type = await detectType(page, component.id);
    if (!type) {
      fail(`Could not tell the element type for ${title}. Known types: text`);
    }
    try {
      validateSettings(type, settings);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    const change = markOnFirstChange(identity);
    try {
      await selectElement(page, component.id, title);
      await confirmSelected(page, component.id, title);
      for (const setting of settings) {
        await applySetting(page, component.id, type, setting, change.touch, title);
      }
    } catch (error) {
      if (change.edited()) markOwned(identity);
      if (error instanceof Exit) throw error;
      fail(error instanceof Error ? error.message : String(error));
    }
    console.log(component.id);
  });
}

async function clickAddElement(page: Page): Promise<void> {
  const add = page.getByRole("button", { name: /^add element\b/i });
  if ((await add.count()) === 1) {
    await add.click();
    return;
  }
  const ui = page.getByRole("button", { name: /^ui$/i });
  if ((await ui.count()) === 1) {
    await ui.click();
    return;
  }
  fail(`Add element control was not found.\n${await controlNames(page)}`);
}

async function clickTextType(page: Page): Promise<void> {
  const named = [
    page.getByRole("menuitem", { name: /^text$/i }),
    page.getByRole("option", { name: /^text$/i }),
    page.getByRole("button", { name: /^text$/i }),
  ];
  for (const locator of named) {
    if ((await locator.count()) === 1) {
      await locator.click();
      return;
    }
  }
  fail(`Text element type was not found.\n${await controlNames(page)}`);
}

export async function runAdd(args: string[]): Promise<void> {
  const flags = parseFlags(args, ["url", "page", "type", "title"]);
  const url = requireUrl(flags, "add");
  if (!flags.type) fail("add requires --type");
  if (flags.type !== "text") fail(`Unknown element type ${flags.type}. Known types: text`);

  await withChrome(url, async (page) => {
    const identity = await identityFor(page, url, flags.page);
    const before = new Set(await selectableIds(page));
    await clickAddElement(page);
    await page.waitForTimeout(300);
    await clickTextType(page);
    await page.waitForTimeout(600);
    const created = (await selectableIds(page)).filter((id) => !before.has(id));
    const id = await page.evaluate((ids) => {
      const textLike = ids.filter((elementId) => {
        const host = document.querySelector(`[data-selectable="${elementId}"]`);
        return !!host?.querySelector("[contenteditable='true'], [contenteditable='']");
      });
      if (textLike.length === 1) return textLike[0];
      return ids.length === 1 ? ids[0] : "";
    }, created);
    if (!id) {
      fail(`Expected one new text element, found ${created.length}: ${created.join(", ") || "(none)"}`);
    }
    markOwned(identity);
    if (flags.title) {
      const change = markOnFirstChange(identity);
      change.touch();
      try {
        await selectElement(page, id, flags.title);
        await confirmSelected(page, id, flags.title);
        await applyContent(page, id, flags.title, change.touch, flags.title);
      } catch (error) {
        markOwned(identity);
        if (error instanceof Exit) throw error;
        fail(error instanceof Error ? error.message : String(error));
      }
    }
    console.log(page.url());
    console.log(id);
  });
}
