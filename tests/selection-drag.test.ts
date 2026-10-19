import assert from "node:assert/strict";
import { test } from "node:test";
import { dragDeltaY, movedArea } from "../dist/selection-drag.js";

test("movedArea shifts both row lines and keeps the column span", () => {
  const area = { rowStart: 3, colStart: 1, rowEnd: 8, colEnd: 13 };
  const down = movedArea(area, 2);
  const up = movedArea(area, -1);
  assert.deepEqual(down, { rowStart: 5, colStart: 1, rowEnd: 10, colEnd: 13 });
  assert.deepEqual(up, { rowStart: 2, colStart: 1, rowEnd: 7, colEnd: 13 });
  assert.equal(down.rowEnd - down.rowStart, area.rowEnd - area.rowStart);
  assert.equal(down.colEnd - down.colStart, area.colEnd - area.colStart);
  assert.equal(up.rowEnd - up.rowStart, area.rowEnd - area.rowStart);
  assert.equal(up.colEnd - up.colStart, area.colEnd - area.colStart);
  assert.equal(dragDeltaY(20, -3), -60);
});
