import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parseCreate } from "../dist/create.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

function run(args: string[]) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });
}

test("set-control without --handle is rejected", () => {
  const result = run(["set-control", "--url", url, "--value", "hello"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-control requires --handle/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add-page without --name is rejected", () => {
  const result = run(["add-page", "--url", url]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-page requires --name/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add input-table without --title is rejected", () => {
  const result = run(["add", "--url", url, "--type", "input-table", "--column", "name"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add input-table requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add control without --handle is rejected", () => {
  const result = run(["add", "--url", url, "--type", "control"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add control requires --handle/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("set-action without --title is rejected", () => {
  const result = run(["set-action", "--url", url, "--effect", "insert-row", "--into", "names", "--column", "name", "--from-handle", "name"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-action requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add control without --kind is rejected", () => {
  const result = run(["add", "--url", url, "--type", "control", "--handle", "name"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add control requires --kind c or --kind v/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add input-table without a BE or FE title is rejected", () => {
  const result = run(["add", "--url", url, "--type", "input-table", "--title", "names", "--column", "name"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add input-table requires a BE - or FE - title in sentence case/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add-page with a lowercase name is rejected", () => {
  const result = run(["add-page", "--url", url, "--name", "test"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-page --name must be sentence case/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("style-modal without --page is rejected", () => {
  const result = run([
    "style-modal",
    "--url",
    url,
    "--header",
    "Error",
    "--sentence",
    "This name already exists!",
    "--button",
    "I will create a new name",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /style-modal requires --page/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("style-modal without --sentence is rejected", () => {
  const result = run([
    "style-modal",
    "--url",
    url,
    "--page",
    "Error",
    "--header",
    "Error",
    "--button",
    "I will create a new name",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /style-modal requires --sentence/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add-column without --column is rejected", () => {
  const result = run(["add-column", "--url", url, "--title", "names"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-column requires --column/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add-column rejects a column that is not a system column", () => {
  const result = run(["add-column", "--url", url, "--title", "names", "--column", "nickname"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-column column must be a system column/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("set-action set-control without --on-select is rejected", () => {
  const result = run([
    "set-action",
    "--url",
    url,
    "--title",
    "names",
    "--effect",
    "set-control",
    "--kind",
    "v",
    "--handle",
    "id_name_selected",
    "--from-column",
    "Row ID",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-action requires --on-select/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("set-action on-select without --from-column is rejected", () => {
  const result = run([
    "set-action",
    "--url",
    url,
    "--title",
    "names",
    "--on-select",
    "name",
    "--effect",
    "set-control",
    "--kind",
    "v",
    "--handle",
    "id_name_selected",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-action requires --from-column/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

const picker =
  'Text([FCT_PEOPLE.csv/employee_number]) & " - " & [FCT_PEOPLE.csv/employee_first_name] & " " & [FCT_PEOPLE.csv/employee_last_name]';

test("add-column calculation keeps LOG10", () => {
  const formula = "LOG10([FCT_PEOPLE.csv/employee_number])";
  const parsed = parseCreate("add-column", [
    "--url",
    url,
    "--title",
    "Raw - Fact - People",
    "--column",
    "txt_picker",
    "--type",
    "calculation",
    "--formula",
    formula,
  ]);
  assert.equal(parsed.kind, "calc-column");
  if (parsed.kind !== "calc-column") return;
  assert.equal(parsed.formula, formula);
});

test("add-column calculation rejects an A1 reference before Chrome", () => {
  assert.throws(
    () =>
      parseCreate("add-column", [
        "--url",
        url,
        "--title",
        "Raw - Fact - People",
        "--column",
        "txt_picker",
        "--type",
        "calculation",
        "--formula",
        "A1",
      ]),
    /Sigma formula/,
  );
});

test("add-column calculation rejects CONCAT before Chrome", () => {
  assert.throws(
    () =>
      parseCreate("add-column", [
        "--url",
        url,
        "--title",
        "Raw - Fact - People",
        "--column",
        "txt_picker",
        "--type",
        "calculation",
        "--formula",
        'CONCAT([FCT_PEOPLE.csv/employee_number], " - ")',
      ]),
    /Sigma formula/,
  );
});

test("help lists add-column calculation", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--type calculation --formula <sigma formula>/);
});

test("add-column calculation keeps the Sigma formula", () => {
  const parsed = parseCreate("add-column", [
    "--url",
    url,
    "--title",
    "Raw - Fact - People",
    "--column",
    "txt_picker",
    "--type",
    "calculation",
    "--formula",
    picker,
  ]);
  assert.equal(parsed.kind, "calc-column");
  if (parsed.kind !== "calc-column") return;
  assert.equal(parsed.title, "Raw - Fact - People");
  assert.equal(parsed.column, "txt_picker");
  assert.equal(parsed.formula, picker);
});

test("add-column single-select without --option is rejected", () => {
  const result = run([
    "add-column",
    "--url",
    url,
    "--title",
    "names",
    "--column",
    "status",
    "--type",
    "single-select",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-column requires --option/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add control list without --source is rejected", () => {
  assert.throws(
    () =>
      parseCreate("add", [
        "--url",
        url,
        "--type",
        "control",
        "--kind",
        "c",
        "--handle",
        "role",
        "--control",
        "list",
        "--column",
        "employee_role_code",
      ]),
    /add control list requires --source/,
  );
});

test("add control list keeps an overridden tick", () => {
  const parsed = parseCreate("add", [
    "--url",
    url,
    "--type",
    "control",
    "--kind",
    "c",
    "--handle",
    "role",
    "--control",
    "list",
    "--source",
    "Raw - Dim - Employee role",
    "--column",
    "employee_role_code",
    "--multiple",
    "on",
    "--search",
    "on",
  ]);
  assert.equal(parsed.kind, "list-control");
  if (parsed.kind !== "list-control") return;
  assert.equal(parsed.multiple, "on");
  assert.equal(parsed.nullOption, "off");
  assert.equal(parsed.clear, "on");
  assert.equal(parsed.search, "on");
});

test("add control list defaults the ticks and keeps the source", () => {
  const parsed = parseCreate("add", [
    "--url",
    url,
    "--type",
    "control",
    "--kind",
    "c",
    "--handle",
    "role",
    "--control",
    "list",
    "--source",
    "Raw - Dim - Employee role",
    "--column",
    "employee_role_code",
  ]);
  assert.equal(parsed.kind, "list-control");
  if (parsed.kind !== "list-control") return;
  assert.equal(parsed.source, "Raw - Dim - Employee role");
  assert.equal(parsed.column, "employee_role_code");
  assert.equal(parsed.multiple, "off");
  assert.equal(parsed.nullOption, "off");
  assert.equal(parsed.clear, "on");
  assert.equal(parsed.search, "off");
});

test("add control date keeps the handle", () => {
  const parsed = parseCreate("add", [
    "--url",
    url,
    "--type",
    "control",
    "--kind",
    "v",
    "--handle",
    "start_date",
    "--control",
    "date",
  ]);
  assert.equal(parsed.kind, "date-control");
  if (parsed.kind !== "date-control") return;
  assert.equal(parsed.controlKind, "v");
  assert.equal(parsed.handle, "start_date");
});

test("add segmented control without --option is rejected", () => {
  const result = run([
    "add",
    "--url",
    url,
    "--type",
    "control",
    "--kind",
    "c",
    "--handle",
    "status",
    "--control",
    "segmented",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add control requires --option/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("set-action update-row without --match-handle is rejected", () => {
  const result = run([
    "set-action",
    "--url",
    url,
    "--title",
    "Save status",
    "--effect",
    "update-row",
    "--into",
    "names",
    "--column",
    "status",
    "--kind",
    "c",
    "--from-handle",
    "status",
    "--match-kind",
    "v",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-action requires --match-handle/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("size without --area or --size is rejected", () => {
  const result = run(["size", "--url", url, "--title", "FCT_SALES"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /size requires --area or --size/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("size rejects --area and --size together", () => {
  const result = run(["size", "--url", url, "--title", "FCT_SALES", "--area", "3-13:1-25", "--size", "24x10"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not both/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("size rejects a size that is not widthxheight", () => {
  const result = run(["size", "--url", url, "--title", "FCT_SALES", "--size", "24-10"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected widthxheight/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("group-column without --with is rejected", () => {
  const result = run(["group-column", "--url", url, "--title", "Raw - Name products", "--column", "nm_product"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /group-column requires --with/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("insert-row without --title is rejected", () => {
  const result = run(["insert-row", "--url", url]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /insert-row requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add container without --handle is rejected", () => {
  const result = run(["add", "--url", url, "--type", "container", "--title", "Employee"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add container requires --handle/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("add container without --title is rejected", () => {
  const result = run(["add", "--url", url, "--type", "container", "--handle", "variables_employee"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add container requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});

test("help shows repeated input-table columns as name:text or name:date", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--column <name>\[:text\|date\] \[--column <name>\[:text\|date\]\.\.\.\]/);
});

test("input-table columns stay in order as text then date", () => {
  const parsed = parseCreate("add", [
    "--url",
    url,
    "--type",
    "input-table",
    "--title",
    "BE - Input - People",
    "--column",
    "pk_person:text",
    "--column",
    "dt_start:date",
  ]);
  assert.equal(parsed.kind, "input-table");
  if (parsed.kind !== "input-table") return;
  assert.deepEqual(parsed.columns, [
    { name: "pk_person", type: "text" },
    { name: "dt_start", type: "date" },
  ]);
});

test("a bare input-table column is text", () => {
  const parsed = parseCreate("add", [
    "--url",
    url,
    "--type",
    "input-table",
    "--title",
    "BE - Input - People",
    "--column",
    "pk_person",
  ]);
  assert.equal(parsed.kind, "input-table");
  if (parsed.kind !== "input-table") return;
  assert.deepEqual(parsed.columns, [{ name: "pk_person", type: "text" }]);
});

test("a repeated input-table column name is rejected", () => {
  assert.throws(
    () =>
      parseCreate("add", [
        "--url",
        url,
        "--type",
        "input-table",
        "--title",
        "BE - Input - People",
        "--column",
        "pk_person:text",
        "--column",
        "pk_person:date",
      ]),
    /Duplicate --column pk_person/,
  );
});

test("add-drawer handle employee is the page title d.employee", () => {
  const parsed = parseCreate("add-drawer", ["--url", url, "--handle", "employee", "--header", "on"]);
  assert.equal(parsed.kind, "add-drawer");
  if (parsed.kind !== "add-drawer") return;
  assert.equal(parsed.name, "d.employee");
  assert.equal(parsed.settings.header, "on");
  assert.equal(parsed.settings.width, undefined);
});

test("add-drawer rejects a width before Chrome", () => {
  const result = run(["add-drawer", "--url", url, "--handle", "employee", "--width", "tiny"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /add-drawer --width must be small, medium, or large/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /Chrome is not listening/);
});

test("add-drawer rejects an empty handle", () => {
  assert.throws(() => parseCreate("add-drawer", ["--url", url, "--handle", " "]), /empty handle/);
});

test("add-drawer rejects a duplicate flag and an unknown flag", () => {
  assert.throws(
    () => parseCreate("add-drawer", ["--url", url, "--handle", "employee", "--width", "small", "--width", "large"]),
    /Duplicate --width/,
  );
  assert.throws(
    () => parseCreate("add-drawer", ["--url", url, "--handle", "employee", "--reset", "on"]),
    /Unknown argument: --reset/,
  );
});

test("help lists add-drawer and its settings", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /add-drawer --url <workbook-url> \[--page <page-name>\] --handle <name> \[--width small\|medium\|large\] \[--spacing small\|medium\|large\] \[--padding on\|off\] \[--element-gap on\|off\] \[--page-overlay on\|off\] \[--background <#rrggbb>\] \[--header on\|off\] \[--close-icon on\|off\]/,
  );
});

test("an input-table column type other than text or date is rejected", () => {
  assert.throws(
    () =>
      parseCreate("add", [
        "--url",
        url,
        "--type",
        "input-table",
        "--title",
        "BE - Input - People",
        "--column",
        "pk_person:number",
      ]),
    /column type must be text or date/,
  );
});
