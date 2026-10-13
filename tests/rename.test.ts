import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRename } from "../dist/rename.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

test("rename without --name is rejected", () => {
  assert.throws(
    () => parseRename(["--url", url, "--title", "Raw - Fact - Sales"]),
    /rename requires --name/,
  );
});

test("rename without --title is rejected", () => {
  assert.throws(
    () => parseRename(["--url", url, "--name", "Raw - Fact - Orders"]),
    /rename requires --title/,
  );
});

test("equal title and name is unchanged", () => {
  const parsed = parseRename([
    "--url",
    url,
    "--page",
    "Data",
    "--title",
    "Raw - Fact - Sales",
    "--name",
    "Raw - Fact - Sales",
  ]);
  assert.deepEqual(parsed, {
    url,
    page: "Data",
    title: "Raw - Fact - Sales",
    name: "Raw - Fact - Sales",
    unchanged: true,
  });
});

test("a raw title is accepted when the name differs", () => {
  const parsed = parseRename([
    "--url",
    url,
    "--title",
    "Raw - Fact - Sales",
    "--name",
    "Raw - Fact - Orders",
  ]);
  assert.equal(parsed.unchanged, false);
  assert.equal(parsed.title, "Raw - Fact - Sales");
  assert.equal(parsed.name, "Raw - Fact - Orders");
});
