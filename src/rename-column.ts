import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { renameOneColumn } from "./effects/build.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { workbookEditor } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type RenameColumnCommand = {
  url: string;
  page?: string;
  title: string;
  column: string;
  name: string;
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

export function parseRenameColumn(args: string[]): RenameColumnCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "title", "column", "name"]);
  const url = one(bag, "url");
  if (!url) fail("rename-column requires --url");
  const page = one(bag, "page");
  const title = one(bag, "title");
  if (!title) fail("rename-column requires --title");
  const column = one(bag, "column");
  if (!column) fail("rename-column requires --column");
  const name = one(bag, "name");
  if (!name) fail("rename-column requires --name");
  return { url, page, title, column, name };
}

export async function runRenameColumn(args: string[]): Promise<void> {
  const parsed = parseRenameColumn(args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const changed = await renameOneColumn(workbookEditor(page), parsed.title, parsed.column, parsed.name);
    if (!changed) {
      console.log(`${parsed.name} already named`);
      console.log(page.url());
      return;
    }
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
