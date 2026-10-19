import type { Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { selectionClick } from "./container.js";
import { fail } from "./errors.js";
import { markOwned } from "./ledger.js";
import {
  elementHosts,
  ensureEditor,
  formatGridArea,
  readGridArea,
  readModel,
  unitPixels,
  type GridArea,
} from "./place.js";
import { parseSelectionMove } from "./selection-parse.js";
import { workbookIdentity } from "./sigma-api.js";

const SETTLE_MS = 600;
const SETTLE_POLLS = 4;

/** Translate a grid area by whole rows. Spans and columns stay put. */
export function movedArea(area: GridArea, rows: number): GridArea {
  return {
    rowStart: area.rowStart + rows,
    colStart: area.colStart,
    rowEnd: area.rowEnd + rows,
    colEnd: area.colEnd,
  };
}

/** Pixel delta for one vertical drag of the whole selection. Not a 1-unit resizer nudge. */
export function dragDeltaY(rowUnitPx: number, rows: number): number {
  return rows * rowUnitPx;
}

function sameArea(left: GridArea, right: GridArea): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.colStart === right.colStart &&
    left.rowEnd === right.rowEnd &&
    left.colEnd === right.colEnd
  );
}

type RecordedArea = { title: string; area: GridArea; selected: boolean };

async function readAreas(page: Page, ids: readonly string[]): Promise<Map<string, GridArea>> {
  const areas = new Map<string, GridArea>();
  for (const id of ids) areas.set(id, await readGridArea(page, id));
  return areas;
}

function areasSettled(left: Map<string, GridArea>, right: Map<string, GridArea>): boolean {
  if (left.size !== right.size) return false;
  for (const [id, area] of left) {
    const other = right.get(id);
    if (!other || !sameArea(area, other)) return false;
  }
  return true;
}

async function readSettledAreas(page: Page, ids: readonly string[]): Promise<Map<string, GridArea>> {
  await page.waitForTimeout(SETTLE_MS);
  let previous = await readAreas(page, ids);
  for (let poll = 0; poll < SETTLE_POLLS; poll += 1) {
    await page.waitForTimeout(SETTLE_MS);
    const next = await readAreas(page, ids);
    if (areasSettled(previous, next)) return next;
    previous = next;
  }
  return previous;
}

/** A point inside the host box and inside the window, off every resizer. */
async function dragPoint(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((host) => {
    const left = Math.max(host.x, 0);
    const top = Math.max(host.y, 0);
    const right = Math.min(host.x + host.width, window.innerWidth);
    const bottom = Math.min(host.y + host.height, window.innerHeight);
    if (right - left < 4 || bottom - top < 4) return null;
    const insetX = Math.min(24, (right - left) / 4);
    const insetY = Math.min(24, (bottom - top) / 4);
    const innerLeft = left + insetX;
    const innerTop = top + insetY;
    const innerRight = right - insetX;
    const innerBottom = bottom - insetY;
    const xs = innerLeft < innerRight ? [innerLeft, (innerLeft + innerRight) / 2, innerRight] : [(left + right) / 2];
    const ys = innerTop < innerBottom ? [innerTop, (innerTop + innerBottom) / 2, innerBottom] : [(top + bottom) / 2];
    for (const y of ys) {
      for (const x of xs) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest('[data-testid^="resizer_"]')) continue;
        return { x, y };
      }
    }
    return null;
  }, box);
}

/** One vertical drag of the selection body. The pointer goes down, moves, and up once. */
async function dragSelectionBody(page: Page, id: string, title: string, deltaY: number): Promise<void> {
  const host = page.locator(elementHosts(id).join(", ")).first();
  const box = await host.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) fail(`${title}: element is not on the page`);
  const point = await dragPoint(page, box);
  if (!point) fail(`${title}: could not find a drag point off the resizers.`);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  let dragError: unknown;
  try {
    const steps = Math.max(6, Math.min(40, Math.ceil(Math.abs(deltaY) / 12)));
    await page.mouse.move(point.x, point.y + deltaY, { steps });
  } catch (error) {
    dragError = error;
  } finally {
    await page.mouse.up().catch((error) => {
      dragError ??= error;
    });
  }
  if (dragError) {
    const detail = dragError instanceof Error ? dragError.message : String(dragError);
    fail(`${title}: selection drag failed: ${detail}`);
  }
}

export async function runSelectionMove(args: string[]): Promise<void> {
  const parsed = parseSelectionMove(args);

  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const components = (await readModel(page)).groups.flatMap((group) => group.components);
    const selected: { title: string; id: string; width: number; height: number }[] = [];
    for (const title of parsed.titles) {
      const matches = components.filter((component) => component.label === title);
      if (matches.length === 0) {
        const titles = components.map((component) => component.label).join(", ") || "(none)";
        fail(
          `Title ${JSON.stringify(title)} was not found. Nothing was moved.\nTitles on this page: ${titles}`,
        );
      }
      const match = matches[0];
      if (!match || matches.length !== 1) {
        fail(`Title ${JSON.stringify(title)} matches ${matches.length} components. Nothing was moved.`);
      }
      selected.push({ title, id: match.id, width: match.width, height: match.height });
    }

    const selectedIds = new Set(selected.map((item) => item.id));
    const recorded = new Map<string, RecordedArea>();
    for (const component of components) {
      if (recorded.has(component.id)) continue;
      recorded.set(component.id, {
        title: component.label,
        area: await readGridArea(page, component.id),
        selected: selectedIds.has(component.id),
      });
    }

    for (const [index, item] of selected.entries()) {
      const gesture = selectionClick(index);
      const host = page.locator(elementHosts(item.id).join(", ")).first();
      await host.scrollIntoViewIfNeeded();
      await host.click({ modifiers: gesture.modifiers, force: gesture.force, position: { x: 12, y: 8 } });
      try {
        await page.locator(`[data-testid="selection-border--${item.id}"]`).waitFor({ state: "attached", timeout: 5000 });
      } catch {
        fail(`${item.title} was not selected.`);
      }
    }

    const first = selected[0];
    if (!first) fail("selection-move requires at least two --title values");
    const firstArea = recorded.get(first.id)?.area;
    if (!firstArea) fail(`No grid-area for element ${first.id}`);
    let unitPx: number;
    try {
      unitPx = unitPixels({ width: first.width, height: first.height }, firstArea, "rowStart");
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    await dragSelectionBody(page, first.id, first.title, dragDeltaY(unitPx, parsed.rows));

    const after = await readSettledAreas(page, [...recorded.keys()]);
    for (const item of selected) {
      const prior = recorded.get(item.id);
      const found = after.get(item.id);
      if (!prior || !found) fail(`No grid-area for element ${item.id}`);
      const wanted = movedArea(prior.area, parsed.rows);
      if (!sameArea(found, wanted)) {
        fail(`${item.title} landed on ${formatGridArea(found)}, wanted ${formatGridArea(wanted)}`);
      }
    }
    for (const [id, prior] of recorded) {
      if (prior.selected) continue;
      const found = after.get(id);
      if (!found) fail(`No grid-area for element ${id}`);
      if (!sameArea(found, prior.area)) {
        fail(`Title ${JSON.stringify(prior.title)} was not selected and its area changed to ${formatGridArea(found)}.`);
      }
    }

    const segment = pathSegmentFromUrl(page.url());
    const identity = { ...workbookIdentity(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
    console.log(identity.urlId);
  });
}
