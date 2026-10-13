import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_WIDTH, applySize, orderEdgeUpdates, parseSize, planPlacement, type GridArea, type PlacementStep } from "../dist/place.js";

function sharesColumns(left: GridArea, right: GridArea): boolean {
  return left.colStart < right.colEnd && right.colStart < left.colEnd;
}

test("24x10 keeps the top-left and spans full width for 10 rows", () => {
  const current: GridArea = { rowStart: 3, colStart: 1, rowEnd: 24, colEnd: 25 };
  const size = parseSize(`${FULL_WIDTH}x10`);
  assert.equal(size.width, 24);
  assert.deepEqual(applySize(current, size), {
    rowStart: 3,
    colStart: 1,
    rowEnd: 13,
    colEnd: 25,
  });
});

test("a size needs widthxheight", () => {
  assert.throws(() => parseSize("24-10"), /expected widthxheight/);
  assert.throws(() => parseSize("0x10"), /at least 1x1/);
});

test("an upward move beside a full-width neighbor sidesteps onto column halves", () => {
  const current: GridArea = { rowStart: 4, colStart: 1, rowEnd: 5, colEnd: 13 };
  const target: GridArea = { rowStart: 3, colStart: 1, rowEnd: 4, colEnd: 13 };
  const neighbor: GridArea = { rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 13 };
  const plan = planPlacement(current, target, [neighbor]);

  let mover = current;
  let other = neighbor;
  let sawRowChange = false;
  for (const step of plan) {
    assert.ok(step.area.rowStart < step.area.rowEnd);
    assert.ok(step.area.colStart < step.area.colEnd);
    if (step.index === null) {
      const rowsChange = step.area.rowStart !== mover.rowStart || step.area.rowEnd !== mover.rowEnd;
      if (rowsChange) {
        sawRowChange = true;
        assert.equal(step.area.colStart, mover.colStart);
        assert.equal(step.area.colEnd, mover.colEnd);
        assert.equal(sharesColumns(mover, other), false);
        assert.equal(sharesColumns(step.area, other), false);
      }
      mover = step.area;
    } else {
      assert.equal(step.index, 0);
      other = step.area;
    }
  }

  assert.equal(sawRowChange, true);
  assert.deepEqual(mover, target);
  assert.equal(mover.rowEnd - mover.rowStart, target.rowEnd - target.rowStart);
  assert.deepEqual(other, neighbor);
  const last = plan[plan.length - 1] as PlacementStep;
  assert.equal(last.index, null);
  assert.deepEqual(last.area, target);

  const left = plan.find((step) => step.index === null && step.area.colEnd < current.colEnd);
  const right = plan.find((step) => step.index === 0 && step.area.colStart > neighbor.colStart);
  assert.ok(left);
  assert.ok(right);
  assert.ok(left.area.colStart < left.area.colEnd);
  assert.ok(right.area.colStart < right.area.colEnd);
  assert.equal(sharesColumns(left.area, right.area), false);
});

test("a move that does not meet another element keeps the direct edge order", () => {
  const current: GridArea = { rowStart: 4, colStart: 1, rowEnd: 5, colEnd: 5 };
  const target: GridArea = { rowStart: 3, colStart: 1, rowEnd: 4, colEnd: 5 };
  const neighbor: GridArea = { rowStart: 1, colStart: 8, rowEnd: 3, colEnd: 13 };
  const plan = planPlacement(current, target, [neighbor]);
  let cursor: GridArea = { ...current };
  const expected = orderEdgeUpdates(current, target).map((edge) => {
    cursor = { ...cursor, [edge]: target[edge] };
    return { index: null, area: { ...cursor } };
  });
  assert.deepEqual(plan, expected);
  const last = plan[plan.length - 1] as PlacementStep;
  assert.deepEqual(last.area, target);
  assert.equal(last.area.rowEnd - last.area.rowStart, target.rowEnd - target.rowStart);
});

test("column halves are both non-empty", () => {
  const current: GridArea = { rowStart: 3, colStart: 1, rowEnd: 4, colEnd: 4 };
  const target: GridArea = { rowStart: 2, colStart: 1, rowEnd: 3, colEnd: 4 };
  const neighbor: GridArea = { rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 4 };
  const plan = planPlacement(current, target, [neighbor]);
  const left = plan.find(
    (step) => step.index === null && step.area.colEnd - step.area.colStart < current.colEnd - current.colStart,
  );
  const right = plan.find((step) => step.index === 0 && step.area.colStart !== neighbor.colStart);
  assert.ok(left);
  assert.ok(right);
  assert.ok(left.area.colStart < left.area.colEnd);
  assert.ok(right.area.colStart < right.area.colEnd);
  assert.ok(left.area.rowStart < left.area.rowEnd);
  assert.ok(right.area.rowStart < right.area.rowEnd);
  assert.equal(sharesColumns(left.area, right.area), false);
});
