import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import {
  addEmptyInputTable,
  addNameControl,
  addNamedButton,
  addNamedPage,
  publishWorkbook,
  saveInsertAction,
} from "./effects/build.js";
import type { Editor } from "./editor.js";
import { fail } from "./errors.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { workbookEditor } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type CreateCommand =
  | { kind: "add-page"; url: string; page?: string; name: string }
  | { kind: "input-table"; url: string; page?: string; title: string; column: string }
  | { kind: "control"; url: string; page?: string; handle: string }
  | { kind: "button"; url: string; page?: string; title: string }
  | {
      kind: "set-action";
      url: string;
      page?: string;
      title: string;
      into: string;
      column: string;
      handle: string;
    }
  | { kind: "publish"; url: string; page?: string };

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

export function parseCreate(command: string, args: string[]): CreateCommand {
  const bag = readFlags(args);
  const url = one(bag, "url");
  if (!url) fail(`${command} requires --url`);
  const page = one(bag, "page");

  if (command === "add-page") {
    allow(bag, ["url", "page", "name"]);
    const name = one(bag, "name");
    if (!name) fail("add-page requires --name");
    return { kind: "add-page", url, page, name };
  }
  if (command === "add") {
    const type = one(bag, "type");
    if (type === "input-table") {
      allow(bag, ["url", "page", "type", "title", "column"]);
      const title = one(bag, "title");
      if (!title) fail("add input-table requires --title");
      const column = one(bag, "column");
      if (!column) fail("add input-table requires --column");
      return { kind: "input-table", url, page, title, column };
    }
    if (type === "control") {
      allow(bag, ["url", "page", "type", "handle"]);
      const handle = one(bag, "handle");
      if (!handle) fail("add control requires --handle");
      return { kind: "control", url, page, handle };
    }
    if (type === "button") {
      allow(bag, ["url", "page", "type", "title"]);
      const title = one(bag, "title");
      if (!title) fail("add button requires --title");
      return { kind: "button", url, page, title };
    }
    fail(`Unknown element type ${type ?? ""}. Known types: text, input-table, control, button`);
  }
  if (command === "set-action") {
    allow(bag, ["url", "page", "title", "effect", "into", "column", "from-handle"]);
    const title = one(bag, "title");
    if (!title) fail("set-action requires --title");
    const effect = one(bag, "effect");
    if (effect !== "insert-row") fail("set-action requires --effect insert-row");
    const into = one(bag, "into");
    if (!into) fail("set-action requires --into");
    const column = one(bag, "column");
    if (!column) fail("set-action requires --column");
    const handle = one(bag, "from-handle");
    if (!handle) fail("set-action requires --from-handle");
    return { kind: "set-action", url, page, title, into, column, handle };
  }
  if (command === "publish") {
    allow(bag, ["url", "page"]);
    return { kind: "publish", url, page };
  }
  fail(`Unknown command: ${command}`);
}

/** Runs the create command. Marks the workbook only after the edit succeeds. */
export async function applyCreate(editor: Editor, parsed: CreateCommand, mark: () => void): Promise<void> {
  try {
    if (parsed.kind === "add-page") await addNamedPage(editor, parsed.name);
    else if (parsed.kind === "input-table") await addEmptyInputTable(editor, parsed.title, parsed.column);
    else if (parsed.kind === "control") await addNameControl(editor, parsed.handle);
    else if (parsed.kind === "button") await addNamedButton(editor, parsed.title);
    else if (parsed.kind === "set-action") {
      await saveInsertAction(editor, parsed.title, parsed.into, parsed.column, parsed.handle);
    } else await publishWorkbook(editor);
  } catch (error) {
    if (error instanceof Error && error.name === "Exit") throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
  mark();
}

export async function runCreate(command: string, args: string[]): Promise<void> {
  const parsed = parseCreate(command, args);
  await withChrome(async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const editor = workbookEditor(page);
    await applyCreate(editor, parsed, () => {
      const segment = pathSegmentFromUrl(page.url());
      const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
      markOwned(identity);
    });
    console.log(page.url());
  });
}
