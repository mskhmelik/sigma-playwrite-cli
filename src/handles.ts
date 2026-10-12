import { fail } from "./errors.js";

export type HandleKind = "variable" | "system";

/** Canvas title for a caller-chosen handle. Variable is `v.<handle>`, system is `sys.<handle>`. */
export function controlTitle(kind: HandleKind, handle: string): string {
  const name = handle.trim();
  if (!name) fail("empty handle");
  return kind === "variable" ? `v.${name}` : `sys.${name}`;
}
