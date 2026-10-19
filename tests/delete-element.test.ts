import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { parseDeleteElement } from "../dist/delete-element.js";
import { deleteNamedElement, elementDeleteAction } from "../dist/effects/build.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

function run(args: string[]) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, SIGMA_PLAYWRITE_CLI_CDP: "http://127.0.0.1:9" },
  });
}

function editorWith(titles: string[]): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor = {
    async findElement(title: string) {
      calls.push(`findElement:${title}`);
      if (!titles.includes(title)) throw new Error(`Title ${JSON.stringify(title)} was not found.`);
      return { title, inputTable: false };
    },
    async deleteElement(title: string) {
      calls.push(`deleteElement:${title}`);
    },
  } as Editor;
  return { editor, calls };
}

test("parseDeleteElement keeps url, page, and title", () => {
  assert.deepEqual(
    parseDeleteElement(["--url", url, "--page", "Data", "--title", "c.employment_end_date"]),
    { url, page: "Data", title: "c.employment_end_date" },
  );
});

test("parseDeleteElement requires --title", () => {
  assert.throws(
    () => parseDeleteElement(["--url", url, "--page", "Data"]),
    /delete-element requires --title/,
  );
});

test("parseDeleteElement requires --url", () => {
  assert.throws(
    () => parseDeleteElement(["--page", "Data", "--title", "c.employment_end_date"]),
    /delete-element requires --url/,
  );
});

test("elementDeleteAction skips an absent title and deletes a present one", () => {
  assert.equal(elementDeleteAction("c.employment_end_date", ["c.employment_start_date"]), "skip");
  assert.equal(elementDeleteAction("c.employment_end_date", []), "skip");
  assert.equal(elementDeleteAction("c.employment_end_date", ["c.employment_end_date"]), "delete");
});

test("deleteNamedElement leaves an absent title alone", async () => {
  const { editor, calls } = editorWith(["c.employment_start_date"]);
  const result = await deleteNamedElement(editor, "c.employment_end_date");
  assert.equal(result, "absent");
  assert.deepEqual(calls, ["findElement:c.employment_end_date"]);
});

test("deleteNamedElement deletes a present title", async () => {
  const { editor, calls } = editorWith(["c.employment_end_date"]);
  const result = await deleteNamedElement(editor, "c.employment_end_date");
  assert.equal(result, "deleted");
  assert.deepEqual(calls, ["findElement:c.employment_end_date", "deleteElement:c.employment_end_date"]);
});

test("delete-element without --title is rejected", () => {
  const result = run(["delete-element", "--url", url, "--page", "Data"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /delete-element requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("parseDeleteElement rejects an unknown flag", () => {
  assert.throws(
    () => parseDeleteElement(["--url", url, "--title", "c.employment_end_date", "--column", "city"]),
    /Unknown argument: --column/,
  );
});

test("parseDeleteElement accepts an approval-column name as a canvas title", () => {
  assert.equal(
    parseDeleteElement(["--url", url, "--title", "txt_approval_status"]).title,
    "txt_approval_status",
  );
});

test("delete-element without --url is rejected", () => {
  const result = run(["delete-element", "--title", "c.employment_end_date"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /delete-element requires --url/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("delete-element rejects an unknown flag", () => {
  const result = run(["delete-element", "--url", url, "--title", "c.employment_end_date", "--name", "Other"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown argument: --name/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("help lists delete-element", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /delete-element --url <workbook-url> \[--page <page-name>\] --title <element title>/,
  );
});
