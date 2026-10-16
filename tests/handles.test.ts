import assert from "node:assert/strict";
import { test } from "node:test";
import { controlTitle, containerTitle, drawerTitle } from "../dist/handles.js";

test("a user-facing handle is the canvas title c.<name>", () => {
  assert.equal(controlTitle("c", "name"), "c.name");
});

test("an internal handle is the canvas title v.<name>", () => {
  assert.equal(controlTitle("v", "total"), "v.total");
});

test("an empty handle is rejected", () => {
  assert.throws(() => controlTitle("c", ""), /empty handle/);
});

test("a container handle is the inspector title cnt.<name>", () => {
  assert.equal(containerTitle("variables_employee"), "cnt.variables_employee");
});

test("an empty container handle is rejected", () => {
  assert.throws(() => containerTitle("  "), /empty handle/);
});

test("a drawer handle is the page title d.<name>", () => {
  assert.equal(drawerTitle("employee"), "d.employee");
});

test("an empty drawer handle is rejected", () => {
  assert.throws(() => drawerTitle("  "), /empty handle/);
});
