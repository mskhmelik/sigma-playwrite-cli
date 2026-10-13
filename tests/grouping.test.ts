import assert from "node:assert/strict";
import { test } from "node:test";
import type { Editor } from "../src/editor.ts";
import { groupIntoExisting } from "../dist/effects/build.js";
import { groupingLanded, planGrouping } from "../dist/grouping.js";

const oneGroup = [["pk_product"]];
const together = [["pk_product", "nm_product"]];

test("a column already in that grouping is left there", () => {
  assert.deepEqual(planGrouping(together, "nm_product", "pk_product"), { action: "already" });
});

test("a column outside the grouping is moved onto it", () => {
  assert.deepEqual(planGrouping(oneGroup, "nm_product", "pk_product"), { action: "move" });
});

test("a missing grouping key is refused before a new grouping can start", () => {
  const plan = planGrouping([], "nm_product", "pk_product");
  assert.equal(plan.action, "refuse");
  if (plan.action === "refuse") assert.match(plan.reason, /No grouping contains "pk_product"/);
});

test("a new grouping level after the drop is a failure", () => {
  assert.match(
    groupingLanded(oneGroup, [["pk_product"], ["nm_product"]], "nm_product", "pk_product") ?? "",
    /second grouping/,
  );
});

test("groupIntoExisting drags onto the existing key and checks the landing", async () => {
  const calls: string[] = [];
  let levels = [["pk_product"]];
  const editor = {
    async findElement(title: string) {
      calls.push(`findElement:${title}`);
      return { title, inputTable: false };
    },
    async groupingKeys() {
      calls.push(`groupingKeys:${levels.map((keys) => keys.join("+")).join("|")}`);
      return levels.map((keys) => [...keys]);
    },
    async groupWith(title: string, column: string, withColumn: string) {
      calls.push(`groupWith:${title}:${column}:${withColumn}`);
      levels = [["pk_product", "nm_product"]];
    },
  } as Editor;
  await groupIntoExisting(editor, "Raw - Name products", "nm_product", "pk_product");
  assert.deepEqual(calls, [
    "findElement:Raw - Name products",
    "groupingKeys:pk_product",
    "groupWith:Raw - Name products:nm_product:pk_product",
    "groupingKeys:pk_product+nm_product",
  ]);
});

test("groupIntoExisting does not drag when the column is already in that grouping", async () => {
  const calls: string[] = [];
  const editor = {
    async findElement() {
      return { title: "Raw - Name products", inputTable: false };
    },
    async groupingKeys() {
      calls.push("groupingKeys");
      return [["pk_product", "nm_product"]];
    },
    async groupWith() {
      calls.push("groupWith");
    },
  } as Editor;
  await groupIntoExisting(editor, "Raw - Name products", "nm_product", "pk_product");
  assert.deepEqual(calls, ["groupingKeys"]);
});

test("groupIntoExisting refuses when the drag starts a second grouping", async () => {
  let read = 0;
  const editor = {
    async findElement() {
      return { title: "Raw - Name products", inputTable: false };
    },
    async groupingKeys() {
      read += 1;
      return read === 1 ? [["pk_product"]] : [["pk_product"], ["nm_product"]];
    },
    async groupWith() {},
  } as Editor;
  await assert.rejects(
    () => groupIntoExisting(editor, "Raw - Name products", "nm_product", "pk_product"),
    /second grouping/,
  );
});
