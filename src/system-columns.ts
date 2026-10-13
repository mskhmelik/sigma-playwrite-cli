import { fail } from "./errors.js";

/** Menu labels under Add new column on an empty or CSV input table. */
export const SYSTEM_COLUMNS = [
  "Row ID",
  "Last updated at",
  "Last updated by",
  "Created at",
  "Created by",
] as const;

/** The columns panel titles Row ID as ID. The menu label stays Row ID. */
export function columnTitle(menuLabel: string): string {
  return menuLabel === "Row ID" ? "ID" : menuLabel;
}

export function requireSystemColumn(label: string): void {
  if (!(SYSTEM_COLUMNS as readonly string[]).includes(label)) {
    fail(
      `add-column column must be a system column, not ${JSON.stringify(label)}. Allowed: ${SYSTEM_COLUMNS.join(", ")}`,
    );
  }
}
