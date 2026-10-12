import assert from "node:assert/strict";
import { test } from "node:test";
import { clearEveryControl, clearOneControl, writeControl } from "../dist/effects/control.js";

type Found = { title: string; inputTable: boolean };

function canvas(options?: { missing?: boolean }) {
  const found: string[] = [];
  const set: { title: string; value: string }[] = [];
  const cleared: string[] = [];
  const pages: string[] = [];
  const editor = {
    async findElement(title: string): Promise<Found> {
      found.push(title);
      if (options?.missing) throw new Error("not on canvas");
      return { title, inputTable: false };
    },
    async setControl(title: string, value: string): Promise<void> {
      set.push({ title, value });
    },
    async clearControl(title: string): Promise<void> {
      cleared.push(title);
    },
    async clearPageControls(page: string): Promise<void> {
      pages.push(page);
    },
  };
  return { editor, found, set, cleared, pages };
}

const unused = {
  async control(): Promise<string> {
    throw new Error("control lookup");
  },
  async column(): Promise<string> {
    throw new Error("column lookup");
  },
};

test("writeControl writes a static value onto v.probe", async () => {
  const { editor, found, set } = canvas();
  await writeControl(editor, "probe", { kind: "static", text: "north" }, unused);
  assert.deepEqual(found, ["v.probe"]);
  assert.deepEqual(set, [{ title: "v.probe", value: "north" }]);
});

test("writeControl writes another control's value onto v.probe", async () => {
  const { editor, found, set } = canvas();
  const asked: string[] = [];
  await writeControl(editor, "probe", { kind: "control", handle: "other" }, {
    async control(handle: string) {
      asked.push(handle);
      return "from-other";
    },
    column: unused.column,
  });
  assert.deepEqual(asked, ["other"]);
  assert.deepEqual(found, ["v.probe"]);
  assert.deepEqual(set, [{ title: "v.probe", value: "from-other" }]);
});

test("writeControl writes a column value onto v.probe", async () => {
  const { editor, found, set } = canvas();
  const asked: string[] = [];
  await writeControl(editor, "probe", { kind: "column", column: "amount" }, {
    control: unused.control,
    async column(column: string) {
      asked.push(column);
      return "42";
    },
  });
  assert.deepEqual(asked, ["amount"]);
  assert.deepEqual(found, ["v.probe"]);
  assert.deepEqual(set, [{ title: "v.probe", value: "42" }]);
});

test("writeControl throws missing handle and does not set the control", async () => {
  const { editor, set } = canvas({ missing: true });
  await assert.rejects(
    () => writeControl(editor, "probe", { kind: "static", text: "north" }, unused),
    /missing handle/,
  );
  assert.deepEqual(set, []);
});

test("clearOneControl clears v.probe", async () => {
  const { editor, found, cleared } = canvas();
  await clearOneControl(editor, "probe");
  assert.deepEqual(found, ["v.probe"]);
  assert.deepEqual(cleared, ["v.probe"]);
});

test("clearOneControl throws missing handle and does not clear", async () => {
  const { editor, cleared } = canvas({ missing: true });
  await assert.rejects(() => clearOneControl(editor, "probe"), /missing handle/);
  assert.deepEqual(cleared, []);
});

test("clearEveryControl clears every control on the page", async () => {
  const { editor, pages } = canvas();
  await clearEveryControl(editor, "Overview");
  assert.deepEqual(pages, ["Overview"]);
});
