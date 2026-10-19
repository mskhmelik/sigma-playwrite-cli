import type { InsertValue } from "./editor.js";
import { fail } from "./errors.js";
import type { HandleKind } from "./handles.js";
import { refuseInsertColumn } from "./system-columns.js";

export type InsertAssignment =
  | { column: string; source: "control"; controlKind: HandleKind; handle: string }
  | { column: string; source: "static"; value: string }
  | { column: string; source: "formula"; formula: string };

function parseInsertSet(value: string): InsertAssignment {
  const eq = value.indexOf("=");
  if (eq < 1) fail(`set-action --set must be column=source:value, not ${JSON.stringify(value)}`);
  const column = value.slice(0, eq).trim();
  const rest = value.slice(eq + 1);
  const colon = rest.indexOf(":");
  if (!column || colon < 1) fail(`set-action --set must be column=source:value, not ${JSON.stringify(value)}`);
  refuseInsertColumn(column);
  const source = rest.slice(0, colon).trim();
  const payload = rest.slice(colon + 1);
  if (source === "control") {
    if ((payload[0] !== "c" && payload[0] !== "v") || payload[1] !== "." || payload.length < 3) {
      fail(`set-action control must be c.<name> or v.<name>, not ${JSON.stringify(payload)}`);
    }
    return { column, source: "control", controlKind: payload[0], handle: payload.slice(2) };
  }
  if (source === "static") {
    if (!payload) fail("set-action static value is empty");
    return { column, source: "static", value: payload };
  }
  if (source === "formula") {
    if (!payload.trim()) fail("set-action formula is empty");
    return { column, source: "formula", formula: payload };
  }
  fail(`set-action --set source must be control, static, or formula, not ${JSON.stringify(source)}`);
}

export function parseInsertSets(values: string[]): InsertAssignment[] {
  if (values.length === 0) fail("set-action insert-row requires --set");
  const sets: InsertAssignment[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const set = parseInsertSet(value);
    if (seen.has(set.column)) fail(`Duplicate --set column ${set.column}`);
    seen.add(set.column);
    sets.push(set);
  }
  return sets;
}

export function insertValues(sets: InsertAssignment[]): InsertValue[] {
  return sets.map((set) => {
    if (set.source === "control") {
      return { column: set.column, kind: "control", control: `${set.controlKind}.${set.handle}` };
    }
    if (set.source === "static") return { column: set.column, kind: "static", value: set.value };
    return { column: set.column, kind: "formula", formula: set.formula };
  });
}
