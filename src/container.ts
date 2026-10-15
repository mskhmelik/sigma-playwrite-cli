export const containerBorder = "1px solid var(--color-border)";

export function cornerRadius(name: "Pill" | "Square"): string {
  if (name === "Square") return "0px";
  return "8px";
}

export function selectionClick(index: number): { modifiers: Array<"Meta">; force: boolean } {
  if (index === 0) return { modifiers: [], force: false };
  return { modifiers: ["Meta"], force: true };
}

export const createContainerButton = "grid-layout-container-from-selected";
export const inspectorHeader = "inspector-header";
