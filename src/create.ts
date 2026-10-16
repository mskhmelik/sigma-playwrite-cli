import { pathSegmentFromUrl, withChrome } from "./chrome.js";
import { parseArea, type GridArea } from "./place.js";
import {
  addEmptyInputTable,
  addDateControl,
  addListControl,
  addNameControl,
  addNamedButton,
  addNamedContainer,
  addNamedPage,
  addNamedDrawer,
  addNamedModal,
  addSegmentedControl,
  addCalculatedColumn,
  addSelectColumn,
  addSystemColumns,
  groupIntoExisting,
  publishWorkbook,
  saveCloseModal,
  saveIfElse,
  saveInsertAction,
  saveOnSelectControl,
  saveUpdateRow,
} from "./effects/build.js";
import type { DrawerSettings, DrawerSize, DrawerToggle, Editor } from "./editor.js";
import { fail } from "./errors.js";
import { drawerTitle, requireControlKind, type HandleKind } from "./handles.js";
import { markOwned, type OwnedWorkbook } from "./ledger.js";
import { ensureEditor } from "./place.js";
import { workbookIdentity } from "./sigma-api.js";
import { requireSystemColumn } from "./system-columns.js";
import { requireSentenceCase, requireTableTitle } from "./titles.js";
import { workbookEditor } from "./workbook-editor.js";

type Bag = Record<string, string[]>;

export type InputColumn = { name: string; type: "text" | "date" };

function inputColumns(values: string[]): InputColumn[] {
  if (values.length === 0) fail("add input-table requires --column");
  const columns: InputColumn[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parts = value.split(":");
    const name = (parts[0] ?? "").trim();
    const type = parts.length === 1 ? "text" : (parts[1] ?? "").trim();
    if (!name || parts.length > 2) {
      fail(`add input-table column must be name or name:text or name:date, not ${JSON.stringify(value)}`);
    }
    if (type !== "text" && type !== "date") {
      fail(`add input-table column type must be text or date, not ${JSON.stringify(type)}`);
    }
    if (seen.has(name)) fail(`Duplicate --column ${name}`);
    seen.add(name);
    columns.push({ name, type });
  }
  return columns;
}

export type CreateCommand =
  | { kind: "add-page"; url: string; page?: string; name: string }
  | { kind: "input-table"; url: string; page?: string; title: string; columns: InputColumn[] }
  | { kind: "control"; url: string; page?: string; controlKind: HandleKind; handle: string; area?: GridArea }
  | { kind: "segmented"; url: string; page?: string; controlKind: HandleKind; handle: string; options: string[] }
  | { kind: "date-control"; url: string; page?: string; controlKind: HandleKind; handle: string }
  | {
      kind: "list-control";
      url: string;
      page?: string;
      controlKind: HandleKind;
      handle: string;
      source: string;
      column: string;
      multiple: DrawerToggle;
      nullOption: DrawerToggle;
      clear: DrawerToggle;
      search: DrawerToggle;
    }
  | { kind: "button"; url: string; page?: string; title: string }
  | { kind: "container"; url: string; page?: string; handle: string; titles: string[] }
  | {
      kind: "set-action";
      url: string;
      page?: string;
      title: string;
      into: string;
      column: string;
      controlKind: HandleKind;
      handle: string;
    }
  | { kind: "add-modal"; url: string; page?: string; name: string }
  | { kind: "add-drawer"; url: string; page?: string; name: string; settings: DrawerSettings }
  | { kind: "close-modal"; url: string; page?: string; title: string }
  | {
      kind: "if-else";
      url: string;
      page?: string;
      title: string;
      into: string;
      column: string;
      controlKind: HandleKind;
      handle: string;
      modal: string;
    }
  | { kind: "publish"; url: string; page?: string }
  | { kind: "add-column"; url: string; page?: string; title: string; columns: string[] }
  | { kind: "select-column"; url: string; page?: string; title: string; column: string; options: string[] }
  | { kind: "calc-column"; url: string; page?: string; title: string; column: string; formula: string }
  | {
      kind: "on-select";
      url: string;
      page?: string;
      title: string;
      column: string;
      controlKind: HandleKind;
      handle: string;
      fromColumn: string;
    }
  | {
      kind: "update-row";
      url: string;
      page?: string;
      title: string;
      into: string;
      column: string;
      controlKind: HandleKind;
      handle: string;
      matchKind: HandleKind;
      matchHandle: string;
    }
  | { kind: "group-column"; url: string; page?: string; title: string; column: string; withColumn: string };

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

function requireDrawerSize(value: string, flag: string): DrawerSize {
  if (value !== "small" && value !== "medium" && value !== "large") {
    fail(`add-drawer --${flag} must be small, medium, or large, not ${JSON.stringify(value)}`);
  }
  return value;
}

function requireOnOff(value: string, flag: string, command = "add-drawer"): DrawerToggle {
  if (value !== "on" && value !== "off") {
    fail(`${command} --${flag} must be on or off, not ${JSON.stringify(value)}`);
  }
  return value;
}

function requireSigmaFormula(formula: string): string {
  const text = formula.trim();
  if (!text) fail("add-column requires --formula");
  if (/\bCONCAT(?:ENATE)?\s*\(/i.test(text)) {
    fail(`add-column formula must be a Sigma formula, not ${JSON.stringify(text)}`);
  }
  const outside = text.replace(/\[[^\]]*\]/g, " ").replace(/"(?:[^"\\]|\\.)*"/g, " ");
  if (/(?:^|[^A-Z0-9_])\$?[A-Z]{1,3}\$?[0-9]{1,7}(?![A-Z0-9_(])/.test(outside)) {
    fail(`add-column formula must be a Sigma formula, not ${JSON.stringify(text)}`);
  }
  return text;
}

function requireBackground(value: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail(`add-drawer --background must be #rrggbb, not ${JSON.stringify(value)}`);
  }
  return value;
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
    requireSentenceCase(name, "add-page --name");
    return { kind: "add-page", url, page, name };
  }
  if (command === "add-modal") {
    allow(bag, ["url", "page", "name"]);
    const name = one(bag, "name");
    if (!name) fail("add-modal requires --name");
    requireSentenceCase(name, "add-modal --name");
    return { kind: "add-modal", url, page, name };
  }
  if (command === "add-drawer") {
    allow(bag, [
      "url",
      "page",
      "handle",
      "width",
      "spacing",
      "padding",
      "element-gap",
      "page-overlay",
      "background",
      "header",
      "close-icon",
    ]);
    const handle = one(bag, "handle");
    if (!handle) fail("add-drawer requires --handle");
    const name = drawerTitle(handle);
    const settings: DrawerSettings = {};
    const width = one(bag, "width");
    if (width !== undefined) settings.width = requireDrawerSize(width, "width");
    const spacing = one(bag, "spacing");
    if (spacing !== undefined) settings.spacing = requireDrawerSize(spacing, "spacing");
    const padding = one(bag, "padding");
    if (padding !== undefined) settings.padding = requireOnOff(padding, "padding");
    const elementGap = one(bag, "element-gap");
    if (elementGap !== undefined) settings.elementGap = requireOnOff(elementGap, "element-gap");
    const pageOverlay = one(bag, "page-overlay");
    if (pageOverlay !== undefined) settings.pageOverlay = requireOnOff(pageOverlay, "page-overlay");
    const background = one(bag, "background");
    if (background !== undefined) settings.background = requireBackground(background);
    const header = one(bag, "header");
    if (header !== undefined) settings.header = requireOnOff(header, "header");
    const closeIcon = one(bag, "close-icon");
    if (closeIcon !== undefined) settings.closeIcon = requireOnOff(closeIcon, "close-icon");
    return { kind: "add-drawer", url, page, name, settings };
  }
  if (command === "add") {
    const type = one(bag, "type");
    if (type === "input-table") {
      allow(bag, ["url", "page", "type", "title", "column"]);
      const title = one(bag, "title");
      if (!title) fail("add input-table requires --title");
      requireTableTitle(title);
      return { kind: "input-table", url, page, title, columns: inputColumns(bag.column ?? []) };
    }
    if (type === "control") {
      const control = one(bag, "control");
      if (control === "list") {
        allow(bag, [
          "url",
          "page",
          "type",
          "handle",
          "kind",
          "control",
          "source",
          "column",
          "multiple",
          "null-option",
          "clear",
          "search",
        ]);
        const handle = one(bag, "handle");
        if (!handle) fail("add control requires --handle");
        const controlKind = requireControlKind(one(bag, "kind"), "add control");
        const source = one(bag, "source");
        if (!source) fail("add control list requires --source");
        const column = one(bag, "column");
        if (!column) fail("add control list requires --column");
        const multiple = one(bag, "multiple");
        const nullOption = one(bag, "null-option");
        const clear = one(bag, "clear");
        const search = one(bag, "search");
        return {
          kind: "list-control",
          url,
          page,
          controlKind,
          handle,
          source,
          column,
          multiple: multiple === undefined ? "off" : requireOnOff(multiple, "multiple", "add control"),
          nullOption: nullOption === undefined ? "off" : requireOnOff(nullOption, "null-option", "add control"),
          clear: clear === undefined ? "on" : requireOnOff(clear, "clear", "add control"),
          search: search === undefined ? "off" : requireOnOff(search, "search", "add control"),
        };
      }
      if (control === "date") {
        allow(bag, ["url", "page", "type", "handle", "kind", "control"]);
        const handle = one(bag, "handle");
        if (!handle) fail("add control requires --handle");
        const controlKind = requireControlKind(one(bag, "kind"), "add control");
        return { kind: "date-control", url, page, controlKind, handle };
      }
      if (control === "segmented") {
        allow(bag, ["url", "page", "type", "handle", "kind", "control", "option"]);
        const handle = one(bag, "handle");
        if (!handle) fail("add control requires --handle");
        const controlKind = requireControlKind(one(bag, "kind"), "add control");
        const options = bag.option ?? [];
        if (options.length === 0) fail("add control requires --option");
        return { kind: "segmented", url, page, controlKind, handle, options };
      }
      if (control !== undefined) fail(`add control must be date, list, or segmented, not ${JSON.stringify(control)}`);
      allow(bag, ["url", "page", "type", "handle", "kind", "area"]);
      const handle = one(bag, "handle");
      if (!handle) fail("add control requires --handle");
      const controlKind = requireControlKind(one(bag, "kind"), "add control");
      const areaSpec = one(bag, "area");
      if (!areaSpec) return { kind: "control", url, page, controlKind, handle };
      let area: GridArea;
      try {
        area = parseArea(areaSpec);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
      return { kind: "control", url, page, controlKind, handle, area };
    }
    if (type === "button") {
      allow(bag, ["url", "page", "type", "title"]);
      const title = one(bag, "title");
      if (!title) fail("add button requires --title");
      requireSentenceCase(title, "add button --title");
      return { kind: "button", url, page, title };
    }
    if (type === "container") {
      allow(bag, ["url", "page", "type", "handle", "title"]);
      const handle = one(bag, "handle");
      if (!handle) fail("add container requires --handle");
      const titles = bag.title ?? [];
      if (titles.length === 0) fail("add container requires --title");
      return { kind: "container", url, page, handle, titles };
    }
    fail(`Unknown element type ${type ?? ""}. Known types: text, input-table, control, button, container`);
  }
  if (command === "group-column") {
    allow(bag, ["url", "page", "title", "column", "with"]);
    const title = one(bag, "title");
    if (!title) fail("group-column requires --title");
    const column = one(bag, "column");
    if (!column) fail("group-column requires --column");
    const withColumn = one(bag, "with");
    if (!withColumn) fail("group-column requires --with");
    return { kind: "group-column", url, page, title, column, withColumn };
  }
  if (command === "add-column") {
    const columnType = one(bag, "type");
    if (columnType === "calculation") {
      allow(bag, ["url", "page", "title", "column", "type", "formula"]);
      const title = one(bag, "title");
      if (!title) fail("add-column requires --title");
      const column = one(bag, "column");
      if (!column) fail("add-column requires --column");
      const formula = one(bag, "formula");
      if (!formula) fail("add-column requires --formula");
      return { kind: "calc-column", url, page, title, column, formula: requireSigmaFormula(formula) };
    }
    if (columnType === "single-select") {
      allow(bag, ["url", "page", "title", "column", "type", "option"]);
      const title = one(bag, "title");
      if (!title) fail("add-column requires --title");
      const column = one(bag, "column");
      if (!column) fail("add-column requires --column");
      const options = bag.option ?? [];
      if (options.length === 0) fail("add-column requires --option");
      return { kind: "select-column", url, page, title, column, options };
    }
    if (columnType !== undefined) {
      fail(`add-column type must be single-select or calculation, not ${JSON.stringify(columnType)}`);
    }
    allow(bag, ["url", "page", "title", "column"]);
    const title = one(bag, "title");
    if (!title) fail("add-column requires --title");
    const columns = bag.column ?? [];
    if (columns.length === 0) fail("add-column requires --column");
    const seen = new Set<string>();
    for (const column of columns) {
      if (seen.has(column)) fail(`Duplicate --column ${column}`);
      seen.add(column);
      requireSystemColumn(column);
    }
    return { kind: "add-column", url, page, title, columns };
  }
  if (command === "set-action") {
    const title = one(bag, "title");
    if (!title) fail("set-action requires --title");
    const effect = one(bag, "effect");
    const onSelect = one(bag, "on-select");
    if (onSelect !== undefined || effect === "set-control") {
      allow(bag, ["url", "page", "title", "on-select", "effect", "kind", "handle", "from-column"]);
      if (!onSelect) fail("set-action requires --on-select");
      if (effect !== "set-control") fail("set-action requires --effect set-control");
      const controlKind = requireControlKind(one(bag, "kind"), "set-action");
      const handle = one(bag, "handle");
      if (!handle) fail("set-action requires --handle");
      const fromColumn = one(bag, "from-column");
      if (!fromColumn) fail("set-action requires --from-column");
      return { kind: "on-select", url, page, title, column: onSelect, controlKind, handle, fromColumn };
    }
    if (effect === "update-row") {
      allow(bag, ["url", "page", "title", "effect", "into", "column", "kind", "from-handle", "match-kind", "match-handle"]);
      const into = one(bag, "into");
      if (!into) fail("set-action requires --into");
      const column = one(bag, "column");
      if (!column) fail("set-action requires --column");
      const controlKind = requireControlKind(one(bag, "kind"), "set-action");
      const handle = one(bag, "from-handle");
      if (!handle) fail("set-action requires --from-handle");
      const matchValue = one(bag, "match-kind");
      if (matchValue !== "c" && matchValue !== "v") fail("set-action requires --match-kind c or --match-kind v");
      const matchHandle = one(bag, "match-handle");
      if (!matchHandle) fail("set-action requires --match-handle");
      return {
        kind: "update-row",
        url,
        page,
        title,
        into,
        column,
        controlKind,
        handle,
        matchKind: matchValue,
        matchHandle,
      };
    }
    if (effect === "close-modal") {
      allow(bag, ["url", "page", "title", "effect"]);
      return { kind: "close-modal", url, page, title };
    }
    if (effect === "if-else") {
      allow(bag, ["url", "page", "title", "effect", "into", "column", "from-handle", "kind", "modal"]);
      const into = one(bag, "into");
      if (!into) fail("set-action requires --into");
      const column = one(bag, "column");
      if (!column) fail("set-action requires --column");
      const handle = one(bag, "from-handle");
      if (!handle) fail("set-action requires --from-handle");
      const controlKind = requireControlKind(one(bag, "kind"), "set-action");
      const modal = one(bag, "modal");
      if (!modal) fail("set-action requires --modal");
      return { kind: "if-else", url, page, title, into, column, controlKind, handle, modal };
    }
    allow(bag, ["url", "page", "title", "effect", "into", "column", "from-handle", "kind"]);
    if (effect !== "insert-row") fail("set-action requires --effect insert-row, close-modal, or if-else");
    const into = one(bag, "into");
    if (!into) fail("set-action requires --into");
    const column = one(bag, "column");
    if (!column) fail("set-action requires --column");
    const handle = one(bag, "from-handle");
    if (!handle) fail("set-action requires --from-handle");
    const controlKind = requireControlKind(one(bag, "kind"), "set-action");
    return { kind: "set-action", url, page, title, into, column, controlKind, handle };
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
    else if (parsed.kind === "add-modal") await addNamedModal(editor, parsed.name);
    else if (parsed.kind === "add-drawer") await addNamedDrawer(editor, parsed.name, parsed.settings);
    else if (parsed.kind === "input-table") await addEmptyInputTable(editor, parsed.title, parsed.columns);
    else if (parsed.kind === "control") {
      await addNameControl(editor, parsed.controlKind, parsed.handle, parsed.area);
    }
    else if (parsed.kind === "date-control") await addDateControl(editor, parsed.controlKind, parsed.handle);
    else if (parsed.kind === "list-control") {
      await addListControl(
        editor,
        parsed.controlKind,
        parsed.handle,
        parsed.source,
        parsed.column,
        parsed.multiple,
        parsed.nullOption,
        parsed.clear,
        parsed.search,
      );
    }
    else if (parsed.kind === "segmented") {
      await addSegmentedControl(editor, parsed.controlKind, parsed.handle, parsed.options);
    }
    else if (parsed.kind === "button") await addNamedButton(editor, parsed.title);
    else if (parsed.kind === "container") await addNamedContainer(editor, parsed.handle, parsed.titles);
    else if (parsed.kind === "close-modal") await saveCloseModal(editor, parsed.title);
    else if (parsed.kind === "if-else") {
      await saveIfElse(
        editor,
        parsed.title,
        parsed.into,
        parsed.column,
        parsed.controlKind,
        parsed.handle,
        parsed.modal,
      );
    } else if (parsed.kind === "set-action") {
      await saveInsertAction(editor, parsed.title, parsed.into, parsed.column, parsed.controlKind, parsed.handle);
    } else if (parsed.kind === "group-column") {
      await groupIntoExisting(editor, parsed.title, parsed.column, parsed.withColumn);
    } else if (parsed.kind === "add-column") {
      await addSystemColumns(editor, parsed.title, parsed.columns);
    } else if (parsed.kind === "select-column") {
      await addSelectColumn(editor, parsed.title, parsed.column, parsed.options);
    } else if (parsed.kind === "calc-column") {
      await addCalculatedColumn(editor, parsed.title, parsed.column, parsed.formula);
    } else if (parsed.kind === "update-row") {
      await saveUpdateRow(
        editor,
        parsed.title,
        parsed.into,
        parsed.column,
        parsed.controlKind,
        parsed.handle,
        parsed.matchKind,
        parsed.matchHandle,
      );
    } else if (parsed.kind === "on-select") {
      await saveOnSelectControl(
        editor,
        parsed.title,
        parsed.column,
        parsed.controlKind,
        parsed.handle,
        parsed.fromColumn,
      );
    } else await publishWorkbook(editor);
  } catch (error) {
    if (error instanceof Error && error.name === "Exit") throw error;
    fail(error instanceof Error ? error.message : String(error));
  }
  mark();
}

export async function runCreate(command: string, args: string[]): Promise<void> {
  const parsed = parseCreate(command, args);
  await withChrome(parsed.url, async (page) => {
    await ensureEditor(page, parsed.url, parsed.page);
    const editor = workbookEditor(page);
    await applyCreate(editor, parsed, () => {
      const segment = pathSegmentFromUrl(page.url());
      const identity: Omit<OwnedWorkbook, "markedAt"> = { ...workbookIdentity(segment), pathSegment: segment };
      markOwned(identity);
    });
    console.log(page.url());
  });
}
