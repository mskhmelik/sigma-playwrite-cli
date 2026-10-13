import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import {
  addSegmentedControl,
  addSelectColumn,
  addSystemColumns,
  saveOnSelectControl,
  saveUpdateRow,
} from "../dist/effects/build.js";

function columnEditor(options: {
  inputTable: boolean;
  columns: string[];
  controls?: string[];
}): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const controls = options.controls ?? [];
  const editor: Editor = {
    findPage: async () => {},
    findElement: async (title) => {
      calls.push(`findElement:${title}`);
      if (title === "names") return { title, inputTable: options.inputTable };
      if (title === "Save status" || controls.includes(title)) return { title, inputTable: false };
      throw new Error("not on the page");
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
    addTextControl: async () => {},
    addSegmentedControl: async (title, options) => {
      calls.push(`addSegmentedControl:${title}:${options.join(",")}`);
    },
    addSelectColumn: async (title, column, options) => {
      calls.push(`addSelectColumn:${title}:${column}:${options.join(",")}`);
    },
    setUpdateRow: async (button, table, column, valueControl, rowIdControl) => {
      calls.push(`setUpdateRow:${table}:${column}:${valueControl}:${rowIdControl}:${button}`);
    },
    addButton: async () => {},
    addModal: async () => {},
    setInsertAction: async () => {},
    setCloseModal: async () => {},
    setIfElse: async () => {},
    publish: async () => {},
    styleModalPage: async () => {},
    ensureModalSentence: async () => "",
    ensureModalButton: async () => "",
    stackModalBody: async () => {},
    listColumns: async (title) => {
      calls.push(`listColumns:${title}`);
      return [...options.columns];
    },
    addSystemColumn: async (title, column) => {
      calls.push(`addSystemColumn:${title}:${column}`);
    },
    setOnSelectControl: async (table, clickColumn, controlTitle, sourceColumn) => {
      calls.push(`setOnSelectControl:${table}:${clickColumn}:${controlTitle}:${sourceColumn}`);
    },
  };
  return { editor, calls };
}

test("addSystemColumns adds a system column that is not already visible", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name"] });
  await addSystemColumns(editor, "names", ["Row ID", "Created at"]);
  assert.deepEqual(calls, [
    "findElement:names",
    "listColumns:names",
    "addSystemColumn:names:Row ID",
    "addSystemColumn:names:Created at",
  ]);
});

test("addSystemColumns leaves a column that is already visible", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name", "ID"] });
  await addSystemColumns(editor, "names", ["Row ID"]);
  assert.deepEqual(calls, ["findElement:names", "listColumns:names"]);
});

test("addSystemColumns refuses a table that is not an input table", async () => {
  const { editor, calls } = columnEditor({ inputTable: false, columns: ["name"] });
  await assert.rejects(() => addSystemColumns(editor, "names", ["Row ID"]), /not an input table/);
  assert.ok(!calls.some((call) => call.startsWith("addSystemColumn")));
});

test("saveOnSelectControl replaces the control from the source column", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name", "ID"],
    controls: ["v.id_name_selected"],
  });
  await saveOnSelectControl(editor, "names", "name", "v", "id_name_selected", "Row ID");
  assert.deepEqual(calls, [
    "findElement:names",
    "findElement:v.id_name_selected",
    "listColumns:names",
    "setOnSelectControl:names:name:v.id_name_selected:ID",
  ]);
});

test("saveOnSelectControl does not save when the control is missing", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name", "ID"] });
  await assert.rejects(
    () => saveOnSelectControl(editor, "names", "name", "v", "id_name_selected", "Row ID"),
    /missing handle/,
  );
  assert.ok(!calls.some((call) => call.startsWith("setOnSelectControl")));
});

test("addSelectColumn adds a single-select column that is not already visible", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name"] });
  await addSelectColumn(editor, "names", "status", ["Approved", "Rejected", "Pending"]);
  assert.deepEqual(calls, [
    "findElement:names",
    "listColumns:names",
    "addSelectColumn:names:status:Approved,Rejected,Pending",
  ]);
});

test("addSelectColumn leaves a column that is already visible", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name", "status"] });
  await addSelectColumn(editor, "names", "status", ["Approved", "Rejected", "Pending"]);
  assert.deepEqual(calls, ["findElement:names", "listColumns:names"]);
});

test("addSegmentedControl adds c.status when it is missing", async () => {
  const { editor, calls } = columnEditor({ inputTable: true, columns: ["name"] });
  await addSegmentedControl(editor, "c", "status", ["Approved", "Rejected", "Pending"]);
  assert.ok(calls.includes("addSegmentedControl:c.status:Approved,Rejected,Pending"));
});

test("addSegmentedControl leaves a control that is already there", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name"],
    controls: ["c.status"],
  });
  await addSegmentedControl(editor, "c", "status", ["Approved", "Rejected", "Pending"]);
  assert.ok(!calls.some((call) => call.startsWith("addSegmentedControl")));
});

test("saveUpdateRow writes the status control onto the matched row", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name", "status"],
    controls: ["c.status", "v.id_name_selected"],
  });
  await saveUpdateRow(editor, "Save status", "names", "status", "c", "status", "v", "id_name_selected");
  assert.ok(
    calls.includes("setUpdateRow:names:status:c.status:v.id_name_selected:Save status"),
  );
});

test("saveUpdateRow does not save when the control is missing", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name", "status"],
    controls: ["v.id_name_selected"],
  });
  await assert.rejects(
    () => saveUpdateRow(editor, "Save status", "names", "status", "c", "status", "v", "id_name_selected"),
    /missing handle/,
  );
  assert.ok(!calls.some((call) => call.startsWith("setUpdateRow")));
});

test("saveUpdateRow does not save when the status column is missing", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name"],
    controls: ["c.status", "v.id_name_selected"],
  });
  await assert.rejects(
    () => saveUpdateRow(editor, "Save status", "names", "status", "c", "status", "v", "id_name_selected"),
    /missing column/,
  );
  assert.ok(!calls.some((call) => call.startsWith("setUpdateRow")));
});

test("saveOnSelectControl does not save when the source column is missing", async () => {
  const { editor, calls } = columnEditor({
    inputTable: true,
    columns: ["name"],
    controls: ["v.id_name_selected"],
  });
  await assert.rejects(
    () => saveOnSelectControl(editor, "names", "name", "v", "id_name_selected", "Row ID"),
    /missing column/,
  );
  assert.ok(!calls.some((call) => call.startsWith("setOnSelectControl")));
});
