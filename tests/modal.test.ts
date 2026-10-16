import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { openModalPage } from "../dist/effects/modal.js";

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
    styleModalPage: async (header) => {
      calls.push(`styleModalPage:${header}`);
    },
    ensureModalSentence: async (sentence) => {
      calls.push(`ensureModalSentence:${sentence}`);
      return "";
    },
    ensureModalButton: async (label) => {
      calls.push(`ensureModalButton:${label}`);
      return "";
    },
    stackModalBody: async () => {},
    addContainer: async () => {},
    hasContainer: async () => false,
    addTypedColumn: async () => {},
    addCalculation: async () => {},
    addDrawer: async () => {},
    addDateControl: async () => {},
    addListControl: async () => {},
  };
  return { editor, calls };
}

test("a missing page is rejected and the modal stays closed", async () => {
  const { editor, calls } = pageEditor(async () => {
    throw new Error("page not on canvas");
  });
  await assert.rejects(() => openModalPage(editor, "Orders"), /missing page/);
  assert.deepEqual(calls, ["findPage:Orders"]);
});

test("an existing page opens its modal", async () => {
  const { editor, calls } = pageEditor(async () => {});
  await openModalPage(editor, "Orders");
  assert.deepEqual(calls, ["findPage:Orders", "openModal:Orders"]);
});
