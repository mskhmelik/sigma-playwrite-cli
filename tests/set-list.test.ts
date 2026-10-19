import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Editor } from "../src/editor.ts";
import { setListControl } from "../dist/effects/build.js";
import { resolveListControl } from "../dist/handles.js";
import { parseSetList } from "../dist/set-list.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(args: string[]) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, SIGMA_PLAYWRITE_CLI_CDP: "http://127.0.0.1:9" },
  });
}

function functionBody(source: string, name: string): string {
  const marker = `async function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

const flags = [
  "--url",
  url,
  "--page",
  "Data",
  "--kind",
  "c",
  "--handle",
  "role",
  "--source",
  "Raw - Dim - Employee role",
  "--column",
  "employee_role_code",
];

function without(args: string[], flag: string): string[] {
  const next: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      i++;
      continue;
    }
    next.push(args[i] ?? "");
  }
  return next;
}

test("parseSetList keeps kind, handle, source, and column", () => {
  assert.deepEqual(parseSetList(flags), {
    url,
    page: "Data",
    kind: "c",
    handle: "role",
    source: "Raw - Dim - Employee role",
    column: "employee_role_code",
  });
});

test("parseSetList requires --kind, --handle, --source, and --column", () => {
  assert.throws(() => parseSetList(without(flags, "--kind")), /set-list requires --kind c or --kind v/);
  assert.throws(() => parseSetList(without(flags, "--handle")), /set-list requires --handle/);
  assert.throws(() => parseSetList(without(flags, "--source")), /set-list requires --source/);
  assert.throws(() => parseSetList(without(flags, "--column")), /set-list requires --column/);
});

test("parseSetList requires kind c or v", () => {
  assert.throws(
    () => parseSetList(flags.map((value) => (value === "c" ? "x" : value))),
    /set-list requires --kind c or --kind v/,
  );
  assert.equal(parseSetList(flags.map((value) => (value === "c" ? "v" : value))).kind, "v");
});

test("parseSetList rejects a flag that would rename the title", () => {
  assert.throws(() => parseSetList([...flags, "--title", "Role"]), /Unknown argument: --title/);
  assert.throws(() => parseSetList([...flags, "--name", "Role"]), /Unknown argument: --name/);
});

test("resolveListControl prefers the canvas title and fails when both are missing", () => {
  assert.equal(resolveListControl("canvas-id", "control-id", "c.role"), "canvas-id");
  assert.equal(resolveListControl(null, "control-id", "c.role"), "control-id");
  assert.throws(
    () => resolveListControl(null, null, "c.role"),
    /Control "c.role" was not found\. Nothing was changed\./,
  );
});

test("setListControl updates an existing control and does not create one", async () => {
  const calls: string[] = [];
  const editor = {
    async addListControl() {
      calls.push("addListControl");
    },
    async setListSource(title: string, source: string, column: string) {
      calls.push(`setListSource:${title}:${source}:${column}`);
    },
  } as Editor;
  await setListControl(editor, "v", "id_role_selected", "Raw - Dim - Employee role", "employee_role_code");
  assert.deepEqual(calls, ["setListSource:v.id_role_selected:Raw - Dim - Employee role:employee_role_code"]);
});

test("setListControl does not rewrite the control id or the canvas title", () => {
  const source = setListControl.toString();
  assert.doesNotMatch(source, /setControlId/);
  assert.doesNotMatch(source, /writeCanvasTitle/);
  assert.doesNotMatch(source, /renameTitle/);
  assert.doesNotMatch(source, /addListControl/);
});

test("set-list editor path sets the source fields and is not the create path", () => {
  const source = readFileSync(join(root, "src/workbook-editor.ts"), "utf8");
  const update = functionBody(source, "setExistingListSource");
  const apply = functionBody(source, "applyListValueSource");
  const read = functionBody(source, "readControlId");
  const create = functionBody(source, "createListControl");
  assert.match(update, /resolveListControl/);
  assert.match(update, /applyListValueSource/);
  assert.doesNotMatch(update, /setControlId|writeCanvasTitle|renameTitle|createListControl/);
  assert.match(apply, /Value source/);
  assert.match(apply, /Source column/);
  assert.doesNotMatch(apply, /setControlId|writeCanvasTitle|renameTitle/);
  assert.doesNotMatch(read, /setControlId|writeCanvasTitle|\.fill\(/);
  assert.match(create, /setControlId/);
  assert.match(create, /writeCanvasTitle/);
  assert.match(create, /applyListValueSource/);
});

test("set-list without --source is rejected", () => {
  const result = run(["set-list", "--url", url, "--kind", "c", "--handle", "role", "--column", "employee_role_code"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-list requires --source/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("set-list rejects kind other than c or v", () => {
  const result = run([
    "set-list",
    "--url",
    url,
    "--kind",
    "x",
    "--handle",
    "role",
    "--source",
    "Raw - Dim - Employee role",
    "--column",
    "employee_role_code",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /set-list requires --kind c or --kind v/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("set-list rejects --name", () => {
  const result = run([...["set-list", ...flags], "--name", "Role"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown argument: --name/);
  assert.doesNotMatch(result.stderr, /Unknown command/);
  assert.doesNotMatch(result.stderr, /9333/);
});

test("help lists set-list", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /set-list --url <workbook-url> \[--page <page-name>\] --kind c\|v --handle <name> --source <table> --column <column>/,
  );
});
