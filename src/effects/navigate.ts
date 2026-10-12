import type { Editor } from "../editor.js";

export async function navigateTo(editor: Editor, destination: string): Promise<void> {
  try {
    await editor.findPage(destination);
  } catch {
    throw new Error("missing page");
  }
}
