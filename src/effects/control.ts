import type { Editor, ValueSource } from "../editor.js";
import { controlTitle, type HandleKind } from "../handles.js";

type Lookup = {
  control: (kind: HandleKind, handle: string) => Promise<string>;
  column: (column: string) => Promise<string>;
};

async function resolveValue(source: ValueSource, lookup: Lookup): Promise<string> {
  if (source.kind === "static") return source.text;
  if (source.kind === "control") return lookup.control(source.controlKind, source.handle);
  return lookup.column(source.column);
}

async function requireElement(editor: Editor, kind: HandleKind, handle: string): Promise<string> {
  const title = controlTitle(kind, handle);
  try {
    await editor.findElement(title);
  } catch {
    throw new Error("missing handle");
  }
  return title;
}

export async function writeControl(
  editor: Editor,
  kind: HandleKind,
  handle: string,
  source: ValueSource,
  lookup: Lookup,
): Promise<void> {
  const value = await resolveValue(source, lookup);
  const title = await requireElement(editor, kind, handle);
  await editor.setControl(title, value);
}

export async function clearOneControl(editor: Editor, kind: HandleKind, handle: string): Promise<void> {
  const title = await requireElement(editor, kind, handle);
  await editor.clearControl(title);
}

export async function clearEveryControl(editor: Editor, page: string): Promise<void> {
  await editor.clearPageControls(page);
}
