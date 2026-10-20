import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { elementHosts, ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { writeControlId } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type SetControlIdCommand = { url: string; page?: string; element: string; id: string };

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

export function parseSetControlId(args: string[]): SetControlIdCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "element", "id"]);
  const url = one(bag, "url");
  if (!url) fail("set-control-id requires --url");
  const page = one(bag, "page");
  const element = one(bag, "element");
  if (!element || !element.trim()) fail("set-control-id requires --element");
  const id = one(bag, "id");
  if (!id || !id.trim()) fail("set-control-id requires --id");
  return { url, page, element, id };
}

export async function runSetControlId(args: string[]): Promise<void> {
  const parsed = parseSetControlId(args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const host = page.locator(elementHosts(parsed.element).join(", "));
    if ((await host.count()) < 1) {
      fail(`Element ${JSON.stringify(parsed.element)} was not found. Nothing was changed.`);
    }
    await writeControlId(page, parsed.element, parsed.id);
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
