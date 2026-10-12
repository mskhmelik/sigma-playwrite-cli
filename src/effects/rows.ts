import type { Editor } from "../editor.js";

async function requireInputTable(editor: Editor, title: string): Promise<void> {
  const element = await editor.findElement(title);
  if (!element.inputTable) throw new Error("not an input table");
}

export async function insertOneRow(editor: Editor, title: string): Promise<void> {
  await requireInputTable(editor, title);
  await editor.insertRow(title);
}

export async function insertManyRows(
  editor: Editor,
  title: string,
  rows: string[][],
): Promise<void> {
  await requireInputTable(editor, title);
  await editor.insertRows(title, rows);
}

export async function editOneCell(
  editor: Editor,
  title: string,
  column: string,
  value: string,
): Promise<void> {
  await requireInputTable(editor, title);
  await editor.editCell(title, column, value);
}

export async function deleteOneRow(editor: Editor, title: string): Promise<void> {
  await requireInputTable(editor, title);
  await editor.deleteRow(title);
}
