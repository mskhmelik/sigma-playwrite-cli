import type { Editor } from "../editor.js";
import { controlTitle } from "../handles.js";

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

export async function addEmptyInputTable(editor: Editor, title: string, column: string): Promise<void> {
  if (!title.trim()) throw new Error("missing title");
  if (!column.trim()) throw new Error("missing column");
  await editor.addInputTable(title, column);
}

export async function addNameControl(editor: Editor, handle: string): Promise<void> {
  await editor.addTextControl(controlTitle("variable", handle));
}

export async function addNamedButton(editor: Editor, title: string): Promise<void> {
  if (!title.trim()) throw new Error("missing title");
  await editor.addButton(title);
}

export async function saveInsertAction(
  editor: Editor,
  button: string,
  table: string,
  column: string,
  handle: string,
): Promise<void> {
  try {
    await editor.findElement(button);
  } catch {
    throw new Error("missing title");
  }
  const target = await editor.findElement(table);
  if (!target.inputTable) throw new Error("not an input table");
  await editor.setInsertAction(button, table, column, controlTitle("variable", handle));
}

export async function publishWorkbook(editor: Editor): Promise<void> {
  await editor.publish();
}
