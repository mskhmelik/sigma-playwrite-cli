import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { styleModal } from "../dist/effects/modal.js";

function modalEditor(findPage: (name: string) => Promise<void>): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor: Editor = {
    findPage: async (name) => {
      calls.push(`findPage:${name}`);
      await findPage(name);
    },
    findElement: async (title) => {
      calls.push(`findElement:${title}`);
      return { title, inputTable: false };
    },
    setControl: async () => {},
    clearControl: async () => {},
    clearPageControls: async () => {},
    openModal: async () => {},
    insertRow: async () => {},
    insertRows: async () => {},
    editCell: async () => {},
    deleteRow: async () => {},
    addPage: async () => {},
    addInputTable: async () => {},
    addTypedColumn: async () => {},
    addTextControl: async () => {},
    addButton: async () => {},
    addModal: async () => {},
    addCalculation: async () => {},
    addDrawer: async () => {},
    addDateControl: async () => {},
    addListControl: async () => {},
    setInsertAction: async () => {},
    setCloseModal: async () => {},
    setIfElse: async () => {},
    publish: async () => {},
    styleModalPage: async (header) => {
      calls.push(`styleModalPage:${header}`);
    },
    ensureModalSentence: async (sentence) => {
      calls.push(`ensureModalSentence:${sentence}`);
      return "sentence-id";
    },
    ensureModalButton: async (label) => {
      calls.push(`ensureModalButton:${label}`);
      return "button-id";
    },
    stackModalBody: async (sentenceId, sentenceArea, buttonId, buttonArea) => {
      calls.push(
        `stack:${sentenceId}:${sentenceArea.rowStart}-${sentenceArea.rowEnd}:${sentenceArea.colStart}-${sentenceArea.colEnd}:${buttonId}:${buttonArea.rowStart}-${buttonArea.rowEnd}:${buttonArea.colStart}-${buttonArea.colEnd}`,
      );
    },
    addContainer: async () => {},
    hasContainer: async () => false,
  };
  return { editor, calls };
}

test("a missing page is rejected before the modal is styled", async () => {
  const { editor, calls } = modalEditor(async () => {
    throw new Error("page not on canvas");
  });
  await assert.rejects(
    () => styleModal(editor, "Error", "⛔️ Error", "This name already exists!", "I will create a new name"),
    /missing page/,
  );
  assert.deepEqual(calls, ["findPage:Error"]);
});

test("styleModal formats the page and stacks the sentence above the button", async () => {
  const { editor, calls } = modalEditor(async () => {});
  await styleModal(editor, "Error", "⛔️ Error", "This name already exists!", "I will create a new name");
  assert.deepEqual(calls, [
    "findPage:Error",
    "styleModalPage:⛔️ Error",
    "ensureModalSentence:This name already exists!",
    "ensureModalButton:I will create a new name",
    "stack:sentence-id:1-3:1-13:button-id:3-4:1-13",
  ]);
});
