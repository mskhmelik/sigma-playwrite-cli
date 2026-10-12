import assert from "node:assert/strict";
import { test } from "node:test";
import { performAction } from "../dist/actions.js";
import { applyCreate } from "../dist/create.js";

const lookup = {
  async control(): Promise<string> {
    return "";
  },
  async column(): Promise<string> {
    return "";
  },
};

function editor(options?: { failFind?: boolean; inputTable?: boolean }) {
  const calls: string[] = [];
  return {
    calls,
    editor: {
      async findPage(name: string) {
        calls.push(`findPage:${name}`);
        if (options?.failFind) throw new Error("missing page");
      },
      async findElement(title: string) {
        calls.push(`findElement:${title}`);
        if (options?.failFind) throw new Error("missing title");
        return { title, inputTable: options?.inputTable ?? true };
      },
      async insertRow(title: string) {
        calls.push(`insertRow:${title}`);
      },
      async addPage(name: string) {
        calls.push(`addPage:${name}`);
        if (options?.failFind) throw new Error("add failed");
      },
    },
  };
}

test("a successful insert marks the workbook after the edit", async () => {
  const { editor: fake, calls } = editor();
  let marks = 0;
  await performAction(fake as never, { kind: "insert-row", title: "names" }, lookup, () => {
    marks += 1;
  });
  assert.deepEqual(calls, ["findElement:names", "insertRow:names"]);
  assert.equal(marks, 1);
});

test("a failed insert does not mark the workbook", async () => {
  const { editor: fake } = editor({ failFind: true });
  let marks = 0;
  await assert.rejects(
    () => performAction(fake as never, { kind: "insert-row", title: "names" }, lookup, () => {
      marks += 1;
    }),
    /missing title/,
  );
  assert.equal(marks, 0);
});

test("navigate does not mark the workbook", async () => {
  const { editor: fake } = editor();
  let marks = 0;
  await performAction(fake as never, { kind: "navigate", destination: "test" }, lookup, () => {
    marks += 1;
  });
  assert.equal(marks, 0);
});

test("a successful add-page marks the workbook after the edit", async () => {
  const calls: string[] = [];
  const fake = {
    async findPage(name: string) {
      calls.push(`findPage:${name}`);
      throw new Error("missing page");
    },
    async addPage(name: string) {
      calls.push(`addPage:${name}`);
    },
  };
  let marks = 0;
  await applyCreate(fake as never, { kind: "add-page", url: "https://example.test/workbook", name: "test" }, () => {
    marks += 1;
  });
  assert.deepEqual(calls, ["findPage:test", "addPage:test"]);
  assert.equal(marks, 1);
});

test("a failed add-page does not mark the workbook", async () => {
  let marks = 0;
  const fake = {
    async findPage() {
      throw new Error("missing page");
    },
    async addPage() {
      throw new Error("add failed");
    },
  };
  await assert.rejects(
    () => applyCreate(fake as never, { kind: "add-page", url: "https://example.test/workbook", name: "test" }, () => {
      marks += 1;
    }),
    /add failed/,
  );
  assert.equal(marks, 0);
});
