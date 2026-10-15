import assert from "node:assert/strict";
import { test } from "node:test";
import { RELAUNCH_MESSAGE, sameEditor } from "../dist/chrome.js";

const workbook = "https://app.sigmacomputing.com/papercrane/workbook/abc123/edit";

test("same workbook with a different query is the same editor", () => {
  assert.equal(sameEditor(`${workbook}?nodeId=kZthSEq78C`, workbook), true);
  assert.equal(sameEditor(workbook, `${workbook}?nodeId=kZthSEq78C#panel`), true);
  assert.equal(sameEditor(`${workbook}/`, "https://app.sigmacomputing.com/papercrane/workbook/abc123"), true);
});

test("a different workbook is not the same editor", () => {
  const other = "https://app.sigmacomputing.com/papercrane/workbook/other/edit";
  assert.equal(sameEditor(workbook, other), false);
});

test("relaunch uses the dedicated Chrome profile on port 9333", () => {
  assert.match(RELAUNCH_MESSAGE, /9333/);
  assert.match(RELAUNCH_MESSAGE, /\.sigma-playwrite-cli\/chrome-data/);
  assert.equal(RELAUNCH_MESSAGE.includes("Application Support/Google/Chrome"), false);
});

test("a non-edit URL is not the same editor", () => {
  const view = "https://app.sigmacomputing.com/papercrane/workbook/abc123";
  assert.equal(sameEditor(view, workbook), false);
  assert.equal(sameEditor("about:blank", workbook), false);
});
