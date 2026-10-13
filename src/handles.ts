import { fail } from "./errors.js";

export type HandleKind = "c" | "v";

/** Canvas title and control id. `c` is user-facing. `v` is internal. */
export function controlTitle(kind: HandleKind, handle: string): string {
  const name = handle.trim();
  if (!name) fail("empty handle");
  return `${kind}.${name}`;
}

export function requireControlKind(value: string | undefined, command: string): HandleKind {
  if (value !== "c" && value !== "v") fail(`${command} requires --kind c or --kind v`);
  return value;
}
