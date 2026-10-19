import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { setListControl } from "./effects/build.js";
import { fail } from "./errors.js";
import { requireControlKind, type HandleKind } from "./handles.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { workbookEditor } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type SetListCommand = {
  url: string;
  page?: string;
  kind: HandleKind;
  handle: string;
  source: string;
  column: string;
};

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

export function parseSetList(args: string[]): SetListCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "kind", "handle", "source", "column"]);
  const url = one(bag, "url");
  if (!url) fail("set-list requires --url");
  const page = one(bag, "page");
  const kind = requireControlKind(one(bag, "kind"), "set-list");
  const handle = one(bag, "handle");
  if (!handle || !handle.trim()) fail("set-list requires --handle");
  const source = one(bag, "source");
  if (!source || !source.trim()) fail("set-list requires --source");
  const column = one(bag, "column");
  if (!column || !column.trim()) fail("set-list requires --column");
  return { url, page, kind, handle, source, column };
}

export async function runSetList(args: string[]): Promise<void> {
  const parsed = parseSetList(args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    await setListControl(workbookEditor(page), parsed.kind, parsed.handle, parsed.source, parsed.column);
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
