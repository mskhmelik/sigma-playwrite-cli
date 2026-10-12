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

test("insert-row without --title is rejected", () => {
  const result = run(["insert-row", "--url", url]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /insert-row requires --title/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
});
