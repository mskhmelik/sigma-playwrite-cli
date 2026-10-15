import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

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
