import assert from "node:assert/strict";
import { test } from "node:test";
import { Exit } from "../dist/errors.js";
import { parseSelectionMove } from "../dist/selection-parse.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

function rejects(run: () => void, message: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Exit);
    assert.equal(error.message, message);
    return true;
  });
}

test("two titles and rows 2 keep url, title order, and an omitted page", () => {
  assert.deepEqual(
    parseSelectionMove([
      "--title",
      "Raw - Fact - Sales",
      "--url",
      url,
      "--rows",
      "2",
      "--title",
      "Raw - Fact - Orders",
    ]),
    {
      url,
      page: undefined,
      titles: ["Raw - Fact - Sales", "Raw - Fact - Orders"],
      rows: 2,
    },
  );
});

test("negative rows are a non-zero integer", () => {
  const parsed = parseSelectionMove([
    "--url",
    url,
    "--title",
    "Raw - Fact - Sales",
    "--title",
    "Raw - Fact - Orders",
    "--rows",
    "-3",
  ]);
  assert.equal(parsed.rows, -3);
});

test("page is absent unless --page is present", () => {
  const absent = parseSelectionMove([
    "--url",
    url,
    "--title",
    "Raw - Fact - Sales",
    "--title",
    "Raw - Fact - Orders",
    "--rows",
    "2",
  ]);
  assert.equal(absent.page, undefined);
  const present = parseSelectionMove([
    "--url",
    url,
    "--page",
    "Data",
    "--title",
    "Raw - Fact - Sales",
    "--title",
    "Raw - Fact - Orders",
    "--rows",
    "2",
  ]);
  assert.equal(present.page, "Data");
});

test("missing url is rejected", () => {
  rejects(
    () => parseSelectionMove(["--title", "Raw - Fact - Sales", "--title", "Raw - Fact - Orders", "--rows", "2"]),
    "selection-move requires --url",
  );
});

test("one title is rejected", () => {
  rejects(
    () => parseSelectionMove(["--url", url, "--title", "Raw - Fact - Sales", "--rows", "2"]),
    "selection-move requires at least two --title values",
  );
});

test("missing rows is rejected", () => {
  rejects(
    () => parseSelectionMove(["--url", url, "--title", "Raw - Fact - Sales", "--title", "Raw - Fact - Orders"]),
    "selection-move requires --rows",
  );
});

test("rows 0 is rejected", () => {
  rejects(
    () => parseSelectionMove(["--url", url, "--title", "Raw - Fact - Sales", "--title", "Raw - Fact - Orders", "--rows", "0"]),
    "selection-move requires a non-zero integer --rows",
  );
});

test("rows 1.5 is rejected", () => {
  rejects(
    () =>
      parseSelectionMove(["--url", url, "--title", "Raw - Fact - Sales", "--title", "Raw - Fact - Orders", "--rows", "1.5"]),
    "selection-move requires a non-zero integer --rows",
  );
});

test("a duplicate title is rejected", () => {
  rejects(
    () =>
      parseSelectionMove([
        "--url",
        url,
        "--title",
        "Raw - Fact - Sales",
        "--title",
        "Raw - Fact - Orders",
        "--title",
        "Raw - Fact - Sales",
        "--rows",
        "2",
      ]),
    "selection-move title appears twice: Raw - Fact - Sales",
  );
});

test("an unknown option is rejected", () => {
  rejects(
    () =>
      parseSelectionMove([
        "--url",
        url,
        "--title",
        "Raw - Fact - Sales",
        "--title",
        "Raw - Fact - Orders",
        "--rows",
        "2",
        "--layout",
        "Sales:1,1,11,25",
      ]),
    "Unknown selection-move option: --layout",
  );
});
