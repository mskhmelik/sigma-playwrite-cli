import assert from "node:assert/strict";
import { test } from "node:test";
import { runSequence } from "../dist/effects/sequence.js";

test("runSequence runs steps in order", async () => {
  const order: string[] = [];
  await runSequence([
    async () => {
      order.push("first");
    },
    async () => {
      order.push("second");
    },
    async () => {
      order.push("third");
    },
  ]);
  assert.deepEqual(order, ["first", "second", "third"]);
});

test("runSequence does not run later steps when one rejects", async () => {
  const order: string[] = [];
  await assert.rejects(
    () =>
      runSequence([
        async () => {
          order.push("first");
        },
        async () => {
          order.push("second");
          throw new Error("second step failed");
        },
        async () => {
          order.push("third");
        },
      ]),
    /second step failed/,
  );
  assert.deepEqual(order, ["first", "second"]);
});
