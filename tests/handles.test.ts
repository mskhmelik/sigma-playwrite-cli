import assert from "node:assert/strict";
import { test } from "node:test";
import { controlTitle } from "../dist/handles.js";

test("a variable handle is the canvas title v.<handle>", () => {
  assert.equal(controlTitle("variable", "item_id"), "v.item_id");
});

test("a system handle is the canvas title sys.<handle>", () => {
  assert.equal(controlTitle("system", "company_name"), "sys.company_name");
});

test("an empty handle is rejected", () => {
  assert.throws(() => controlTitle("variable", ""), /empty handle/);
});
