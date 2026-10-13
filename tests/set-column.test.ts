import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSetColumn } from "../dist/set-column.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

test("parseSetColumn requires --column", () => {
  assert.throws(
    () => parseSetColumn(["--url", url, "--title", "Orders", "--set", "format=date"]),
    /--column/,
  );
});

test("parseSetColumn requires --set", () => {
  assert.throws(() => parseSetColumn(["--url", url, "--title", "Orders", "--column", "Due"]), /--set/);
});

test("parseSetColumn rejects format=number", () => {
  assert.throws(
    () => parseSetColumn(["--url", url, "--title", "Orders", "--column", "Due", "--set", "format=number"]),
    /format=date/,
  );
});

test("parseSetColumn accepts two columns with format=date", () => {
  assert.deepEqual(
    parseSetColumn([
      "--url",
      url,
      "--page",
      "Data",
      "--title",
      "Orders",
      "--column",
      "Created",
      "--column",
      "Due",
      "--set",
      "format=date",
    ]),
    {
      url,
      page: "Data",
      title: "Orders",
      columns: ["Created", "Due"],
      sets: ["format=date"],
    },
  );
});

test("parseSetColumn rejects a duplicate column", () => {
  assert.throws(
    () =>
      parseSetColumn([
        "--url",
        url,
        "--title",
        "Orders",
        "--column",
        "Due",
        "--column",
        "Due",
        "--set",
        "format=date",
      ]),
    /Duplicate --column Due/,
  );
});
