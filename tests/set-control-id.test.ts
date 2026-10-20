import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSetControlId } from "../dist/set-control-id.js";

const url = "https://app.sigmacomputing.com/papercrane/workbook/abcdefghij/edit";

const flags = ["--url", url, "--page", "Data", "--element", "element-id", "--id", "c.team_manager"];

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

test("parseSetControlId keeps url, page, element, and id", () => {
  assert.deepEqual(parseSetControlId(flags), {
    url,
    page: "Data",
    element: "element-id",
    id: "c.team_manager",
  });
});

test("parseSetControlId requires --url", () => {
  assert.throws(() => parseSetControlId(without(flags, "--url")), /set-control-id requires --url/);
});

test("parseSetControlId requires --element", () => {
  assert.throws(() => parseSetControlId(without(flags, "--element")), /set-control-id requires --element/);
  assert.throws(
    () => parseSetControlId(flags.map((value) => (value === "element-id" ? "  " : value))),
    /set-control-id requires --element/,
  );
});

test("parseSetControlId requires --id", () => {
  assert.throws(() => parseSetControlId(without(flags, "--id")), /set-control-id requires --id/);
  assert.throws(
    () => parseSetControlId(flags.map((value) => (value === "c.team_manager" ? "  " : value))),
    /set-control-id requires --id/,
  );
});

test("parseSetControlId rejects --kind as an unknown argument", () => {
  assert.throws(() => parseSetControlId([...flags, "--kind", "c"]), /Unknown argument: --kind/);
});

test("parseSetControlId rejects --title as an unknown argument", () => {
  assert.throws(() => parseSetControlId([...flags, "--title", "Team manager"]), /Unknown argument: --title/);
});
