import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { parseDeleteColumn } from "../dist/delete-column.js";
import { deleteNamedColumns } from "../dist/effects/build.js";
import { DELETE_REFUSED_COLUMNS, columnDeleteAction } from "../dist/system-columns.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

function run(args: string[]) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, SIGMA_PLAYWRITE_CLI_CDP: "http://127.0.0.1:9" },
  });
}

function editorWith(headers: string[]): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor = {
    async findElement(title: string) {
      calls.push(`findElement:${title}`);
      return { title, inputTable: true };
    },
    async listColumns(title: string) {
      calls.push(`listColumns:${title}`);
      return [...headers];
    },
    async deleteColumn(title: string, column: string) {
      calls.push(`deleteColumn:${title}:${column}`);
    },
  } as Editor;
  return { editor, calls };
}

test("parseDeleteColumn keeps repeated columns in order", () => {
  assert.deepEqual(
    parseDeleteColumn([
      "--url",
      url,
      "--page",
      "Data",
      "--title",
      "BE - Input - People",
      "--column",
      "nickname",
      "--column",
      "city",
    ]),
    {
      url,
      page: "Data",
      title: "BE - Input - People",
      columns: ["nickname", "city"],
    },
  );
});

test("parseDeleteColumn refuses an approval header before a command exists", () => {
  for (const column of DELETE_REFUSED_COLUMNS) {
    assert.throws(
      () =>
        parseDeleteColumn([
          "--url",
          url,
          "--title",
          "BE - Input - People",
          "--column",
          "nickname",
          "--column",
          column,
        ]),
      new RegExp(`delete-column cannot delete ${JSON.stringify(column)}`),
    );
  }
});

test("columnDeleteAction skips, deletes, or refuses", () => {
  assert.equal(columnDeleteAction("nickname", ["name"]), "skip");
  assert.equal(columnDeleteAction("name", ["name", "city"]), "delete");
  for (const column of DELETE_REFUSED_COLUMNS) {
    assert.equal(columnDeleteAction(column, [column]), "refuse");
    assert.equal(columnDeleteAction(column, []), "refuse");
  }
});

test("deleteNamedColumns skips an absent header and deletes the next one", async () => {
  const { editor, calls } = editorWith(["name", "city"]);
  const result = await deleteNamedColumns(editor, "BE - Input - People", ["nickname", "city", "name"]);
  assert.deepEqual(result, { deleted: ["city", "name"], skipped: ["nickname"] });
  assert.deepEqual(calls, [
    "findElement:BE - Input - People",
    "listColumns:BE - Input - People",
    "deleteColumn:BE - Input - People:city",
    "deleteColumn:BE - Input - People:name",
  ]);
});

test("deleteNamedColumns leaves every absent header alone", async () => {
  const { editor, calls } = editorWith(["name"]);
  const result = await deleteNamedColumns(editor, "BE - Input - People", ["nickname", "city"]);
  assert.deepEqual(result, { deleted: [], skipped: ["nickname", "city"] });
  assert.deepEqual(calls, ["findElement:BE - Input - People", "listColumns:BE - Input - People"]);
});

test("deleteNamedColumns refuses an approval header before it touches the table", async () => {
  const { editor, calls } = editorWith(["txt_approval_status", "name"]);
  await assert.rejects(
    () => deleteNamedColumns(editor, "BE - Input - People", ["name", "nm_approved_by"]),
    /delete-column cannot delete "nm_approved_by"/,
  );
  assert.deepEqual(calls, []);
});

test("delete-column without --column is rejected", () => {
  const result = run(["delete-column", "--url", url, "--title", "BE - Input - People"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /delete-column requires --column/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("delete-column refuses an approval header from the CLI", () => {
  const result = run([
    "delete-column",
    "--url",
    url,
    "--title",
    "BE - Input - People",
    "--column",
    "nickname",
    "--column",
    "dt_approved_at",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /delete-column cannot delete "dt_approved_at"/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("help lists delete-column", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /delete-column --url <workbook-url> \[--page <page-name>\] --title <table> --column <header> \[--column <header>\.\.\.\]/,
  );
});
