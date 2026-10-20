import type { Editor } from "../editor.js";

const sentenceArea = { rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 13 };
const buttonArea = { rowStart: 3, colStart: 1, rowEnd: 4, colEnd: 13 };

export async function openModalPage(editor: Editor, page: string): Promise<void> {
  try {
    await editor.findPage(page);
  } catch {
    throw new Error("missing page");
  }
  await editor.openModal(page);
}

/** Format an existing modal. Does not add the if/else duplicate check. */
export async function styleModal(
  editor: Editor,
  page: string,
  header: string,
  sentence: string,
  button: string,
): Promise<void> {
  try {
    await editor.findPage(page);
  } catch {
    throw new Error("missing page");
  }
  await editor.styleModalPage(header);
  const sentenceId = await editor.ensureModalSentence(sentence);
  const buttonId = await editor.ensureModalButton(button);
  await editor.stackModalBody(sentenceId, sentenceArea, buttonId, buttonArea);
}
