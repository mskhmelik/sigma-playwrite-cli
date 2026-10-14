import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import type { Editor, ValueSource } from "./editor.js";
import { clearEveryControl, clearOneControl, writeControl } from "./effects/control.js";
import { openModalPage, styleModal } from "./effects/modal.js";
import { navigateTo } from "./effects/navigate.js";
import { deleteOneRow, editOneCell, insertManyRows, insertOneRow } from "./effects/rows.js";
import { runSequence } from "./effects/sequence.js";
import { fail } from "./errors.js";
import { requireControlKind, type HandleKind } from "./handles.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { findWorkbook } from "./sigma-api.js";
import { sourceLookup, workbookEditor } from "./workbook-editor.js";

const COMMANDS = [
  "navigate",
  "open-modal",
  "set-control",
  "clear-control",
  "insert-row",
  "insert-rows",
  "edit-cell",
  "delete-row",
  "sequence",
  "style-modal",
] as const;

export type ActionName = (typeof COMMANDS)[number];

export function isActionCommand(command: string): command is ActionName {
  return (COMMANDS as readonly string[]).includes(command);
}

type Step =
  | { kind: "navigate"; destination: string }
  | { kind: "open-modal"; modal: string }
  | { kind: "set-control"; controlKind: HandleKind; handle: string; source: ValueSource }
  | { kind: "clear-control"; controlKind?: HandleKind; handle?: string; pageControls?: string }
  | { kind: "insert-row"; title: string }
  | { kind: "insert-rows"; title: string; rows: string[][] }
  | { kind: "edit-cell"; title: string; column: string; value: string }
  | { kind: "delete-row"; title: string }
  | { kind: "style-modal"; page: string; header: string; sentence: string; button: string }
  | { kind: "sequence"; steps: Step[] };

export type ParsedAction = {
  url: string;
  page?: string;
  step: Step;
};

type Bag = Record<string, string[]>;

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

function splitWords(raw: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of raw.matchAll(pattern)) words.push(match[1] ?? match[2] ?? match[3]);
  return words;
}

function parseRows(raw: string): string[][] {
  return raw
    .split(";")
    .map((row) => row.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function valueSource(command: string, bag: Bag): ValueSource {
  const value = one(bag, "value");
  const fromHandle = one(bag, "from-handle");
  const column = one(bag, "column");
  const picked = [value, fromHandle, column].filter((item) => item !== undefined);
  if (picked.length !== 1) fail(`${command} requires --value, --from-handle, or --column`);
  if (value !== undefined) return { kind: "static", text: value };
  if (fromHandle !== undefined) {
    const controlKind = requireControlKind(one(bag, "from-kind"), `${command} --from-handle`);
    return { kind: "control", controlKind, handle: fromHandle };
  }
  return { kind: "column", column: column ?? "" };
}

export function parseAction(command: string, args: string[], inherited?: { url: string; page?: string }): ParsedAction {
  if (!isActionCommand(command)) fail(`Unknown command: ${command}`);
  const bag = readFlags(args);
  const url = one(bag, "url") ?? inherited?.url;
  if (!url) fail(`${command} requires --url`);
  const page = one(bag, "page") ?? inherited?.page;

  if (command === "navigate") {
    allow(bag, ["url", "page", "destination"]);
    const destination = one(bag, "destination");
    if (!destination) fail("navigate requires --destination");
    return { url, page, step: { kind: "navigate", destination } };
  }
  if (command === "open-modal") {
    allow(bag, ["url", "page", "modal"]);
    const modal = one(bag, "modal");
    if (!modal) fail("open-modal requires --modal");
    return { url, page, step: { kind: "open-modal", modal } };
  }
  if (command === "style-modal") {
    allow(bag, ["url", "page", "header", "sentence", "button"]);
    if (!page) fail("style-modal requires --page");
    const header = one(bag, "header");
    if (!header) fail("style-modal requires --header");
    const sentence = one(bag, "sentence");
    if (!sentence) fail("style-modal requires --sentence");
    const button = one(bag, "button");
    if (!button) fail("style-modal requires --button");
    return { url, page, step: { kind: "style-modal", page, header, sentence, button } };
  }
  if (command === "set-control") {
    allow(bag, ["url", "page", "handle", "kind", "value", "from-handle", "from-kind", "column"]);
    const handle = one(bag, "handle");
    if (!handle) fail("set-control requires --handle");
    const controlKind = requireControlKind(one(bag, "kind"), "set-control");
    return { url, page, step: { kind: "set-control", controlKind, handle, source: valueSource("set-control", bag) } };
  }
  if (command === "clear-control") {
    allow(bag, ["url", "page", "handle", "kind", "page-controls"]);
    const handle = one(bag, "handle");
    const pageControls = one(bag, "page-controls");
    if (!!handle === !!pageControls) fail("clear-control requires --handle");
    const controlKind = handle ? requireControlKind(one(bag, "kind"), "clear-control") : undefined;
    return { url, page, step: { kind: "clear-control", controlKind, handle, pageControls } };
  }
  if (command === "insert-row") {
    allow(bag, ["url", "page", "title"]);
    const title = one(bag, "title");
    if (!title) fail("insert-row requires --title");
    return { url, page, step: { kind: "insert-row", title } };
  }
  if (command === "insert-rows") {
    allow(bag, ["url", "page", "title", "rows"]);
    const title = one(bag, "title");
    if (!title) fail("insert-rows requires --title");
    const rows = one(bag, "rows");
    if (!rows) fail("insert-rows requires --rows");
    return { url, page, step: { kind: "insert-rows", title, rows: parseRows(rows) } };
  }
  if (command === "edit-cell") {
    allow(bag, ["url", "page", "title", "column", "value"]);
    const title = one(bag, "title");
    if (!title) fail("edit-cell requires --title");
    const column = one(bag, "column");
    if (!column) fail("edit-cell requires --column");
    const value = one(bag, "value");
    if (value === undefined) fail("edit-cell requires --value");
    return { url, page, step: { kind: "edit-cell", title, column, value } };
  }
  if (command === "delete-row") {
    allow(bag, ["url", "page", "title"]);
    const title = one(bag, "title");
    if (!title) fail("delete-row requires --title");
    return { url, page, step: { kind: "delete-row", title } };
  }

  allow(bag, ["url", "page", "step"]);
  const steps = bag.step ?? [];
  if (steps.length === 0) fail("sequence requires --step");
  return {
    url,
    page,
    step: {
      kind: "sequence",
      steps: steps.map((step) => {
        const words = splitWords(step);
        const name = words[0];
        if (!name || name === "sequence") fail(`sequence step is not a command: ${step}`);
        return parseAction(name, words.slice(1), { url, page }).step;
      }),
    },
  };
}

type Lookup = {
  control: (kind: HandleKind, handle: string) => Promise<string>;
  column: (column: string) => Promise<string>;
};

function mutates(step: Step): boolean {
  if (step.kind === "sequence") return step.steps.some(mutates);
  return step.kind !== "navigate" && step.kind !== "open-modal";
}

async function execute(editor: Editor, step: Step, lookup: Lookup, mark: () => void): Promise<void> {
  try {
    if (step.kind === "navigate") {
      await navigateTo(editor, step.destination);
      console.log(`navigate ${step.destination}`);
      return;
    }
    if (step.kind === "open-modal") {
      await openModalPage(editor, step.modal);
      console.log(`open-modal ${step.modal}`);
      return;
    }
    if (step.kind === "style-modal") {
      await styleModal(editor, step.page, step.header, step.sentence, step.button);
      console.log(`style-modal ${step.page}`);
      mark();
      return;
    }
    if (step.kind === "set-control") {
      await writeControl(editor, step.controlKind, step.handle, step.source, lookup);
      console.log(`set-control ${step.controlKind}.${step.handle}`);
      mark();
      return;
    }
    if (step.kind === "clear-control") {
      if (step.pageControls) {
        await clearEveryControl(editor, step.pageControls);
        console.log(`clear-control ${step.pageControls}`);
        mark();
        return;
      }
      if (!step.controlKind || !step.handle) fail("clear-control requires --handle");
      await clearOneControl(editor, step.controlKind, step.handle);
      console.log(`clear-control ${step.controlKind}.${step.handle}`);
      mark();
      return;
    }
    if (step.kind === "insert-row") {
      await insertOneRow(editor, step.title);
      console.log(`insert-row ${step.title}`);
      mark();
      return;
    }
    if (step.kind === "insert-rows") {
      await insertManyRows(editor, step.title, step.rows);
      console.log(`insert-rows ${step.title}`);
      mark();
      return;
    }
    if (step.kind === "edit-cell") {
      await editOneCell(editor, step.title, step.column, step.value);
      console.log(`edit-cell ${step.title}`);
      mark();
      return;
    }
    if (step.kind === "delete-row") {
      await deleteOneRow(editor, step.title);
      console.log(`delete-row ${step.title}`);
      mark();
      return;
    }
    await runSequence(step.steps.map((child) => () => execute(editor, child, lookup, mark)));
  } catch (error) {
    if (error instanceof Error && error.name === "Exit") throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
}

/** Runs the step. Marks the workbook after each mutating step that succeeds. */
export async function performAction(editor: Editor, step: Step, lookup: Lookup, mark: () => void): Promise<void> {
  await execute(editor, step, lookup, mark);
}

export async function runAction(command: string, args: string[]): Promise<void> {
  const parsed = parseAction(command, args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const mark = mutates(parsed.step)
      ? () => {
          const segment = pathSegmentFromUrl(page.url());
          const identity: Omit<OwnedWorkbook, "markedAt"> = { ...findWorkbook(segment), pathSegment: segment };
          markOwned(identity);
        }
      : () => {};
    await performAction(workbookEditor(page), parsed.step, sourceLookup(page), mark);
    console.log(page.url());
  });
}
