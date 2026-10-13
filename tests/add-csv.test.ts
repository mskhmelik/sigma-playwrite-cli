import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseAddCsv } from "../dist/add-csv.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "../package.json");

test("add-csv without --file is rejected", () => {
  assert.throws(
    () => parseAddCsv(["--url", url, "--title", "Raw - Fact - Sales", "--connection", "Snowflake"]),
    /add-csv requires --file/,
  );
});

test("add-csv without --connection is rejected", () => {
  assert.throws(
    () => parseAddCsv(["--url", url, "--file", file, "--title", "Raw - Fact - Sales"]),
    /add-csv requires --connection/,
  );
});

test("add-csv rejects a missing file", () => {
  const missing = path.join(here, "does-not-exist-add-csv.csv");
  assert.throws(
    () =>
      parseAddCsv([
        "--url",
        url,
        "--file",
        missing,
        "--title",
        "Raw - Fact - Sales",
        "--connection",
        "Snowflake",
      ]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /file not found/);
      assert.ok(error.message.includes(missing));
      return true;
    },
  );
});

test("add-csv rejects an unknown flag", () => {
  assert.throws(
    () =>
      parseAddCsv([
        "--url",
        url,
        "--file",
        file,
        "--title",
        "Raw - Fact - Sales",
        "--connection",
        "Snowflake",
        "--nope",
        "x",
      ]),
    /Unknown argument: --nope/,
  );
});

test("add-csv parses url, page, file, title, and connection", () => {
  assert.deepEqual(
    parseAddCsv([
      "--url",
      url,
      "--page",
      "Sales",
      "--file",
      file,
      "--title",
      "Raw - Fact - Sales",
      "--connection",
      "Snowflake",
    ]),
    {
      url,
      page: "Sales",
      file,
      title: "Raw - Fact - Sales",
      connection: "Snowflake",
    },
  );
});
