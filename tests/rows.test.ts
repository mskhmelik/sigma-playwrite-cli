import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import {
  deleteOneRow,
  editOneCell,
  insertManyRows,
  insertOneRow,
} from "../dist/effects/rows.js";

const INPUT = "BE - Input - DIM_ITEMS";
const ROWS = [
  ["SKU-1", "Widget"],
  ["SKU-2", "Gadget"],
];

function recordingEditor(
  found: { title: string; inputTable: boolean } | { reject: Error },
): Editor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async findPage(name) {
      calls.push(`findPage:${name}`);
    },
    async findElement(title) {
      calls.push(`findElement:${title}`);
      if ("reject" in found) throw found.reject;
      return found;
    },
    async setControl(title, value) {
      calls.push(`setControl:${title}:${value}`);
    },
    async clearControl(title) {
      calls.push(`clearControl:${title}`);
    },
    async clearPageControls(page) {
      calls.push(`clearPageControls:${page}`);
    },
    async openModal(page) {
      calls.push(`openModal:${page}`);
    },
    async insertRow(title) {
      calls.push(`insertRow:${title}`);
    },
    async insertRows(title, rows) {
      calls.push(`insertRows:${title}:${JSON.stringify(rows)}`);
    },
    async editCell(title, column, value) {
      calls.push(`editCell:${title}:${column}:${value}`);
    },
    async deleteRow(title) {
      calls.push(`deleteRow:${title}`);
    },
    async styleModalPage() {},
    async ensureModalSentence() {
      return "";
    },
    async ensureModalButton() {
      return "";
    },
    async stackModalBody() {},
  };
}

test("insertOneRow finds the element and inserts one row", async () => {
  const editor = recordingEditor({ title: INPUT, inputTable: true });
  await insertOneRow(editor, INPUT);
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`, `insertRow:${INPUT}`]);
});

test("insertOneRow refuses FCT_SALES when it is not an input table", async () => {
  const editor = recordingEditor({ title: "FCT_SALES", inputTable: false });
  await assert.rejects(() => insertOneRow(editor, "FCT_SALES"), /not an input table/);
  assert.deepEqual(editor.calls, ["findElement:FCT_SALES"]);
});

test("insertOneRow propagates a findElement rejection and does not insert", async () => {
  const missing = new Error("canvas has no such element");
  const editor = recordingEditor({ reject: missing });
  await assert.rejects(() => insertOneRow(editor, INPUT), (error) => error === missing);
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`]);
});

test("insertManyRows finds the element and inserts the given rows", async () => {
  const editor = recordingEditor({ title: INPUT, inputTable: true });
  await insertManyRows(editor, INPUT, ROWS);
  assert.deepEqual(editor.calls, [
    `findElement:${INPUT}`,
    `insertRows:${INPUT}:${JSON.stringify(ROWS)}`,
  ]);
});

test("insertManyRows refuses FCT_SALES when it is not an input table", async () => {
  const editor = recordingEditor({ title: "FCT_SALES", inputTable: false });
  await assert.rejects(
    () => insertManyRows(editor, "FCT_SALES", ROWS),
    /not an input table/,
  );
  assert.deepEqual(editor.calls, ["findElement:FCT_SALES"]);
});

test("insertManyRows propagates a findElement rejection and does not insert", async () => {
  const missing = new Error("canvas has no such element");
  const editor = recordingEditor({ reject: missing });
  await assert.rejects(
    () => insertManyRows(editor, INPUT, ROWS),
    (error) => error === missing,
  );
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`]);
});

test("editOneCell finds the element and edits the cell", async () => {
  const editor = recordingEditor({ title: INPUT, inputTable: true });
  await editOneCell(editor, INPUT, "Name", "Widget");
  assert.deepEqual(editor.calls, [
    `findElement:${INPUT}`,
    `editCell:${INPUT}:Name:Widget`,
  ]);
});

test("editOneCell refuses FCT_SALES when it is not an input table", async () => {
  const editor = recordingEditor({ title: "FCT_SALES", inputTable: false });
  await assert.rejects(
    () => editOneCell(editor, "FCT_SALES", "Name", "Widget"),
    /not an input table/,
  );
  assert.deepEqual(editor.calls, ["findElement:FCT_SALES"]);
});

test("editOneCell propagates a findElement rejection and does not edit", async () => {
  const missing = new Error("canvas has no such element");
  const editor = recordingEditor({ reject: missing });
  await assert.rejects(
    () => editOneCell(editor, INPUT, "Name", "Widget"),
    (error) => error === missing,
  );
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`]);
});

test("deleteOneRow finds the element and deletes one row", async () => {
  const editor = recordingEditor({ title: INPUT, inputTable: true });
  await deleteOneRow(editor, INPUT);
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`, `deleteRow:${INPUT}`]);
});

test("deleteOneRow refuses FCT_SALES when it is not an input table", async () => {
  const editor = recordingEditor({ title: "FCT_SALES", inputTable: false });
  await assert.rejects(() => deleteOneRow(editor, "FCT_SALES"), /not an input table/);
  assert.deepEqual(editor.calls, ["findElement:FCT_SALES"]);
});

test("deleteOneRow propagates a findElement rejection and does not delete", async () => {
  const missing = new Error("canvas has no such element");
  const editor = recordingEditor({ reject: missing });
  await assert.rejects(() => deleteOneRow(editor, INPUT), (error) => error === missing);
  assert.deepEqual(editor.calls, [`findElement:${INPUT}`]);
});
