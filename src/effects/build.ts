import type { Editor } from "../editor.js";
import { groupingLanded, planGrouping } from "../grouping.js";
import { containerBorder, cornerRadius } from "../container.js";
import { controlTitle, containerTitle, type HandleKind } from "../handles.js";
import { columnTitle } from "../system-columns.js";

export async function addNamedPage(editor: Editor, name: string): Promise<void> {
  const page = name.trim();
  if (!page) throw new Error("missing page");
  try {
    await editor.findPage(page);
  } catch {
    await editor.addPage(page);
    return;
  }
  throw new Error("duplicate page");
}

export async function addEmptyInputTable(
  editor: Editor,
  title: string,
  columns: { name: string; type: "text" | "date" }[],
): Promise<void> {
  const first = columns[0];
  let found: { inputTable: boolean };
  try {
    found = await editor.findElement(title);
  } catch {
    if (!first || first.type !== "text") throw new Error("first column must be text");
    await editor.addInputTable(title, first.name);
    for (const column of columns.slice(1)) {
      await editor.addTypedColumn(title, column.name, column.type);
    }
    return;
  }
  if (!found.inputTable) throw new Error("not an input table");
  const present = await editor.listColumns(title);
  for (const column of columns) {
    if (present.includes(column.name)) continue;
    await editor.addTypedColumn(title, column.name, column.type);
  }
}

export async function addNameControl(editor: Editor, kind: HandleKind, handle: string): Promise<void> {
  await editor.addTextControl(controlTitle(kind, handle));
}

export async function addNamedButton(editor: Editor, title: string): Promise<void> {
  if (!title.trim()) throw new Error("missing title");
  await editor.addButton(title);
}

export async function addNamedContainer(editor: Editor, handle: string, titles: string[]): Promise<void> {
  const title = containerTitle(handle);
  if (await editor.hasContainer(title)) return;
  for (const element of titles) {
    try {
      await editor.findElement(element);
    } catch {
      throw new Error("missing title");
    }
  }
  await editor.addContainer(titles, title, containerBorder, cornerRadius("Pill"));
}

export async function saveInsertAction(
  editor: Editor,
  button: string,
  table: string,
  column: string,
  kind: HandleKind,
  handle: string,
): Promise<void> {
  try {
    await editor.findElement(button);
  } catch {
    throw new Error("missing title");
  }
  const target = await editor.findElement(table);
  if (!target.inputTable) throw new Error("not an input table");
  await editor.setInsertAction(button, table, column, controlTitle(kind, handle));
}

export async function publishWorkbook(editor: Editor): Promise<void> {
  await editor.publish();
}

/** Puts `column` on the grouping that already holds `withColumn`. */
export async function groupIntoExisting(
  editor: Editor,
  title: string,
  column: string,
  withColumn: string,
): Promise<void> {
  await editor.findElement(title);
  const before = await editor.groupingKeys(title);
  const plan = planGrouping(before, column, withColumn);
  if (plan.action === "refuse") throw new Error(plan.reason);
  if (plan.action === "already") return;
  await editor.groupWith(title, column, withColumn);
  const after = await editor.groupingKeys(title);
  const problem = groupingLanded(before, after, column, withColumn);
  if (problem) throw new Error(problem);
}

/** Adds each system column that is not already a header. */
export async function addSystemColumns(editor: Editor, title: string, columns: string[]): Promise<void> {
  const target = await editor.findElement(title);
  if (!target.inputTable) throw new Error("not an input table");
  const present = await editor.listColumns(title);
  for (const column of columns) {
    const visible = columnTitle(column);
    if (present.includes(column) || present.includes(visible)) continue;
    await editor.addSystemColumn(title, column);
    present.push(visible);
  }
}

/** Adds a single-select column when that name is not already a header. */
export async function addSelectColumn(
  editor: Editor,
  title: string,
  column: string,
  options: string[],
): Promise<void> {
  const target = await editor.findElement(title);
  if (!target.inputTable) throw new Error("not an input table");
  const present = await editor.listColumns(title);
  if (present.includes(column)) return;
  await editor.addSelectColumn(title, column, options);
}

/** Adds a segmented control when that canvas title is not already on the page. */
export async function addSegmentedControl(
  editor: Editor,
  kind: HandleKind,
  handle: string,
  options: string[],
): Promise<void> {
  const title = controlTitle(kind, handle);
  try {
    await editor.findElement(title);
    return;
  } catch {
    await editor.addSegmentedControl(title, options);
  }
}

/**
 * On click, update one row: match `matchKind.matchHandle`, write `kind.handle` into `column`.
 */
export async function saveUpdateRow(
  editor: Editor,
  button: string,
  table: string,
  column: string,
  kind: HandleKind,
  handle: string,
  matchKind: HandleKind,
  matchHandle: string,
): Promise<void> {
  try {
    await editor.findElement(button);
  } catch {
    throw new Error("missing title");
  }
  const target = await editor.findElement(table);
  if (!target.inputTable) throw new Error("not an input table");
  const valueControl = controlTitle(kind, handle);
  const rowIdControl = controlTitle(matchKind, matchHandle);
  try {
    await editor.findElement(valueControl);
  } catch {
    throw new Error("missing handle");
  }
  try {
    await editor.findElement(rowIdControl);
  } catch {
    throw new Error("missing handle");
  }
  const present = await editor.listColumns(table);
  if (!present.includes(column)) throw new Error("missing column");
  await editor.setUpdateRow(button, table, column, valueControl, rowIdControl);
}

/** On select of one column, replace the control with that row's source column. */
export async function saveOnSelectControl(
  editor: Editor,
  table: string,
  clickColumn: string,
  kind: HandleKind,
  handle: string,
  sourceColumn: string,
): Promise<void> {
  const target = await editor.findElement(table);
  if (!target.inputTable) throw new Error("not an input table");
  const control = controlTitle(kind, handle);
  try {
    await editor.findElement(control);
  } catch {
    throw new Error("missing handle");
  }
  const present = await editor.listColumns(table);
  const source = columnTitle(sourceColumn);
  if (!present.includes(clickColumn) || (!present.includes(sourceColumn) && !present.includes(source))) {
    throw new Error("missing column");
  }
  await editor.setOnSelectControl(table, clickColumn, control, source);
}

export function duplicateFormula(table: string, column: string, control: string): string {
  const columnRef = `[${table}/${column}]`;
  return `IsNotNull(Lookup(${columnRef}, [${control}], ${columnRef}))`;
}

export async function addNamedModal(editor: Editor, name: string): Promise<void> {
  const page = name.trim();
  if (!page) throw new Error("missing page");
  try {
    await editor.findPage(page);
  } catch {
    await editor.addModal(page);
    return;
  }
  throw new Error("duplicate page");
}

export async function saveCloseModal(editor: Editor, button: string): Promise<void> {
  try {
    await editor.findElement(button);
  } catch {
    throw new Error("missing title");
  }
  await editor.setCloseModal(button);
}

export async function saveIfElse(
  editor: Editor,
  button: string,
  table: string,
  column: string,
  kind: HandleKind,
  handle: string,
  modal: string,
): Promise<void> {
  try {
    await editor.findElement(button);
  } catch {
    throw new Error("missing title");
  }
  const target = await editor.findElement(table);
  if (!target.inputTable) throw new Error("not an input table");
  try {
    await editor.findPage(modal);
  } catch {
    throw new Error("missing page");
  }
  const control = controlTitle(kind, handle);
  await editor.setIfElse(button, table, column, control, modal, duplicateFormula(table, column, control));
}
