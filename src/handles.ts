import { fail } from "./errors.js";

export type HandleKind = "c" | "v";

/** Canvas title and control id. `c` is user-facing. `v` is internal. */
export function controlTitle(kind: HandleKind, handle: string): string {
  const name = handle.trim();
  if (!name) fail("empty handle");
  return `${kind}.${name}`;
}

export function containerTitle(handle: string): string {
  const name = handle.trim();
  if (!name) fail("empty handle");
  return `cnt.${name}`;
}

/** Page-tab title for a drawer. Not sentence case. */
export function drawerTitle(handle: string): string {
  const name = handle.trim();
  if (!name) fail("empty handle");
  return `d.${name}`;
}

export function requireControlKind(value: string | undefined, command: string): HandleKind {
  if (value !== "c" && value !== "v") fail(`${command} requires --kind c or --kind v`);
  return value;
}

/**
 * The canvas title wins. A control-id match is used only when that title is absent.
 * Neither branch creates a control.
 */
export function resolveListControl(canvasId: string | null, controlId: string | null, title: string): string {
  if (canvasId) return canvasId;
  if (controlId) return controlId;
  fail(`Control ${JSON.stringify(title)} was not found. Nothing was changed.`);
}
