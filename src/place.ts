import type { Page } from "playwright";
import { pathSegmentFromUrl, toEditUrl, withChrome } from "./chrome.js";
import { Exit, fail } from "./errors.js";
import { markOwned } from "./ledger.js";
import { findWorkbook } from "./sigma-api.js";

/**
 * Sigma editor (edit mode):
 * - Page tab: [data-testid="page-item-<id>"]
 * - Page grid: [data-layout-id="layout-body-<pageId>"]
 * - Grid item: [data-testid="element_<id>"] carries inline grid-area
 * - Select: click [data-testid="element-<id>"] or its [data-testid="dynamic-title"]
 * - Resize: [data-testid="resizer_top|bottom|left|right"] inside
 *   [data-testid="selection_resizers_container_<id>"]
 *
 * The drag handle does not change grid-area. Each edge is a short resizer drag.
 */

const NUDGE_PX = 72;
const CORRECT_PX = 36;
const MAX_DRAG_PX = 96;
const MAX_ATTEMPTS = 40;
const SETTLE_MS = 600;

export type EdgeName = "rowStart" | "rowEnd" | "colStart" | "colEnd";

export type GridArea = {
  rowStart: number;
  colStart: number;
  rowEnd: number;
  colEnd: number;
};

export type LayoutEntry = {
  title: string;
  area: GridArea;
};

type Box = { x: number; y: number; width: number; height: number };

export type ComponentInfo = {
  id: string;
  label: string;
  layoutId: string;
} & Box;

export type Group = {
  layoutId: string;
  layout: Box;
  components: ComponentInfo[];
};

export type PageModel = {
  pages: { id: string; name: string; selected: boolean }[];
  groups: Group[];
  signedOut: boolean;
};

type GestureResult = { ok: true } | { ok: false; reason: string };

type DragArgs = {
  id: string;
  resizer: string;
  deltaX: number;
  deltaY: number;
  maxDelta: number;
};

const RESIZER: Record<EdgeName, string> = {
  rowStart: "resizer_top",
  rowEnd: "resizer_bottom",
  colStart: "resizer_left",
  colEnd: "resizer_right",
};

export function formatGridArea(area: GridArea): string {
  return `${area.rowStart} / ${area.colStart} / ${area.rowEnd} / ${area.colEnd}`;
}

export function parseGridArea(value: string): GridArea {
  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length !== 4) throw new Error(`Bad grid-area: ${value}`);
  const nums = parts.map((part) => {
    if (!/^-?\d+$/.test(part)) throw new Error(`Bad grid-area: ${value}`);
    return Number(part);
  });
  return { rowStart: nums[0], colStart: nums[1], rowEnd: nums[2], colEnd: nums[3] };
}

export function parseArea(spec: string): GridArea {
  const match = spec.match(/^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)\s*-\s*(\d+)$/);
  if (!match) throw new Error(`Bad span ${spec}; expected rowStart-rowEnd:colStart-colEnd`);
  const rowStart = Number(match[1]);
  const rowEnd = Number(match[2]);
  const colStart = Number(match[3]);
  const colEnd = Number(match[4]);
  if (rowStart >= rowEnd || colStart >= colEnd) {
    throw new Error(`Span start must be less than end: ${spec}`);
  }
  return { rowStart, colStart, rowEnd, colEnd };
}

/** Split on commas, then on the last `=`. Ends are exclusive. */
export function parseLayout(raw: string): LayoutEntry[] {
  if (raw.trim().length === 0) throw new Error("--layout is empty");
  const entries: LayoutEntry[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error("Empty title in --layout");
    const eq = trimmed.lastIndexOf("=");
    if (eq < 0) throw new Error(`Layout entry needs Title=rowStart-rowEnd:colStart-colEnd: ${trimmed}`);
    const title = trimmed.slice(0, eq).trim();
    const spec = trimmed.slice(eq + 1).trim();
    if (!title) throw new Error("Empty title in --layout");
    if (seen.has(title)) throw new Error(`Duplicate title in --layout: ${title}`);
    seen.add(title);
    entries.push({ title, area: parseArea(spec) });
  }
  return entries;
}

/**
 * Order edge writes so start < end stays true after each one.
 * Expand an end before moving a start inward. Shrink a start before
 * shrinking an end past it. Columns use the same rule. Rows finish
 * before columns.
 */
export function orderEdgeUpdates(current: GridArea, target: GridArea): EdgeName[] {
  return [
    ...orderAxis(current.rowStart, current.rowEnd, target.rowStart, target.rowEnd, "rowStart", "rowEnd"),
    ...orderAxis(current.colStart, current.colEnd, target.colStart, target.colEnd, "colStart", "colEnd"),
  ];
}

function orderAxis(
  start: number,
  end: number,
  nextStart: number,
  nextEnd: number,
  startName: EdgeName,
  endName: EdgeName,
): EdgeName[] {
  const startMoves = start !== nextStart;
  const endMoves = end !== nextEnd;
  if (!startMoves && !endMoves) return [];
  if (startMoves && !endMoves) {
    if (!(nextStart < end)) throw new Error(`Cannot preserve start < end while moving ${startName}`);
    return [startName];
  }
  if (!startMoves && endMoves) {
    if (!(start < nextEnd)) throw new Error(`Cannot preserve start < end while moving ${endName}`);
    return [endName];
  }

  const startFirstKeeps = nextStart < end;
  const endFirstKeeps = start < nextEnd;
  if (!startFirstKeeps && !endFirstKeeps) {
    throw new Error(`Cannot preserve start < end for ${startName} and ${endName}`);
  }
  if (!startFirstKeeps) return [endName, startName];
  if (!endFirstKeeps) return [startName, endName];

  const expandEnd = nextEnd > end;
  const moveStartInward = nextStart > start;
  const shrinkStart = nextStart < start;
  const shrinkEnd = nextEnd < end;
  if (expandEnd && moveStartInward) return [endName, startName];
  if (shrinkStart && shrinkEnd) return [startName, endName];
  if (expandEnd) return [endName, startName];
  if (shrinkStart) return [startName, endName];
  return [startName, endName];
}

function areaDiffers(left: GridArea, right: GridArea): boolean {
  return (
    left.rowStart !== right.rowStart ||
    left.colStart !== right.colStart ||
    left.rowEnd !== right.rowEnd ||
    left.colEnd !== right.colEnd
  );
}

function sameArea(left: GridArea, right: GridArea): boolean {
  return !areaDiffers(left, right);
}

/** A row drag may not move columns. A column drag may not move rows. */
function driftReason(edge: EdgeName, before: GridArea, after: GridArea): string | null {
  const rowMove = edge === "rowStart" || edge === "rowEnd";
  if (rowMove) {
    if (
      after.colStart !== before.colStart ||
      after.colEnd !== before.colEnd ||
      after.colEnd - after.colStart !== before.colEnd - before.colStart
    ) {
      return "column span";
    }
    const other: EdgeName = edge === "rowStart" ? "rowEnd" : "rowStart";
    if (after[other] !== before[other]) return other;
    return null;
  }
  if (
    after.rowStart !== before.rowStart ||
    after.rowEnd !== before.rowEnd ||
    after.rowEnd - after.rowStart !== before.rowEnd - before.rowStart
  ) {
    return "row span";
  }
  const other: EdgeName = edge === "colStart" ? "colEnd" : "colStart";
  if (after[other] !== before[other]) return other;
  return null;
}

function overshot(before: number, after: number, goal: number): boolean {
  return (before < goal && after > goal) || (before > goal && after < goal);
}

function axisDelta(edge: EdgeName, direction: 1 | -1, pixels: number): { x: number; y: number } {
  const distance = Math.min(Math.abs(pixels), MAX_DRAG_PX) * direction;
  if (edge === "rowStart" || edge === "rowEnd") return { x: 0, y: distance };
  return { x: distance, y: 0 };
}

export async function readModel(page: Page): Promise<PageModel> {
  return page.evaluate(() => {
    const title = document.title || "";
    const text = document.body?.innerText || "";
    const canvas = document.querySelector('[data-testid="workbook-canvas"]');
    const signedOut =
      /^sign in/i.test(title) ||
      location.hostname === "accounts.google.com" ||
      (!canvas && /sign in to your organization/i.test(text));

    const pages = [...document.querySelectorAll('[data-testid^="page-item-"]')].map((el) => ({
      id: (el.getAttribute("data-testid") || "").replace(/^page-item-/, ""),
      name: (el.textContent || "").trim(),
      selected: el.getAttribute("data-selected") === "true" || el.getAttribute("aria-selected") === "true",
    }));

    function titlesOwnedBy(container: Element): string[] {
      return [...container.querySelectorAll('[data-testid="dynamic-title"]')]
        .filter((node) => node.closest("[data-element-container]") === container)
        .map((node) => (node.textContent || "").trim())
        .filter((value) => value.length > 0);
    }

    function labelOf(container: Element): string {
      const own = titlesOwnedBy(container);
      if (own.length === 1) return own[0];
      if (own.length > 1) return own.join(" ");
      const nested = [...container.querySelectorAll("[data-element-container]")].filter((node) => node !== container);
      const nestedLabels = nested
        .map((node) => titlesOwnedBy(node))
        .filter((titles) => titles.length === 1)
        .map((titles) => titles[0]);
      return nestedLabels.length === 1 ? nestedLabels[0] : "";
    }

    const selected = pages.find((tab) => tab.selected) ?? pages[0];
    const groups: Group[] = [];
    if (selected) {
      const root = document.querySelector(`[data-layout-id="layout-body-${selected.id}"]`);
      const layouts = root ? [root, ...root.querySelectorAll("[data-layout-id]")] : [];
      for (const layout of layouts) {
        const host = layout.querySelector(":scope > [data-elements]");
        if (!host) continue;
        const components: ComponentInfo[] = [];
        for (const child of host.children) {
          if (!child.hasAttribute("data-element-container")) continue;
          const label = labelOf(child);
          if (!label) continue;
          const id = child.getAttribute("data-selectable") || "";
          if (!id) continue;
          const rect = child.getBoundingClientRect();
          components.push({
            id,
            label,
            layoutId: layout.getAttribute("data-layout-id") || "",
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          });
        }
        if (components.length === 0) continue;
        const rect = layout.getBoundingClientRect();
        groups.push({
          layoutId: layout.getAttribute("data-layout-id") || "",
          layout: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          components,
        });
      }
    }
    return { pages, groups, signedOut };
  });
}

async function choosePage(page: Page, requested: string | undefined): Promise<void> {
  const model = await readModel(page);
  if (model.signedOut) {
    fail("Sign-in wall is showing. Log in to Sigma in this Chrome window, then rerun.", 2);
  }
  const tabs = model.pages;
  if (tabs.length === 0) fail("No workbook pages found.");
  if (!requested) {
    if (tabs.length !== 1) {
      fail(`This workbook has more than one page. Pass --page. Pages: ${tabs.map((tab) => tab.name).join(", ")}`);
    }
    return;
  }
  const matches = tabs.filter((tab) => tab.name === requested);
  if (matches.length !== 1) {
    fail(`Page ${JSON.stringify(requested)} was not found. Pages: ${tabs.map((tab) => tab.name).join(", ")}`);
  }
  if (!matches[0].selected) {
    await page.locator(`[data-testid="page-item-${matches[0].id}"]`).click();
    await page.locator(`[data-layout-id="layout-body-${matches[0].id}"]`).waitFor({ state: "visible", timeout: 15000 });
  }
}

export async function ensureEditor(page: Page, url: string, requestedPage: string | undefined): Promise<void> {
  await page.goto(toEditUrl(url), { waitUntil: "domcontentloaded" });
  try {
    await page.locator('[data-testid="workbook-canvas"]').waitFor({ state: "visible", timeout: 30000 });
  } catch {
    const model = await readModel(page);
    if (model.signedOut) {
      fail("Sign-in wall is showing. Log in to Sigma in this Chrome window, then rerun.", 2);
    }
    fail(`Workbook did not open: ${page.url()}`);
  }
  const landed = await readModel(page);
  if (landed.signedOut) {
    fail("Sign-in wall is showing. Log in to Sigma in this Chrome window, then rerun.", 2);
  }
  await choosePage(page, requestedPage);
}

export async function readGridArea(page: Page, id: string): Promise<GridArea> {
  const raw = await page.evaluate((elementId) => {
    const el = document.querySelector(`[data-testid="element_${elementId}"]`);
    if (!(el instanceof HTMLElement)) return null;
    const style = el.style;
    const rowStart = style.gridRowStart;
    const colStart = style.gridColumnStart;
    const rowEnd = style.gridRowEnd;
    const colEnd = style.gridColumnEnd;
    if (rowStart && colStart && rowEnd && colEnd) {
      return `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}`;
    }
    if (style.gridArea) return style.gridArea;
    const computed = getComputedStyle(el);
    return `${computed.gridRowStart} / ${computed.gridColumnStart} / ${computed.gridRowEnd} / ${computed.gridColumnEnd}`;
  }, id);
  if (!raw) fail(`No grid-area for element ${id}`);
  try {
    return parseGridArea(raw);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

export async function selectElement(page: Page, id: string, label: string): Promise<void> {
  const card = page.locator(`[data-testid="element-${id}"]`);
  try {
    await card.waitFor({ state: "attached", timeout: 5000 });
    await card.scrollIntoViewIfNeeded({ timeout: 5000 });
  } catch {
    fail(`${label}: element-${id} is not on the page`);
  }
  const point = await page.evaluate((elementId) => {
    const host = document.querySelector(`[data-testid="element-${elementId}"]`);
    if (!host) return null;
    const ownTitle = [...host.querySelectorAll('[data-testid="dynamic-title"]')].find((node) => {
      return node.closest('[data-testid^="element-"]') === host;
    });
    const target = ownTitle ?? host;
    const rect = target.getBoundingClientRect();
    const x = ownTitle ? rect.left + rect.width / 2 : rect.left + Math.min(8, rect.width / 2);
    const y = ownTitle ? rect.top + rect.height / 2 : rect.top + Math.min(8, rect.height / 2);
    return { x, y, width: window.innerWidth, height: window.innerHeight };
  }, id);
  if (!point) fail(`${label}: element-${id} is not on the page`);
  if (point.x < 0 || point.y < 0 || point.x > point.width || point.y > point.height) {
    fail(`${label}: element-${id} is outside the viewport`);
  }
  try {
    await page.mouse.click(point.x, point.y);
  } catch (error) {
    fail(`${label}: could not select element-${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function confirmSelected(page: Page, id: string, label: string): Promise<void> {
  const host = page.locator(`[data-testid="selection_resizers_container_${id}"]`);
  try {
    await host.waitFor({ state: "attached", timeout: 5000 });
  } catch {
    fail(`${label}: selection host for ${id} did not appear`);
  }
  const hostId = ((await host.getAttribute("data-testid")) || "").replace(/^selection_resizers_container_/, "");
  if (hostId !== id) fail(`${label}: selection host is ${hostId || "(none)"}, expected ${id}`);
}

/**
 * One resizer drag. Does not read grid-area. Pixel delta is capped at 96.
 * Calls the resizer's React onMouseDown, then the window listeners it registers.
 */
async function dragEdge(
  page: Page,
  id: string,
  edge: EdgeName,
  direction: 1 | -1,
  pixels: number,
  label: string,
): Promise<GestureResult> {
  await selectElement(page, id, label);
  const host = page.locator(`[data-testid="selection_resizers_container_${id}"]`);
  try {
    await host.waitFor({ state: "attached", timeout: 5000 });
  } catch {
    return { ok: false, reason: `resizer host for ${id} did not appear` };
  }
  const delta = axisDelta(edge, direction, pixels);
  return page.evaluate(
    ({ id: elementId, resizer, deltaX, deltaY, maxDelta }: DragArgs): GestureResult => {
      if (
        Math.abs(deltaX) > maxDelta ||
        Math.abs(deltaY) > maxDelta ||
        (deltaX !== 0 && deltaY !== 0) ||
        (deltaX === 0 && deltaY === 0)
      ) {
        return { ok: false, reason: "drag delta refused" };
      }

      const container = document.querySelector(`[data-testid="selection_resizers_container_${elementId}"]`);
      if (!(container instanceof HTMLElement)) return { ok: false, reason: "resizer host missing" };
      const hostId = (container.getAttribute("data-testid") || "").replace(/^selection_resizers_container_/, "");
      if (hostId !== elementId) return { ok: false, reason: `resizer host is ${hostId}` };
      const handle = container.querySelector(`[data-testid="${resizer}"]`);
      if (!(handle instanceof HTMLElement)) return { ok: false, reason: `${resizer} missing` };

      function canScroll(node: HTMLElement, axis: "x" | "y"): boolean {
        const style = getComputedStyle(node);
        const overflow = axis === "y" ? style.overflowY : style.overflowX;
        if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
        if (axis === "y") return node.scrollHeight - node.clientHeight > 1;
        return node.scrollWidth - node.clientWidth > 1;
      }

      function scrollerFrom(start: Element | null): HTMLElement | null {
        let node = start?.parentElement ?? null;
        while (node) {
          if (node instanceof HTMLElement && (canScroll(node, "y") || canScroll(node, "x"))) return node;
          node = node.parentElement;
        }
        return null;
      }

      let rect = handle.getBoundingClientRect();
      let centerX = rect.left + rect.width / 2;
      let centerY = rect.top + rect.height / 2;
      const outside =
        centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight;
      if (outside) {
        const grid = document.querySelector(`[data-testid="element_${elementId}"]`);
        const scroller =
          scrollerFrom(handle) ??
          scrollerFrom(grid) ??
          (document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);
        if (scroller) {
          if (centerY < 0 || centerY > window.innerHeight) {
            const targetY = Math.min(700, Math.max(40, window.innerHeight - 40));
            scroller.scrollTop += centerY - targetY;
          }
          if (centerX < 0 || centerX > window.innerWidth) {
            scroller.scrollLeft += centerX - window.innerWidth / 2;
          }
          rect = handle.getBoundingClientRect();
          centerX = rect.left + rect.width / 2;
          centerY = rect.top + rect.height / 2;
        }
      }

      function mouseDownHandler(node: Element): ((event: unknown) => void) | null {
        const key = Object.getOwnPropertyNames(node).find(
          (name) => name.startsWith("__reactFiber") || name.startsWith("__reactInternalInstance"),
        );
        if (!key) return null;
        const fiber = (node as unknown as Record<string, { memoizedProps?: { onMouseDown?: unknown } } | null>)[key];
        const handler = fiber?.memoizedProps?.onMouseDown;
        if (typeof handler !== "function") return null;
        return handler as (event: unknown) => void;
      }

      let owner: Element | null = handle;
      let onMouseDown: ((event: unknown) => void) | null = null;
      while (owner) {
        onMouseDown = mouseDownHandler(owner);
        if (onMouseDown) break;
        if (owner === container) break;
        owner = owner.parentElement;
      }
      if (!onMouseDown) return { ok: false, reason: "resizer has no onMouseDown" };

      const moves: EventListenerOrEventListenerObject[] = [];
      const ups: EventListenerOrEventListenerObject[] = [];
      const original = window.addEventListener.bind(window);
      window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === "mousemove") moves.push(listener);
        else if (type === "mouseup") ups.push(listener);
        original(type, listener, options);
      }) as typeof window.addEventListener;

      function invoke(listener: EventListenerOrEventListenerObject, event: Event): void {
        if (typeof listener === "function") listener.call(window, event);
        else listener.handleEvent(event);
      }

      const native = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        button: 0,
        buttons: 1,
      });
      let startError = "";
      try {
        onMouseDown({
          nativeEvent: native,
          type: "mousedown",
          target: handle,
          currentTarget: handle,
          clientX: centerX,
          clientY: centerY,
          pageX: centerX + window.scrollX,
          pageY: centerY + window.scrollY,
          screenX: centerX,
          screenY: centerY,
          button: 0,
          buttons: 1,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          movementX: 0,
          movementY: 0,
          preventDefault() {
            native.preventDefault();
          },
          stopPropagation() {
            native.stopPropagation();
          },
          persist() {},
        });
      } catch (error) {
        startError = error instanceof Error ? error.message : String(error);
      } finally {
        window.addEventListener = original;
      }

      const endX = centerX + deltaX;
      const endY = centerY + deltaY;
      const up = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: endX,
        clientY: endY,
        button: 0,
        buttons: 0,
      });
      if (moves.length === 0) {
        for (const listener of ups) {
          try {
            invoke(listener, up);
          } catch {
            // release a drag that never received a move
          }
        }
        return { ok: false, reason: startError || "mousedown did not register a window mousemove listener" };
      }

      const steps = 6;
      try {
        for (let step = 1; step <= steps; step += 1) {
          const event = new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX + (deltaX * step) / steps,
            clientY: centerY + (deltaY * step) / steps,
            button: 0,
            buttons: 1,
            movementX: deltaX / steps,
            movementY: deltaY / steps,
          });
          for (const listener of moves) invoke(listener, event);
        }
      } catch {
        // Grid-area is read on a later turn. Still release the pointer.
      } finally {
        for (const listener of ups) {
          try {
            invoke(listener, up);
          } catch {
            // mouseup still runs for the other listeners
          }
        }
      }
      return { ok: true };
    },
    { id, resizer: RESIZER[edge], deltaX: delta.x, deltaY: delta.y, maxDelta: MAX_DRAG_PX },
  );
}

async function moveEdge(
  page: Page,
  id: string,
  edge: EdgeName,
  goal: number,
  onChanged: () => void,
  label: string,
): Promise<void> {
  let area = await readGridArea(page, id);
  if (area[edge] === goal) return;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && area[edge] !== goal; attempt += 1) {
    const before = area;
    const direction: 1 | -1 = before[edge] < goal ? 1 : -1;
    let gesture: GestureResult;
    try {
      gesture = await dragEdge(page, id, edge, direction, NUDGE_PX, label);
    } catch (error) {
      if (error instanceof Exit) throw error;
      await page.waitForTimeout(SETTLE_MS);
      area = await readGridArea(page, id);
      if (areaDiffers(before, area)) onChanged();
      const detail = error instanceof Error ? error.message : String(error);
      fail(`${label}: ${edge} drag failed: ${detail} (area ${formatGridArea(area)})`);
    }
    if (!gesture.ok) fail(`${label}: did not resize ${edge}: ${gesture.reason}`);
    await page.waitForTimeout(SETTLE_MS);
    area = await readGridArea(page, id);
    if (areaDiffers(before, area)) onChanged();
    const drift = driftReason(edge, before, area);
    if (drift) fail(`${label}: ${edge} changed ${drift} (area ${formatGridArea(area)})`);
    if (area[edge] === before[edge]) {
      fail(`${label}: ${edge} did not move (area ${formatGridArea(area)})`);
    }
    if (area[edge] === goal) return;
    if (overshot(before[edge], area[edge], goal)) {
      const back: 1 | -1 = direction === 1 ? -1 : 1;
      let correction: GestureResult;
      try {
        correction = await dragEdge(page, id, edge, back, CORRECT_PX, label);
      } catch (error) {
        if (error instanceof Exit) throw error;
        await page.waitForTimeout(SETTLE_MS);
        const afterError = await readGridArea(page, id);
        if (areaDiffers(before, afterError)) onChanged();
        const detail = error instanceof Error ? error.message : String(error);
        fail(`${label}: ${edge} correction failed: ${detail} (area ${formatGridArea(afterError)})`);
      }
      if (!correction.ok) {
        fail(
          `${label}: ${edge} overshot ${goal} and the correction did not run (${correction.reason}) (area ${formatGridArea(area)})`,
        );
      }
      await page.waitForTimeout(SETTLE_MS);
      const corrected = await readGridArea(page, id);
      if (areaDiffers(before, corrected)) onChanged();
      const correctionDrift = driftReason(edge, before, corrected);
      if (correctionDrift) {
        fail(`${label}: ${edge} correction changed ${correctionDrift} (area ${formatGridArea(corrected)})`);
      }
      if (corrected[edge] !== goal) {
        fail(
          `${label}: ${edge} overshot ${goal} and is ${corrected[edge]} after correction (area ${formatGridArea(corrected)})`,
        );
      }
      return;
    }
  }

  fail(`${label}: ${edge} did not reach ${goal} after ${MAX_ATTEMPTS} attempts (area ${formatGridArea(area)})`);
}

/** Move one element to `target`, one edge at a time. `onChanged` runs on the first real grid change. */
export async function placeArea(
  page: Page,
  id: string,
  target: GridArea,
  onChanged: () => void,
  label = id,
): Promise<void> {
  if (target.rowStart >= target.rowEnd || target.colStart >= target.colEnd) {
    fail(`${label}: target span is empty (${formatGridArea(target)})`);
  }
  const current = await readGridArea(page, id);
  if (current.rowStart >= current.rowEnd || current.colStart >= current.colEnd) {
    fail(`${label}: grid-area is not a span (${formatGridArea(current)})`);
  }
  let edges: EdgeName[];
  try {
    edges = orderEdgeUpdates(current, target);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  for (const edge of edges) {
    await moveEdge(page, id, edge, target[edge], onChanged, label);
  }
  const landed = await readGridArea(page, id);
  if (!sameArea(landed, target)) {
    fail(`${label}: landed on ${formatGridArea(landed)}, wanted ${formatGridArea(target)}`);
  }
}

function parsePlaceArgs(args: string[]): { url: string; page?: string; layout: string } {
  let url: string | undefined;
  let page: string | undefined;
  let layout: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag !== "--url" && flag !== "--page" && flag !== "--layout") fail(`Unknown argument: ${flag}`);
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    if (flag === "--url") url = value;
    if (flag === "--page") page = value;
    if (flag === "--layout") layout = value;
    i++;
  }
  if (!url) fail("place requires --url");
  if (!layout) fail("place requires --layout");
  return { url, page, layout };
}

export async function runPlace(args: string[]): Promise<void> {
  const flags = parsePlaceArgs(args);
  let layout: LayoutEntry[];
  try {
    layout = parseLayout(flags.layout);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  await withChrome(async (page) => {
    await ensureEditor(page, flags.url, flags.page);
    const components = (await readModel(page)).groups.flatMap((group) => group.components);
    const located: { title: string; id: string; area: GridArea }[] = [];
    for (const entry of layout) {
      const matches = components.filter((component) => component.label === entry.title);
      if (matches.length === 0) {
        const titles = components.map((component) => component.label).join(", ") || "(none)";
        fail(
          `Title ${JSON.stringify(entry.title)} was not found. Nothing was resized.\nTitles on this page: ${titles}`,
        );
      }
      const match = matches[0];
      if (!match || matches.length !== 1) {
        fail(`Title ${JSON.stringify(entry.title)} matches ${matches.length} components. Nothing was resized.`);
      }
      located.push({ title: entry.title, id: match.id, area: entry.area });
    }

    const segment = pathSegmentFromUrl(page.url());
    const identity = { ...findWorkbook(segment), pathSegment: segment };
    let edited = false;
    const onChanged = () => {
      if (edited) return;
      edited = true;
      markOwned(identity);
    };
    try {
      for (const item of located) {
        await placeArea(page, item.id, item.area, onChanged, item.title);
      }
    } catch (error) {
      if (edited) markOwned(identity);
      throw error;
    }
    console.log(page.url());
    console.log(identity.workbookId ?? segment);
  });
}
