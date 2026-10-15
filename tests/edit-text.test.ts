import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paddingBoxes, paddingInput, paddingOn, textColorLanded, uniqueIds } from "../dist/edit.js";
import { componentId, elementHosts } from "../dist/place.js";

describe("text element ids", () => {
  it("counts one new text element when the same id is listed three times", () => {
    assert.deepEqual(uniqueIds(["rrV6BMc4FF", "rrV6BMc4FF", "rrV6BMc4FF"]), ["rrV6BMc4FF"]);
  });
});

describe("padding", () => {
  it("turns padding on from the Select checkbox in the Padding row", () => {
    const candidates = [
      { kind: "label" as const, text: "Padding", row: 0 },
      { kind: "input" as const, text: "Select", row: 0 },
    ];
    assert.equal(paddingInput(candidates), 1);
    assert.equal(paddingOn("padding: calc(2 * var(--space-unit));", "16px"), true);
    assert.equal(paddingOn("", "0px"), false);
    assert.deepEqual(paddingBoxes(['[data-testid="element_rrV6BMc4FF"]']), [
      '[data-testid="element_rrV6BMc4FF"] [data-testid="text-element-box"]',
    ]);
  });
});

describe("text color", () => {
  it("lands white on the selected text as a fontcolor mark", () => {
    const mark = '<fontcolor style="color: rgb(255, 255, 255);">Variables</fontcolor>';
    assert.equal(textColorLanded(mark, "Variables"), true);
    assert.equal(textColorLanded("rgb(255, 255, 255)", ""), false);
  });
});

describe("text element host", () => {
  it("finds a text element that has element_ and no dynamic title", () => {
    assert.equal(componentId({ selectable: "", testId: "element_rrV6BMc4FF" }), "rrV6BMc4FF");
    assert.ok(elementHosts("rrV6BMc4FF").includes('[data-testid="element_rrV6BMc4FF"]'));
  });
});
