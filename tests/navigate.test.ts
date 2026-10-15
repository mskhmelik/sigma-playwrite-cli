import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { navigateTo } from "../dist/effects/navigate.js";

function pageEditor(
  findPage: (name: string) => Promise<void>,
): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push(args.length ? `${name}:${String(args[0])}` : name);
    };
  const editor: Editor = {
    findPage: async (name) => {
      calls.push(`findPage:${name}`);
      await findPage(name);
    },
    findElement: async (title) => {
      calls.push(`findElement:${title}`);
      return { title, inputTable: false };
    },
    setControl: record("setControl"),
    clearControl: record("clearControl"),
    clearPageControls: record("clearPageControls"),
    openModal: record("openModal"),
    insertRow: record("insertRow"),
    insertRows: record("insertRows"),
    editCell: record("editCell"),
    deleteRow: record("deleteRow"),
    styleModalPage: async () => {},
    ensureModalSentence: async () => "",
    ensureModalButton: async () => "",
    stackModalBody: async () => {},
    addContainer: async () => {},
    hasContainer: async () => false,
    addTypedColumn: async () => {},
  };
  return { editor, calls };
}

test("navigateTo finds the destination page", async () => {
  const { editor, calls } = pageEditor(async () => {});
  await navigateTo(editor, "Orders");
  assert.deepEqual(calls, ["findPage:Orders"]);
});

test("a missing destination page is reported and nothing else runs", async () => {
  const { editor, calls } = pageEditor(async () => {
    throw new Error("page not on canvas");
  });
  await assert.rejects(() => navigateTo(editor, "Missing"), /missing page/);
  assert.deepEqual(calls, ["findPage:Missing"]);
});
