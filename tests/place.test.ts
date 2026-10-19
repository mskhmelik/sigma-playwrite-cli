import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FULL_WIDTH,
  applySize,
  nextDragPixels,
  orderEdgeUpdates,
  parseSize,
  componentLabel,
  planPage,
  planPlacement,
  targetsOccupied,
  unitPixels,
  visibleClick,
  type GridArea,
  type PlacementStep,
} from "../dist/place.js";

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

test("a tall element is clicked where it crosses the window", () => {
  const rect = { x: 40, y: -500, width: 300, height: 1200 };
  const title = { x: 190, y: -20 };
  const viewport = { width: 1000, height: 800 };
  const point = visibleClick(rect, title, viewport);
  assert.ok(point);
  assert.ok(point.x >= 0 && point.x < viewport.width);
  assert.ok(point.y >= 0 && point.y < viewport.height);
  assert.equal(visibleClick({ x: 10, y: -200, width: 50, height: 40 }, { x: 20, y: -180 }, viewport), null);
});

test("a text tile without a dynamic title is named from its text", () => {
  assert.equal(componentLabel([], "Raw data\nbody"), "Raw data");
  assert.equal(componentLabel(["People"], "Raw data"), "People");
});

test("one measured row is one drag, and a row past comes back one row", () => {
  const area: GridArea = { rowStart: 1, colStart: 1, rowEnd: 11, colEnd: 25 };
  assert.equal(unitPixels({ width: 240, height: 300 }, area, "rowEnd"), 30);
  assert.equal(unitPixels({ width: 240, height: 300 }, area, "colStart"), 10);
  assert.equal(nextDragPixels(3, 30), 30);
  assert.equal(nextDragPixels(-1, 30), -30);
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

function areasOverlap(left: GridArea, right: GridArea): boolean {
  return left.rowStart < right.rowEnd && right.rowStart < left.rowEnd && left.colStart < right.colEnd && right.colStart < left.colEnd;
}

test("a stack becomes three across without overlapping on the way", () => {
  const items = [
    {
      index: 0,
      current: { rowStart: 1, colStart: 1, rowEnd: 11, colEnd: 25 },
      target: { rowStart: 1, colStart: 1, rowEnd: 11, colEnd: 9 },
    },
    {
      index: 1,
      current: { rowStart: 11, colStart: 1, rowEnd: 21, colEnd: 25 },
      target: { rowStart: 1, colStart: 9, rowEnd: 11, colEnd: 17 },
    },
    {
      index: 2,
      current: { rowStart: 21, colStart: 1, rowEnd: 31, colEnd: 25 },
      target: { rowStart: 1, colStart: 17, rowEnd: 11, colEnd: 25 },
    },
  ];
  assert.equal(targetsOccupied(items, []), true);
  const steps = planPage(items, []);
  const live = items.map((item) => ({ ...item.current }));
  for (const step of steps) {
    const before = live[step.index];
    if (!before) throw new Error(`missing item ${step.index}`);
    const others = live.filter((_, index) => index !== step.index);
    const plan = planPlacement(before, step.area, others);
    assert.ok(plan.every((part) => part.index === null));
    if (plan.length > 0) assert.deepEqual(plan[plan.length - 1]?.area, step.area);
    live[step.index] = { ...step.area };
    for (let left = 0; left < live.length; left += 1) {
      for (let right = left + 1; right < live.length; right += 1) {
        assert.equal(areasOverlap(live[left]!, live[right]!), false);
      }
    }
  }
  assert.deepEqual(live[0], items[0]?.target);
  assert.deepEqual(live[1], items[1]?.target);
  assert.deepEqual(live[2], items[2]?.target);
});

test("a lane clear that is not a direct drag still finishes on the targets", () => {
  const items = [
    {
      index: 0,
      current: { rowStart: 1, colStart: 1, rowEnd: 4, colEnd: 13 },
      target: { rowStart: 8, colStart: 1, rowEnd: 11, colEnd: 13 },
    },
  ];
  const obstacle: GridArea = { rowStart: 4, colStart: 1, rowEnd: 8, colEnd: 13 };
  const steps = planPage(items, [obstacle]);
  const live = items.map((item) => ({ ...item.current }));
  let sawSidestep = false;
  for (const step of steps) {
    const before = live[step.index];
    if (!before) throw new Error(`missing item ${step.index}`);
    const others = [...live.filter((_, index) => index !== step.index), obstacle];
    const plan = planPlacement(before, step.area, others);
    if (plan.some((part) => part.index !== null)) sawSidestep = true;
    live[step.index] = { ...step.area };
  }
  assert.equal(sawSidestep, true);
  assert.deepEqual(live[0], items[0]?.target);
});

test("a free target beside a full-width neighbor does not take the lane", () => {
  const item = {
    index: 0,
    current: { rowStart: 4, colStart: 1, rowEnd: 5, colEnd: 13 },
    target: { rowStart: 3, colStart: 1, rowEnd: 4, colEnd: 13 },
  };
  const neighbor: GridArea = { rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 13 };
  assert.equal(targetsOccupied([item], [neighbor]), false);
  const plan = planPlacement(item.current, item.target, [neighbor]);
  assert.ok(plan.some((step) => step.index === 0));
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
