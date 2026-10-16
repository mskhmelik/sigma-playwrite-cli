export const containerBorder = "1px solid var(--color-border)";

export function cornerRadius(name: "Pill" | "Square"): string {
  if (name === "Square") return "0px";
  return "8px";
}

export function selectionClick(index: number): { modifiers: Array<"Shift">; force: boolean } {
  if (index === 0) return { modifiers: [], force: false };
  return { modifiers: ["Shift"], force: true };
}

/** Group the current selection. Works for one element or several. */
export const groupShortcut = "Meta+G";
export const inspectorHeader = "inspector-header";
