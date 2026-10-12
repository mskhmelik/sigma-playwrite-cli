import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import {
  addEmptyInputTable,
  addNameControl,
  addNamedButton,
  addNamedPage,
  saveInsertAction,
} from "../dist/effects/build.js";

function buildEditor(pages: string[]): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor: Editor = {
    findPage: async (name) => {
      calls.push(`findPage:${name}`);
      if (!pages.includes(name)) throw new Error("page not on canvas");
    },
    findElement: async (title) => {
      calls.push(`findElement:${title}`);
      if (title === "missing") throw new Error("not on the page");
      return { title, inputTable: title === "names" };
    },
    setControl: async () => {},
    clearControl: async () => {},
    clearPageControls: async () => {},
    openModal: async () => {},
    insertRow: async () => {},
    insertRows: async () => {},
    editCell: async () => {},
    deleteRow: async () => {},
    addPage: async (name) => {
      calls.push(`addPage:${name}`);
    },
    addInputTable: async (title, column) => {
      calls.push(`addInputTable:${title}:${column}`);
    },
    addTextControl: async (title) => {
      calls.push(`addTextControl:${title}`);
    },
    addButton: async (title) => {
      calls.push(`addButton:${title}`);
    },
    setInsertAction: async (button, table, column, controlTitle) => {
      calls.push(`setInsertAction:${button}:${table}:${column}:${controlTitle}`);
    },
  };
  return { editor, calls };
}

test("addNamedPage creates a page that is not already there", async () => {
  const { editor, calls } = buildEditor(["Data"]);
  await addNamedPage(editor, "test");
  assert.deepEqual(calls, ["findPage:test", "addPage:test"]);
});

test("addNamedPage stops when the page already exists", async () => {
  const { editor, calls } = buildEditor(["test"]);
  await assert.rejects(() => addNamedPage(editor, "test"), /duplicate page/);
  assert.deepEqual(calls, ["findPage:test"]);
});

test("addEmptyInputTable asks for an empty table and its text column", async () => {
  const { editor, calls } = buildEditor([]);
  await addEmptyInputTable(editor, "names", "name");
  assert.deepEqual(calls, ["addInputTable:names:name"]);
});

test("addNameControl titles the text input v.<handle>", async () => {
  const { editor, calls } = buildEditor([]);
  await addNameControl(editor, "name");
  assert.deepEqual(calls, ["addTextControl:v.name"]);
});

test("addNamedButton asks for the button title", async () => {
  const { editor, calls } = buildEditor([]);
  await addNamedButton(editor, "Add");
  assert.deepEqual(calls, ["addButton:Add"]);
});

test("saveInsertAction stores insert-row from the control onto an input table", async () => {
  const { editor, calls } = buildEditor([]);
  await saveInsertAction(editor, "Add", "names", "name", "name");
  assert.deepEqual(calls, [
    "findElement:Add",
    "findElement:names",
    "setInsertAction:Add:names:name:v.name",
  ]);
});

test("saveInsertAction does not save when the button is missing", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveInsertAction(editor, "missing", "names", "name", "name"), /missing title/);
  assert.deepEqual(calls, ["findElement:missing"]);
});

test("saveInsertAction refuses a table that is not an input table", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveInsertAction(editor, "Add", "FCT_SALES", "name", "name"), /not an input table/);
  assert.ok(!calls.some((call) => call.startsWith("setInsertAction")));
});
