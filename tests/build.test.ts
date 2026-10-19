import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import {
  addDateControl,
  addEmptyInputTable,
  addListControl,
  addNameControl,
  addNamedButton,
  addNamedDrawer,
  addNamedModal,
  addNamedPage,
  duplicateFormula,
  saveCloseModal,
  saveIfElse,
  saveInsertAction,
  saveInsertRow,
  renameOneColumn,
} from "../dist/effects/build.js";

function buildEditor(pages: string[], columns: string[] = [], absent: string[] = []): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor: Editor = {
    findPage: async (name) => {
      calls.push(`findPage:${name}`);
      if (!pages.includes(name)) throw new Error("page not on canvas");
    },
    findElement: async (title) => {
      calls.push(`findElement:${title}`);
      if (title === "missing" || absent.includes(title)) {
        throw new Error(`Title ${JSON.stringify(title)} was not found. Nothing was changed.`);
      }
      if (title === "duplicate" || title === "c.duplicate") {
        throw new Error(`Title ${JSON.stringify(title)} matches 2 components. Nothing was changed.`);
      }
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
    addTypedColumn: async (title, name, type) => {
      calls.push(`addTypedColumn:${title}:${name}:${type}`);
    },
    listColumns: async (title) => {
      calls.push(`listColumns:${title}`);
      return [...columns];
    },
    addDateControl: async (title) => {
      calls.push(`addDateControl:${title}`);
    },
    addListControl: async (title, source, column, multiple, nullOption, clear, search) => {
      calls.push(`addListControl:${title}:${source}:${column}:${multiple}:${nullOption}:${clear}:${search}`);
    },
    addTextControl: async (title, area) => {
      const span = area ? `:${area.rowStart}-${area.rowEnd}:${area.colStart}-${area.colEnd}` : "";
      calls.push(`addTextControl:${title}${span}`);
    },
    addButton: async (title) => {
      calls.push(`addButton:${title}`);
    },
    addModal: async (name) => {
      calls.push(`addModal:${name}`);
    },
    addCalculation: async () => {},
    addDrawer: async (name, settings) => {
      calls.push(`addDrawer:${name}:${JSON.stringify(settings)}`);
    },
    setInsertAction: async (button, table, column, controlTitle) => {
      calls.push(`setInsertAction:${button}:${table}:${column}:${controlTitle}`);
    },
    setInsertRow: async (button, table, values) => {
      const encoded = values
        .map((value) => {
          if (value.kind === "control") return `${value.column}=control:${value.control}`;
          if (value.kind === "static") return `${value.column}=static:${value.value}`;
          return `${value.column}=formula:${value.formula}`;
        })
        .join(",");
      calls.push(`setInsertRow:${button}:${table}:${encoded}`);
    },
    renameColumn: async (title, column, name) => {
      calls.push(`renameColumn:${title}:${column}:${name}`);
    },
    setCloseModal: async (button) => {
      calls.push(`setCloseModal:${button}`);
    },
    setIfElse: async (button, table, column, controlTitle, modal, formula) => {
      calls.push(`setIfElse:${button}:${table}:${column}:${controlTitle}:${modal}:${formula}`);
    },
    publish: async () => {},
    styleModalPage: async () => {},
    ensureModalSentence: async () => "",
    ensureModalButton: async () => "",
    stackModalBody: async () => {},
    addContainer: async () => {},
    hasContainer: async () => false,
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

test("a title that matches more than one element does not create a table", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(
    () => addEmptyInputTable(editor, "duplicate", [{ name: "pk_person", type: "text" }]),
    /matches 2 components/,
  );
  assert.ok(!calls.some((call) => call.startsWith("addInputTable")));
});

test("a date-first input table is rejected before the table is created", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(
    () =>
      addEmptyInputTable(editor, "missing", [
        { name: "dt_start", type: "date" },
        { name: "pk_person", type: "text" },
      ]),
    /first column must be text/,
  );
  assert.ok(!calls.some((call) => call.startsWith("addInputTable")));
});

test("a title that is not an input table does not gain a column", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(
    () => addEmptyInputTable(editor, "FCT_SALES", [{ name: "pk_person", type: "text" }]),
    /not an input table/,
  );
  assert.ok(!calls.some((call) => call.startsWith("addTypedColumn")));
  assert.ok(!calls.some((call) => call.startsWith("addInputTable")));
  assert.ok(!calls.some((call) => call.startsWith("addSystemColumn")));
});

test("an existing input table adds only the columns that are missing", async () => {
  const { editor, calls } = buildEditor([], ["pk_person"]);
  await addEmptyInputTable(editor, "names", [
    { name: "pk_person", type: "text" },
    { name: "dt_start", type: "date" },
  ]);
  assert.deepEqual(calls, [
    "findElement:names",
    "listColumns:names",
    "addTypedColumn:names:dt_start:date",
  ]);
});

test("a new input table renames the text scaffold then adds later columns", async () => {
  const { editor, calls } = buildEditor([]);
  await addEmptyInputTable(editor, "missing", [
    { name: "pk_person", type: "text" },
    { name: "dt_start", type: "date" },
  ]);
  assert.deepEqual(calls, [
    "findElement:missing",
    "addInputTable:missing:pk_person",
    "addTypedColumn:missing:dt_start:date",
  ]);
});

test("addListControl adds c.role when it is missing", async () => {
  const { editor, calls } = buildEditor([], [], ["c.role"]);
  await addListControl(
    editor,
    "c",
    "role",
    "Raw - Dim - Employee role",
    "employee_role_code",
    "off",
    "off",
    "on",
    "off",
  );
  assert.deepEqual(calls, [
    "findElement:c.role",
    "addListControl:c.role:Raw - Dim - Employee role:employee_role_code:off:off:on:off",
  ]);
});

test("addDateControl leaves an existing date control", async () => {
  const { editor, calls } = buildEditor([]);
  await addDateControl(editor, "v", "start_date");
  assert.deepEqual(calls, ["findElement:v.start_date"]);
});

test("addDateControl does not add when the title matches two components", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => addDateControl(editor, "c", "duplicate"), /matches 2 components/);
  assert.deepEqual(calls, ["findElement:c.duplicate"]);
});

test("addDateControl adds v.start_date when it is missing", async () => {
  const { editor, calls } = buildEditor([], [], ["v.start_date"]);
  await addDateControl(editor, "v", "start_date");
  assert.deepEqual(calls, ["findElement:v.start_date", "addDateControl:v.start_date"]);
});

test("addNameControl places an existing control without creating another", async () => {
  const { editor, calls } = buildEditor([]);
  await addNameControl(editor, "c", "employee_login", {
    rowStart: 1,
    colStart: 1,
    rowEnd: 4,
    colEnd: 7,
  });
  assert.deepEqual(calls, ["findElement:c.employee_login", "addTextControl:c.employee_login:1-4:1-7"]);
});

test("addNameControl leaves an existing text control", async () => {
  const { editor, calls } = buildEditor([]);
  await addNameControl(editor, "c", "name");
  assert.deepEqual(calls, ["findElement:c.name"]);
});

test("addNameControl does not add when the title matches two components", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => addNameControl(editor, "c", "duplicate"), /matches 2 components/);
  assert.deepEqual(calls, ["findElement:c.duplicate"]);
});

test("addNameControl titles the text input c.<name>", async () => {
  const { editor, calls } = buildEditor([], [], ["c.name"]);
  await addNameControl(editor, "c", "name");
  assert.deepEqual(calls, ["findElement:c.name", "addTextControl:c.name"]);
});

test("addNamedButton asks for the button title", async () => {
  const { editor, calls } = buildEditor([]);
  await addNamedButton(editor, "Add");
  assert.deepEqual(calls, ["addButton:Add"]);
});

test("saveInsertAction stores insert-row from the control onto an input table", async () => {
  const { editor, calls } = buildEditor([]);
  await saveInsertAction(editor, "Add", "names", "name", "c", "name");
  assert.deepEqual(calls, [
    "findElement:Add",
    "findElement:names",
    "setInsertAction:Add:names:name:c.name",
  ]);
});

test("saveInsertAction does not save when the button is missing", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveInsertAction(editor, "missing", "names", "name", "c", "name"), /missing title/);
  assert.deepEqual(calls, ["findElement:missing"]);
});

test("a second saveInsertRow edits the same insert action", async () => {
  const { editor, calls } = buildEditor([]);
  const sets = [
    { column: "employee_login", source: "control" as const, controlKind: "c" as const, handle: "employee_login" },
    { column: "txt_approval_status", source: "static" as const, value: "PENDING" },
    { column: "valid_from_date", source: "control" as const, controlKind: "c" as const, handle: "employment_start_date" },
  ];
  await saveInsertRow(editor, "Add employee", "names", sets);
  await saveInsertRow(editor, "Add employee", "names", sets);
  const encoded = "setInsertRow:Add employee:names:employee_login=control:c.employee_login,txt_approval_status=static:PENDING,valid_from_date=control:c.employment_start_date";
  assert.deepEqual(calls, ["findElement:Add employee", "findElement:names", encoded, "findElement:Add employee", "findElement:names", encoded]);
});

test("saveInsertRow still maps a table that is not on this page", async () => {
  const { editor, calls } = buildEditor([], [], ["BE - Input - People"]);
  await saveInsertRow(editor, "Add employee", "BE - Input - People", [
    { column: "txt_approval_status", source: "static", value: "PENDING" },
  ]);
  assert.ok(calls.some((call) => call.startsWith("setInsertRow:Add employee:BE - Input - People:")));
});

test("saveInsertRow refuses a blame column before it writes", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(
    () => saveInsertRow(editor, "Add employee", "names", [{ column: "nm_created_by", source: "static", value: "x" }]),
    /cannot write "nm_created_by"/,
  );
  assert.ok(!calls.some((call) => call.startsWith("setInsertRow")));
});

test("renameOneColumn leaves a header that already has the target name", async () => {
  const { editor, calls } = buildEditor([], ["nm_created_by"]);
  const changed = await renameOneColumn(editor, "names", "Created by", "nm_created_by");
  assert.equal(changed, false);
  assert.deepEqual(calls, ["findElement:names", "listColumns:names"]);
});

test("saveInsertAction refuses a table that is not an input table", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveInsertAction(editor, "Add", "FCT_SALES", "name", "c", "name"), /not an input table/);
  assert.ok(!calls.some((call) => call.startsWith("setInsertAction")));
});

test("addNamedModal creates a modal that is not already there", async () => {
  const { editor, calls } = buildEditor(["Data"]);
  await addNamedModal(editor, "Error");
  assert.deepEqual(calls, ["findPage:Error", "addModal:Error"]);
});

test("addNamedModal stops when the modal already exists", async () => {
  const { editor, calls } = buildEditor(["Error"]);
  await assert.rejects(() => addNamedModal(editor, "Error"), /duplicate page/);
  assert.deepEqual(calls, ["findPage:Error"]);
});

test("addNamedDrawer creates a missing drawer named d.employee", async () => {
  const { editor, calls } = buildEditor(["Data"]);
  await addNamedDrawer(editor, "d.employee", { header: "on" });
  assert.deepEqual(calls, ["findPage:d.employee", `addDrawer:d.employee:${JSON.stringify({ header: "on" })}`]);
});

test("addNamedDrawer stops when d.employee already exists", async () => {
  const { editor, calls } = buildEditor(["d.employee"]);
  await assert.rejects(() => addNamedDrawer(editor, "d.employee", { header: "on" }), /duplicate page/);
  assert.deepEqual(calls, ["findPage:d.employee"]);
});

test("saveCloseModal saves close on the button", async () => {
  const { editor, calls } = buildEditor([]);
  await saveCloseModal(editor, "Create a new name");
  assert.deepEqual(calls, ["findElement:Create a new name", "setCloseModal:Create a new name"]);
});

test("saveCloseModal does not save when the button is missing", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveCloseModal(editor, "missing"), /missing title/);
  assert.deepEqual(calls, ["findElement:missing"]);
});

test("saveIfElse opens the modal when the value exists and otherwise inserts the row", async () => {
  const { editor, calls } = buildEditor(["Error"]);
  await saveIfElse(editor, "Add", "names", "name", "c", "name", "Error");
  assert.deepEqual(calls, [
    "findElement:Add",
    "findElement:names",
    "findPage:Error",
    `setIfElse:Add:names:name:c.name:Error:${duplicateFormula("names", "name", "c.name")}`,
  ]);
});

test("saveIfElse does not save when the modal is missing", async () => {
  const { editor, calls } = buildEditor([]);
  await assert.rejects(() => saveIfElse(editor, "Add", "names", "name", "c", "name", "Error"), /missing page/);
  assert.ok(!calls.some((call) => call.startsWith("setIfElse")));
});

test("saveIfElse does not save when the table is not an input table", async () => {
  const { editor, calls } = buildEditor(["Error"]);
  await assert.rejects(() => saveIfElse(editor, "Add", "FCT_SALES", "name", "c", "name", "Error"), /not an input table/);
  assert.ok(!calls.some((call) => call.startsWith("setIfElse")));
});
