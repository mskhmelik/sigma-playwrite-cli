import type { Page } from "playwright";
import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { parseOrder, sameTitleSet, topsIncrease } from "./order.js";
import {
  ensureEditor,
  formatGridArea,
  placeArea,
  readGridArea,
  readModel,
  type GridArea,
  type Group,
} from "./place.js";
import { findWorkbook } from "./sigma-api.js";

/**
 * Stack one sibling group top to bottom. Column span and row span stay as
 * they are; rowStart values abut from row 1 (next.rowStart = previous.rowEnd).
 * The move itself is place.ts. Success is still strictly increasing tops.
 */

function parseArrangeArgs(args: string[]): { url: string; page?: string; order: string } {
  let url: string | undefined;
  let page: string | undefined;
  let order: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag !== "--url" && flag !== "--page" && flag !== "--order") {
      fail(`Unknown argument: ${flag}`);
    }
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    if (flag === "--url") url = value;
    if (flag === "--page") page = value;
    if (flag === "--order") order = value;
    i++;
  }
  if (!url) fail("arrange requires --url");
  if (!order) fail("arrange requires --order");
  return { url, page, order };
}

function describeGroups(groups: Group[]): string {
  if (groups.length === 0) return "(no titled components)";
  return groups
    .map((group) => `- ${group.components.map((component) => component.label).join(", ")}`)
    .join("\n");
}

function pickGroup(groups: Group[], order: string[]): Group {
  const matches = groups.filter((group) => sameTitleSet(group.components.map((component) => component.label), order));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    fail(`No component group matches --order exactly.\nGroups on this page:\n${describeGroups(groups)}`);
  }
  fail(`More than one component group matches --order.\n${describeGroups(matches)}`);
}

async function stack(page: Page, order: string[], identity: Omit<OwnedWorkbook, "markedAt">): Promise<void> {
  let edited = false;
  const onChanged = () => {
    if (edited) return;
    edited = true;
    markOwned(identity);
  };
  try {
    let rowStart = 1;
    for (const label of order) {
      const fresh = pickGroup((await readModel(page)).groups, order);
      const component = fresh.components.find((item) => item.label === label);
      if (!component) fail(`Lost component ${JSON.stringify(label)} during arrange`);
      const current = await readGridArea(page, component.id);
      const rowSpan = current.rowEnd - current.rowStart;
      if (rowSpan <= 0) {
        fail(`Component ${JSON.stringify(label)} has no row span (${formatGridArea(current)})`);
      }
      const target: GridArea = {
        rowStart,
        rowEnd: rowStart + rowSpan,
        colStart: current.colStart,
        colEnd: current.colEnd,
      };
      await placeArea(page, component.id, target, onChanged, label);
      rowStart = target.rowEnd;
    }

    const finals = pickGroup((await readModel(page)).groups, order);
    const ys = order.map((label) => {
      const component = finals.components.find((item) => item.label === label);
      if (!component) fail(`Lost component ${JSON.stringify(label)}`);
      return component.y;
    });
    if (!topsIncrease(ys)) {
      fail(`Components are not in the requested top-to-bottom order. Tops: ${ys.join(", ")}`);
    }
  } catch (error) {
    if (edited) markOwned(identity);
    throw error;
  }
}

export async function runArrange(args: string[]): Promise<void> {
  const flags = parseArrangeArgs(args);
  let order: string[];
  try {
    order = parseOrder(flags.order);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  await withChrome(flags.url, async (page) => {
    await ensureEditor(page, flags.url, flags.page);
    const before = await readModel(page);
    const group = pickGroup(before.groups, order);
    const segment = pathSegmentFromUrl(page.url());
    const identity = { ...findWorkbook(segment), pathSegment: segment };
    const ys = order.map((label) => group.components.find((item) => item.label === label)!.y);
    if (!topsIncrease(ys)) {
      await stack(page, order, identity);
    }

    markOwned(identity);
    console.log(`Arranged ${order.length} components on ${page.url()}`);
    console.log(`Marked Playwright-owned: ${identity.workbookId ?? segment}`);
  });
}
