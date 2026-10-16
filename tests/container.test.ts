import assert from "node:assert/strict";
import { test } from "node:test";
import { containerBorder, cornerRadius, groupShortcut, selectionClick } from "../dist/container.js";
import { addNamedContainer } from "../dist/effects/build.js";
import type { Editor } from "../src/editor.ts";

test("a new container is a 1px border with Pill corners", () => {
  assert.equal(containerBorder, "1px solid var(--color-border)");
  assert.equal(cornerRadius("Pill"), "8px");
  assert.equal(cornerRadius("Square"), "0px");
});

test("later elements are added to the selection with Shift", () => {
  assert.deepEqual(selectionClick(0), { modifiers: [], force: false });
  assert.deepEqual(selectionClick(1), { modifiers: ["Shift"], force: true });
  assert.equal(groupShortcut, "Meta+G");
});

function containerEditor(present: string[], styled: string[] = []): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const editor = {
    async hasContainer(title: string) {
      calls.push(`hasContainer:${title}`);
      return present.includes(title);
    },
    async containerStyled(title: string) {
      calls.push(`containerStyled:${title}`);
      return styled.includes(title);
    },
    async paintContainer(title: string, border: string, radius: string) {
      calls.push(`paintContainer:${title}:${border}:${radius}`);
    },
    async findElement(title: string) {
      calls.push(`findElement:${title}`);
      if (!present.includes(title)) throw new Error("not on the page");
      return { title, inputTable: false };
    },
    async addContainer(titles: string[], title: string, border: string, radius: string) {
      calls.push(`addContainer:${titles.join(",")}:${title}:${border}:${radius}`);
    },
  } as Editor;
  return { editor, calls };
}

test("add container wraps the named elements and titles it cnt.<handle>", async () => {
  const { editor, calls } = containerEditor(["Employee", "Role"]);
  await addNamedContainer(editor, "variables_employee", ["Employee", "Role"]);
  assert.deepEqual(calls, [
    "hasContainer:cnt.variables_employee",
    "findElement:Employee",
    "findElement:Role",
    "addContainer:Employee,Role:cnt.variables_employee:1px solid var(--color-border):8px",
  ]);
});

test("a missing element does not create the container", async () => {
  const { editor, calls } = containerEditor(["Employee"]);
  await assert.rejects(
    () => addNamedContainer(editor, "variables_employee", ["Employee", "Campaign"]),
    /missing title/,
  );
  assert.equal(calls.some((call) => call.startsWith("addContainer")), false);
  assert.equal(calls[0], "hasContainer:cnt.variables_employee");
});

test("an existing cnt.<handle> is left as it is", async () => {
  const { editor, calls } = containerEditor(["cnt.variables_employee", "Employee"], ["cnt.variables_employee"]);
  await addNamedContainer(editor, "variables_employee", ["Employee"]);
  assert.deepEqual(calls, [
    "hasContainer:cnt.variables_employee",
    "containerStyled:cnt.variables_employee",
  ]);
});

test("a titled container without a frame is painted", async () => {
  const { editor, calls } = containerEditor(["cnt.variables_employee", "Employee"]);
  await addNamedContainer(editor, "variables_employee", ["Employee"]);
  assert.deepEqual(calls, [
    "hasContainer:cnt.variables_employee",
    "containerStyled:cnt.variables_employee",
    "paintContainer:cnt.variables_employee:1px solid var(--color-border):8px",
  ]);
});
