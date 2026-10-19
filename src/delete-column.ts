import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { deleteNamedColumns } from "./effects/build.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { refuseDeleteColumn } from "./system-columns.js";
import { workbookEditor } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type DeleteColumnCommand = {
  url: string;
  page?: string;
  title: string;
  columns: string[];
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

export function parseDeleteColumn(args: string[]): DeleteColumnCommand {
  const bag = readFlags(args);
  allow(bag, ["url", "page", "title", "column"]);
  const url = one(bag, "url");
  if (!url) fail("delete-column requires --url");
  const page = one(bag, "page");
  const title = one(bag, "title");
  if (!title) fail("delete-column requires --title");
  const columns = bag.column ?? [];
  if (columns.length === 0) fail("delete-column requires --column");
  for (const column of columns) {
    if (column.trim() === "") fail("delete-column --column is empty");
    refuseDeleteColumn(column);
  }
  return { url, page, title, columns };
}

export async function runDeleteColumn(args: string[]): Promise<void> {
  const parsed = parseDeleteColumn(args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const result = await deleteNamedColumns(workbookEditor(page), parsed.title, parsed.columns);
    for (const column of result.skipped) console.log(`${column} already absent`);
    if (result.deleted.length === 0) {
      console.log(page.url());
      return;
    }
    const segment = pathSegmentFromUrl(page.url());
    const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
    markOwned(identity);
    console.log(page.url());
  });
}
