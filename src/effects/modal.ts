import type { Editor } from "../editor.js";

export async function openModalPage(editor: Editor, page: string): Promise<void> {
  try {
    await editor.findPage(page);
  } catch {
    throw new Error("missing page");
  }
  await editor.openModal(page);
}
