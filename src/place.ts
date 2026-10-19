import type { Page } from "playwright";
import { pathSegmentFromUrl, sameEditor, toEditUrl, withChrome } from "./chrome.js";
import { Exit, fail } from "./errors.js";
import { markOwned } from "./ledger.js";
import { workbookIdentity } from "./sigma-api.js";

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

const MAX_DRAG_PX = 96;
const SETTLE_MS = 600;
const SETTLE_POLLS = 4;

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

/** A Sigma page is 24 columns wide. A full-width element has width 24. */
export const FULL_WIDTH = 24;

/** Pixel size of one grid row or one grid column, from the element box. */
export function unitPixels(
  box: { width: number; height: number },
  area: GridArea,
  edge: EdgeName,
): number {
  const rowEdge = edge === "rowStart" || edge === "rowEnd";
  const span = rowEdge ? area.rowEnd - area.rowStart : area.colEnd - area.colStart;
  const pixels = rowEdge ? box.height : box.width;
  if (span < 1 || pixels <= 0) throw new Error(`No ${rowEdge ? "row" : "column"} size to measure`);
  return pixels / span;
}

/** A point on the element inside the window. The title is used when it is already visible. */
export function visibleClick(
  rect: { x: number; y: number; width: number; height: number },
  preferred: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } | null {
  const left = Math.max(rect.x, 0);
  const top = Math.max(rect.y, 0);
  const right = Math.min(rect.x + rect.width, viewport.width);
  const bottom = Math.min(rect.y + rect.height, viewport.height);
  if (left >= right || top >= bottom) return null;
  const inside =
    preferred.x >= left && preferred.x < right && preferred.y >= top && preferred.y < bottom;
  if (inside) return { x: preferred.x, y: preferred.y };
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** A dynamic title wins. A text tile with none is named from its first line. */
export function componentLabel(titles: readonly string[], textTileText: string | undefined): string {
  const named = titles.map((title) => title.trim()).filter((title) => title.length > 0);
  if (named.length > 0) return named.join(" ");
  const line = (textTileText ?? "")
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? "";
}

export function componentId(attrs: { selectable: string; testId: string }): string {
  if (attrs.selectable) return attrs.selectable;
  if (attrs.testId.startsWith("element_")) return attrs.testId.slice("element_".length);
  if (attrs.testId.startsWith("element-")) return attrs.testId.slice("element-".length);
  return "";
}

export function elementHosts(id: string): string[] {
  return [
    `[data-testid="element-${id}"]`,
    `[data-testid="element_${id}"]`,
    `[data-selectable="${id}"]`,
  ];
}

/** One grid unit toward the goal. A later miss asks for one unit back. */
export function nextDragPixels(remainingUnits: number, unitPx: number): number {
  if (remainingUnits === 0) return 0;
  return (remainingUnits > 0 ? 1 : -1) * unitPx;
}

export type ElementSize = { width: number; height: number };

/** Width x height in grid units. `24x10` is full width and 10 rows tall. */
export function parseSize(spec: string): ElementSize {
  const match = spec.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) throw new Error(`Bad size ${spec}; expected widthxheight, for example 24x10`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 1 || height < 1) throw new Error(`Size must be at least 1x1: ${spec}`);
  return { width, height };
}

/** Keep the current top-left. Ends stay exclusive, so width 24 from column 1 ends at 25. */
export function applySize(current: GridArea, size: ElementSize): GridArea {
  return {
    rowStart: current.rowStart,
    colStart: current.colStart,
    rowEnd: current.rowStart + size.height,
    colEnd: current.colStart + size.width,
  };
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

function cloneArea(area: GridArea): GridArea {
  return {
    rowStart: area.rowStart,
    colStart: area.colStart,
    rowEnd: area.rowEnd,
    colEnd: area.colEnd,
  };
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

function overlaps(left: GridArea, right: GridArea): boolean {
  return (
    rangesOverlap(left.rowStart, left.rowEnd, right.rowStart, right.rowEnd) &&
    rangesOverlap(left.colStart, left.colEnd, right.colStart, right.colEnd)
  );
}

/**
 * A row edge that finishes on a neighbor's boundary still drags through it.
 * The nudge that crosses the line lands inside the neighbor, and Sigma then
 * stretches that neighbor or leaves the edge where it was.
 */
function rowEdgeHitsNeighbor(edge: EdgeName, before: GridArea, after: GridArea, neighbor: GridArea): boolean {
  if (edge !== "rowStart" && edge !== "rowEnd") return false;
  if (!rangesOverlap(after.colStart, after.colEnd, neighbor.colStart, neighbor.colEnd)) return false;
  if (rangesOverlap(after.rowStart, after.rowEnd, neighbor.rowStart, neighbor.rowEnd)) return true;
  if (edge === "rowStart" && after.rowStart < before.rowStart) {
    return neighbor.rowEnd <= before.rowStart && neighbor.rowEnd >= after.rowStart;
  }
  if (edge === "rowEnd" && after.rowEnd > before.rowEnd) {
    return neighbor.rowStart >= before.rowEnd && neighbor.rowStart <= after.rowEnd;
  }
  return false;
}

function stepHits(edge: EdgeName, before: GridArea, after: GridArea, neighbor: GridArea): boolean {
  return overlaps(after, neighbor) || rowEdgeHitsNeighbor(edge, before, after, neighbor);
}

/** Null moves the element being placed. A number is an index into `others`. */
export type PlacementStep = {
  index: number | null;
  area: GridArea;
};

export type PageItem = {
  index: number;
  current: GridArea;
  target: GridArea;
};

function directSteps(current: GridArea, target: GridArea): PlacementStep[] {
  const edges = orderEdgeUpdates(current, target);
  const steps: PlacementStep[] = [];
  let cursor = cloneArea(current);
  for (const edge of edges) {
    cursor = { ...cursor, [edge]: target[edge] };
    steps.push({ index: null, area: cloneArea(cursor) });
  }
  return steps;
}

function edgeHits(current: GridArea, target: GridArea, neighbor: GridArea): { row: boolean; column: boolean } {
  const hit = { row: false, column: false };
  if (sameArea(current, target)) return hit;
  const edges = orderEdgeUpdates(current, target);
  let cursor = cloneArea(current);
  for (const edge of edges) {
    const next = { ...cursor, [edge]: target[edge] };
    if (stepHits(edge, cursor, next, neighbor)) {
      if (edge === "rowStart" || edge === "rowEnd") hit.row = true;
      else hit.column = true;
    }
    cursor = next;
  }
  return hit;
}

function splitMid(mover: GridArea, neighbor: GridArea): number {
  const sharedStart = Math.max(mover.colStart, neighbor.colStart);
  const sharedEnd = Math.min(mover.colEnd, neighbor.colEnd);
  const width = sharedEnd - sharedStart;
  if (width < 2) throw new Error("Shared columns are too narrow to split");
  return sharedStart + Math.floor(width / 2);
}

function planCollides(current: GridArea, others: readonly GridArea[], steps: PlacementStep[]): boolean {
  let mover = cloneArea(current);
  const live = others.map((area) => cloneArea(area));
  for (const step of steps) {
    if (step.index !== null && (step.index < 0 || step.index >= live.length)) {
      throw new Error("Placement step names a missing neighbor");
    }
    const from = step.index === null ? mover : live[step.index];
    if (!sameArea(from, step.area)) {
      const edges = orderEdgeUpdates(from, step.area);
      let cursor = cloneArea(from);
      for (const edge of edges) {
        const next = { ...cursor, [edge]: step.area[edge] };
        const obstacles: GridArea[] = [];
        if (step.index !== null) obstacles.push(mover);
        for (let index = 0; index < live.length; index += 1) {
          if (index !== step.index) obstacles.push(live[index]);
        }
        if (obstacles.some((obstacle) => stepHits(edge, cursor, next, obstacle))) return true;
        cursor = next;
      }
    }
    if (step.index === null) mover = cloneArea(step.area);
    else live[step.index] = cloneArea(step.area);
  }
  return false;
}

function sidestepSteps(
  current: GridArea,
  target: GridArea,
  others: readonly GridArea[],
  blockers: number[],
  restoreBeforeFinish: boolean,
): PlacementStep[] {
  let colEnd = current.colEnd;
  const parkedAreas: GridArea[] = [];
  for (const index of blockers) {
    const neighbor = others[index];
    const mid = splitMid(current, neighbor);
    colEnd = Math.min(colEnd, mid);
    const parked: GridArea = {
      rowStart: neighbor.rowStart,
      colStart: mid,
      rowEnd: neighbor.rowEnd,
      colEnd: neighbor.colEnd,
    };
    if (parked.colStart >= parked.colEnd || parked.rowStart >= parked.rowEnd) {
      throw new Error("Shared columns are too narrow to split");
    }
    parkedAreas.push(parked);
  }
  if (current.colStart >= colEnd) throw new Error("Shared columns are too narrow to split");

  const left: GridArea = {
    rowStart: current.rowStart,
    colStart: current.colStart,
    rowEnd: current.rowEnd,
    colEnd,
  };
  const raised: GridArea = {
    rowStart: target.rowStart,
    colStart: left.colStart,
    rowEnd: target.rowEnd,
    colEnd: left.colEnd,
  };
  if (raised.rowStart >= raised.rowEnd || raised.colStart >= raised.colEnd) {
    throw new Error("Shared columns are too narrow to split");
  }

  const steps: PlacementStep[] = [];
  let mover = cloneArea(current);
  const live = others.map((area) => cloneArea(area));
  const pushMover = (next: GridArea) => {
    if (sameArea(mover, next)) return;
    steps.push({ index: null, area: cloneArea(next) });
    mover = cloneArea(next);
  };
  const pushNeighbor = (index: number, next: GridArea) => {
    if (sameArea(live[index], next)) return;
    steps.push({ index, area: cloneArea(next) });
    live[index] = cloneArea(next);
  };

  pushMover(left);
  for (let index = 0; index < blockers.length; index += 1) {
    pushNeighbor(blockers[index], parkedAreas[index]);
  }
  pushMover(raised);
  const restore = () => {
    for (const index of blockers) pushNeighbor(index, others[index]);
  };
  if (restoreBeforeFinish) {
    restore();
    pushMover(target);
  } else {
    pushMover(target);
    restore();
  }
  return steps;
}

/**
 * Areas that take `current` to `target` without dragging a row edge through
 * another element. A clear move keeps today's one-edge order. A row move that
 * would overlap a neighbor, or land on that neighbor's boundary, parks the
 * moving element on the left half of the shared columns and the neighbor on
 * the right half, moves the rows, then restores both column spans.
 */
export function planPlacement(
  current: GridArea,
  target: GridArea,
  others: readonly GridArea[],
): PlacementStep[] {
  if (others.some((other) => overlaps(target, other))) {
    throw new Error("Target overlaps another element");
  }
  if (others.some((other) => overlaps(current, other))) {
    throw new Error("Current area overlaps another element");
  }
  if (sameArea(current, target)) return [];

  let row = false;
  let column = false;
  const blockers: number[] = [];
  for (let index = 0; index < others.length; index += 1) {
    const hit = edgeHits(current, target, others[index]);
    if (hit.row) {
      row = true;
      blockers.push(index);
    }
    if (hit.column) column = true;
  }
  if (!row && !column) return directSteps(current, target);
  if (!row && column) throw new Error("Column move passes through another element");

  const restoringFirst = sidestepSteps(current, target, others, blockers, true);
  if (!planCollides(current, others, restoringFirst)) return restoringFirst;
  const finishingFirst = sidestepSteps(current, target, others, blockers, false);
  if (!planCollides(current, others, finishingFirst)) return finishingFirst;
  throw new Error("Placement still passes through a neighbor");
}

function columnSpan(area: GridArea): number {
  return area.colEnd - area.colStart;
}

function rowSpanOf(area: GridArea): number {
  return area.rowEnd - area.rowStart;
}

/** True when a target still sits on another element, so the lane plan is required. */
export function targetsOccupied(items: readonly PageItem[], obstacles: readonly GridArea[]): boolean {
  for (const item of items) {
    const others = [
      ...obstacles,
      ...items.filter((other) => other.index !== item.index).map((other) => other.current),
    ];
    if (others.some((other) => overlaps(item.target, other))) return true;
  }
  return false;
}

/**
 * Move a whole layout when targets are still occupied.
 * Clear one column lane, park every item below the page, then write the final cells.
 */
export function planPage(items: readonly PageItem[], obstacles: readonly GridArea[]): PlacementStep[] {
  if (items.length === 0) return [];
  const laneWidth = Math.min(...items.map((item) => Math.min(columnSpan(item.current), columnSpan(item.target))));
  if (laneWidth < 1) throw new Error("Lane is empty");

  let laneStart = -1;
  let laneEnd = -1;
  for (let end = FULL_WIDTH + 1; end - laneWidth >= 1; end -= 1) {
    const start = end - laneWidth;
    const blocked = obstacles.some((area) => rangesOverlap(area.colStart, area.colEnd, start, end));
    if (!blocked) {
      laneStart = start;
      laneEnd = end;
      break;
    }
  }
  if (laneStart < 0) throw new Error("No free column lane");

  const live = new Map<number, GridArea>();
  for (const item of items) live.set(item.index, cloneArea(item.current));
  const steps: PlacementStep[] = [];

  const othersOf = (index: number): GridArea[] => {
    const areas = [...obstacles];
    for (const [key, area] of live) {
      if (key !== index) areas.push(area);
    }
    return areas;
  };

  const emit = (index: number, next: GridArea) => {
    const current = live.get(index);
    if (!current) throw new Error("Placement step names a missing neighbor");
    if (sameArea(current, next)) return;
    const plan = planPlacement(current, next, othersOf(index));
    if (plan.some((step) => step.index !== null)) {
      steps.push({ index, area: cloneArea(next) });
      live.set(index, cloneArea(next));
      return;
    }
    for (const step of plan) steps.push({ index, area: cloneArea(step.area) });
    const landed = plan[plan.length - 1];
    if (!landed) return;
    live.set(index, cloneArea(landed.area));
  };

  const bottomFirst = [...items].sort((left, right) => right.current.rowStart - left.current.rowStart);

  for (const item of bottomFirst) {
    const area = live.get(item.index);
    if (!area || !rangesOverlap(area.colStart, area.colEnd, laneStart, laneEnd)) continue;
    if (area.colStart < laneStart) {
      emit(item.index, { ...area, colEnd: laneStart });
      continue;
    }
    const span = columnSpan(area);
    const nextEnd = laneStart;
    const nextStart = nextEnd - span;
    if (nextStart < 1) throw new Error("No room to clear the column lane");
    emit(item.index, { ...area, colStart: nextStart, colEnd: nextEnd });
  }

  let floor = 1;
  for (const area of [...live.values(), ...items.map((item) => item.target), ...obstacles]) {
    floor = Math.max(floor, area.rowEnd);
  }
  let cursor = floor;
  const slots = new Map<number, GridArea>();
  for (const item of bottomFirst) {
    const area = live.get(item.index);
    if (!area) throw new Error("Placement step names a missing neighbor");
    const span = rowSpanOf(area);
    slots.set(item.index, { rowStart: cursor, rowEnd: cursor + span, colStart: laneStart, colEnd: laneEnd });
    cursor += span;
  }

  for (const item of bottomFirst) {
    const area = live.get(item.index);
    const slot = slots.get(item.index);
    if (!area || !slot) throw new Error("Placement step names a missing neighbor");
    emit(item.index, { rowStart: slot.rowStart, rowEnd: slot.rowEnd, colStart: area.colStart, colEnd: area.colEnd });
    emit(item.index, slot);
  }

  const writers = [...items].sort((left, right) => {
    const leftLane = left.target.colStart === laneStart && left.target.colEnd === laneEnd ? 1 : 0;
    const rightLane = right.target.colStart === laneStart && right.target.colEnd === laneEnd ? 1 : 0;
    if (leftLane !== rightLane) return leftLane - rightLane;
    return (slots.get(left.index)?.rowStart ?? 0) - (slots.get(right.index)?.rowStart ?? 0);
  });
  for (const item of writers) {
    const parked = live.get(item.index);
    if (!parked) throw new Error("Placement step names a missing neighbor");
    emit(item.index, {
      rowStart: parked.rowStart,
      rowEnd: parked.rowEnd,
      colStart: item.target.colStart,
      colEnd: item.target.colEnd,
    });
    emit(item.index, item.target);
  }

  return steps;
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

function axisDelta(edge: EdgeName, direction: 1 | -1, pixels: number): { x: number; y: number } {
  const distance = Math.min(Math.abs(pixels), MAX_DRAG_PX) * direction;
  if (edge === "rowStart" || edge === "rowEnd") return { x: 0, y: distance };
  return { x: distance, y: 0 };
}

async function revealGrid(page: Page): Promise<void> {
  const ids = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid^="page-item-"]')];
    const selected =
      tabs.find((el) => el.getAttribute("data-selected") === "true" || el.getAttribute("aria-selected") === "true") ??
      tabs[0];
    if (!selected) return [] as string[];
    const pageId = (selected.getAttribute("data-testid") || "").replace(/^page-item-/, "");
    const root = document.querySelector(`[data-layout-id="layout-body-${pageId}"]`);
    if (!root) return [] as string[];
    return [...root.querySelectorAll("[data-element-container][data-selectable], [data-testid^='element_']")]
      .map((el) => {
        const selectable = el.getAttribute("data-selectable") || "";
        const testId = el.getAttribute("data-testid") || "";
        return selectable || (testId.startsWith("element_") ? testId.slice("element_".length) : "");
      })
      .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);
  });
  for (const id of ids) {
    await page.locator(`[data-selectable="${id}"], [data-testid="element_${id}"]`).first().scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
  }
}

export async function readModel(page: Page): Promise<PageModel> {
  await revealGrid(page);
  const raw = await page.evaluate(() => {
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

    function titlesOf(container: Element): string[] {
      const own = titlesOwnedBy(container);
      if (own.length > 0) return own;
      const nested = [...container.querySelectorAll("[data-element-container]")].filter((node) => node !== container);
      const nestedLabels = nested
        .map((node) => titlesOwnedBy(node))
        .filter((titles) => titles.length === 1)
        .map((titles) => titles[0] ?? "");
      return nestedLabels.length === 1 ? nestedLabels : [];
    }

    type RawComponent = {
      selectable: string;
      testId: string;
      titles: string[];
      textTileText?: string;
      layoutId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
    type RawGroup = {
      layoutId: string;
      layout: { x: number; y: number; width: number; height: number };
      components: RawComponent[];
    };

    const selected = pages.find((tab) => tab.selected) ?? pages[0];
    const groups: RawGroup[] = [];
    if (selected) {
      const root = document.querySelector(`[data-layout-id="layout-body-${selected.id}"]`);
      const layouts = root ? [root, ...root.querySelectorAll("[data-layout-id]")] : [];
      for (const layout of layouts) {
        const host = layout.querySelector(":scope > [data-elements]");
        if (!host) continue;
        const components: RawComponent[] = [];
        for (const child of host.children) {
          const ownTestId = child.getAttribute("data-testid") || "";
          const nestedTest = child.querySelector("[data-testid^='element_'], [data-testid^='element-']");
          const testId = ownTestId.startsWith("element_") || ownTestId.startsWith("element-")
            ? ownTestId
            : nestedTest?.getAttribute("data-testid") || "";
          const selectable =
            child.getAttribute("data-selectable") ||
            child.querySelector("[data-selectable]")?.getAttribute("data-selectable") ||
            "";
          const isTile =
            child.hasAttribute("data-element-container") ||
            testId.startsWith("element_") ||
            testId.startsWith("element-");
          if (!isTile) continue;
          const titles = titlesOf(child);
          const textTile = !child.querySelector('[role="grid"], table');
          const rect = child.getBoundingClientRect();
          components.push({
            selectable,
            testId,
            titles,
            textTileText: textTile ? child.textContent || "" : undefined,
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

  const groups: Group[] = [];
  for (const group of raw.groups) {
    const components: ComponentInfo[] = [];
    for (const component of group.components) {
      const id = componentId({ selectable: component.selectable, testId: component.testId });
      if (!id) continue;
      const label = componentLabel(component.titles, component.textTileText);
      if (!label) continue;
      components.push({
        id,
        label,
        layoutId: component.layoutId,
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
      });
    }
    if (components.length === 0) continue;
    groups.push({ layoutId: group.layoutId, layout: group.layout, components });
  }
  return { pages: raw.pages, groups, signedOut: raw.signedOut };
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
  const current = new URL(page.url());
  const nodeId = current.searchParams.get(":nodeId") || current.searchParams.get("nodeId");
  if (!matches[0].selected || (nodeId && nodeId !== matches[0].id)) {
    const next = new URL(toEditUrl(page.url()));
    next.search = `:${new URLSearchParams({ nodeId: matches[0].id }).toString()}`;
    await page.goto(next.toString(), { waitUntil: "domcontentloaded" });
    await page.locator(`[data-layout-id="layout-body-${matches[0].id}"]`).waitFor({ state: "visible", timeout: 15000 });
  }
}

export async function ensureEditor(page: Page, url: string, requestedPage: string | undefined): Promise<void> {
  if (!sameEditor(page.url(), url)) {
    await page.goto(toEditUrl(url), { waitUntil: "domcontentloaded" });
  }
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
  let card = page.locator(elementHosts(id)[0]).first();
  let found = false;
  for (const selector of elementHosts(id)) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) {
      card = locator.first();
      found = true;
      break;
    }
  }
  if (!found) fail(`${label}: element-${id} is not on the page`);
  try {
    await card.waitFor({ state: "attached", timeout: 5000 });
    await card.scrollIntoViewIfNeeded({ timeout: 5000 });
  } catch {
    fail(`${label}: element-${id} is not on the page`);
  }
  const measured = await page.evaluate((selectors) => {
    const host = selectors
      .map((selector) => document.querySelector(selector))
      .find((node): node is HTMLElement => node instanceof HTMLElement);
    if (!(host instanceof HTMLElement)) return null;
    const ownTitle = [...host.querySelectorAll('[data-testid="dynamic-title"]')].find((node) => {
      return node.closest('[data-testid^="element-"], [data-testid^="element_"]') === host;
    });
    const hostRect = host.getBoundingClientRect();
    const titleRect = ownTitle?.getBoundingClientRect();
    const preferred = titleRect
      ? { x: titleRect.left + titleRect.width / 2, y: titleRect.top + titleRect.height / 2 }
      : { x: hostRect.left + Math.min(8, hostRect.width / 2), y: hostRect.top + Math.min(8, hostRect.height / 2) };
    return {
      rect: { x: hostRect.x, y: hostRect.y, width: hostRect.width, height: hostRect.height },
      preferred,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, elementHosts(id));
  if (!measured) fail(`${label}: element-${id} is not on the page`);
  const point = visibleClick(measured.rect, measured.preferred, measured.viewport);
  if (!point) fail(`${label}: element-${id} is outside the viewport`);
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

/** Wait until two later reads agree. One settle interval can be early; the poll is capped. */
async function readSettledGridArea(page: Page, id: string): Promise<GridArea> {
  await page.waitForTimeout(SETTLE_MS);
  let previous = await readGridArea(page, id);
  for (let poll = 0; poll < SETTLE_POLLS; poll += 1) {
    await page.waitForTimeout(SETTLE_MS);
    const next = await readGridArea(page, id);
    if (sameArea(previous, next)) return next;
    previous = next;
  }
  return previous;
}

async function dragUntilSettled(
  page: Page,
  id: string,
  edge: EdgeName,
  direction: 1 | -1,
  pixels: number,
  before: GridArea,
  onChanged: () => void,
  label: string,
): Promise<GridArea> {
  let gesture: GestureResult;
  try {
    gesture = await dragEdge(page, id, edge, direction, pixels, label);
  } catch (error) {
    if (error instanceof Exit) throw error;
    const landed = await readSettledGridArea(page, id);
    if (areaDiffers(before, landed)) onChanged();
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${label}: ${edge} drag failed: ${detail} (area ${formatGridArea(landed)})`);
  }
  if (!gesture.ok) fail(`${label}: did not resize ${edge}: ${gesture.reason}`);
  const landed = await readSettledGridArea(page, id);
  if (areaDiffers(before, landed)) onChanged();
  const drift = driftReason(edge, before, landed);
  if (drift) fail(`${label}: ${edge} changed ${drift} (area ${formatGridArea(landed)})`);
  return landed;
}

async function readElementBox(page: Page, id: string): Promise<{ width: number; height: number }> {
  const box = await page.evaluate((elementId) => {
    const el = document.querySelector(`[data-testid="element_${elementId}"]`);
    if (!(el instanceof HTMLElement)) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, id);
  if (!box || box.width <= 0 || box.height <= 0) fail(`No box for element ${id}`);
  return box;
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
  const box = await readElementBox(page, id);
  let unit: number;
  try {
    unit = unitPixels(box, area, edge);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const budget = Math.abs(goal - area[edge]) + 8;

  for (let attempt = 1; attempt <= budget && area[edge] !== goal; attempt += 1) {
    const before = area;
    const pixels = nextDragPixels(goal - before[edge], unit);
    const direction: 1 | -1 = pixels > 0 ? 1 : -1;
    area = await dragUntilSettled(page, id, edge, direction, Math.abs(pixels), before, onChanged, label);
    if (area[edge] === before[edge]) {
      fail(`${label}: ${edge} did not move (area ${formatGridArea(area)})`);
    }
  }

  if (area[edge] !== goal) {
    fail(`${label}: ${edge} did not reach ${goal} after ${budget} attempts (area ${formatGridArea(area)})`);
  }
}

async function readSiblingAreas(page: Page, id: string): Promise<{ id: string; area: GridArea }[]> {
  const ids = await page.evaluate((elementId) => {
    const node = document.querySelector(`[data-testid="element_${elementId}"]`);
    const container = node?.closest("[data-element-container]");
    const host = container?.parentElement;
    if (!host) return [] as string[];
    const found: string[] = [];
    for (const child of host.children) {
      if (!(child instanceof HTMLElement) || !child.hasAttribute("data-element-container")) continue;
      const selectable = child.getAttribute("data-selectable") || "";
      if (!selectable || selectable === elementId) continue;
      found.push(selectable);
    }
    return found;
  }, id);
  const siblings: { id: string; area: GridArea }[] = [];
  for (const siblingId of ids) {
    siblings.push({ id: siblingId, area: await readGridArea(page, siblingId) });
  }
  return siblings;
}

async function moveBetween(
  page: Page,
  id: string,
  target: GridArea,
  onChanged: () => void,
  label: string,
): Promise<void> {
  const current = await readGridArea(page, id);
  if (sameArea(current, target)) return;
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

/** Move one element to `target`. A row drag that would pass through a neighbor sidesteps onto column halves first. */
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
  const siblings = await readSiblingAreas(page, id);
  let steps: PlacementStep[];
  try {
    steps = planPlacement(
      current,
      target,
      siblings.map((sibling) => sibling.area),
    );
  } catch (error) {
    if (error instanceof Exit) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
  for (const step of steps) {
    if (step.index === null) {
      await moveBetween(page, id, step.area, onChanged, label);
      continue;
    }
    const sibling = siblings[step.index];
    if (!sibling) fail(`${label}: placement step names a missing neighbor`);
    await moveBetween(page, sibling.id, step.area, onChanged, sibling.id);
  }
  const landed = await readGridArea(page, id);
  if (!sameArea(landed, target)) {
    fail(`${label}: landed on ${formatGridArea(landed)}, wanted ${formatGridArea(target)}`);
  }
  for (let index = 0; index < siblings.length; index += 1) {
    const sibling = siblings[index];
    if (!sibling) continue;
    const now = await readGridArea(page, sibling.id);
    const intended = [...steps].reverse().find((step) => step.index === index);
    const goal = intended ? intended.area : sibling.area;
    if (sameArea(now, goal)) continue;
    await restoreArea(page, sibling.id, goal, id, onChanged, sibling.id);
  }
}

async function restoreArea(
  page: Page,
  id: string,
  goal: GridArea,
  neighborId: string,
  onChanged: () => void,
  label: string,
): Promise<void> {
  const current = await readGridArea(page, id);
  if (sameArea(current, goal)) return;
  const neighbor = await readGridArea(page, neighborId);
  let steps: PlacementStep[];
  try {
    steps = planPlacement(current, goal, [neighbor]);
  } catch (error) {
    if (error instanceof Exit) throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
  for (const step of steps) {
    if (step.index === null) {
      await moveBetween(page, id, step.area, onChanged, label);
      continue;
    }
    await moveBetween(page, neighborId, step.area, onChanged, neighborId);
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

  await withChrome(flags.url, async (page) => {
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
    const identity = { ...workbookIdentity(segment), pathSegment: segment };
    let edited = false;
    const onChanged = () => {
      if (edited) return;
      edited = true;
      markOwned(identity);
    };
    const moving = new Set(located.map((item) => item.id));
    const obstacles: GridArea[] = [];
    for (const component of components) {
      if (moving.has(component.id)) continue;
      obstacles.push(await readGridArea(page, component.id));
    }
    const items: PageItem[] = [];
    for (let index = 0; index < located.length; index += 1) {
      const item = located[index];
      if (!item) continue;
      items.push({ index, current: await readGridArea(page, item.id), target: item.area });
    }
    try {
      if (!targetsOccupied(items, obstacles)) {
        for (const item of located) {
          await placeArea(page, item.id, item.area, onChanged, item.title);
        }
      } else {
        let steps: PlacementStep[];
        try {
          steps = planPage(items, obstacles);
        } catch (error) {
          if (error instanceof Exit) throw error;
          fail(error instanceof Error ? error.message : String(error));
        }
        for (const step of steps) {
          if (step.index === null) fail("Placement step names a missing neighbor");
          const item = located[step.index];
          if (!item) fail("Placement step names a missing neighbor");
          await placeArea(page, item.id, step.area, onChanged, item.title);
        }
      }
    } catch (error) {
      if (edited) markOwned(identity);
      throw error;
    }
    console.log(page.url());
    console.log(identity.urlId);
  });
}
