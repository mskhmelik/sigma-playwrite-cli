import assert from "node:assert/strict";
import { test } from "node:test";
import { controlTitle } from "../dist/handles.js";

test("a user-facing handle is the canvas title c.<name>", () => {
  assert.equal(controlTitle("c", "name"), "c.name");
});

test("an internal handle is the canvas title v.<name>", () => {
  assert.equal(controlTitle("v", "total"), "v.total");
});

test("an empty handle is rejected", () => {
  assert.throws(() => controlTitle("c", ""), /empty handle/);
});
