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

/** Columns Sigma fills. An insert action must not write them. */
export const RESERVED_INSERT_COLUMNS = [
  "Created by",
  "Created at",
  "Last updated by",
  "Last updated at",
  "ID",
  "Row ID",
  "id",
  "nm_created_by",
  "dt_created_at",
  "nm_updated_by",
  "dt_updated_at",
] as const;

export function refuseInsertColumn(column: string): void {
  if ((RESERVED_INSERT_COLUMNS as readonly string[]).includes(column)) {
    fail(`set-action insert-row cannot write ${JSON.stringify(column)}. Sigma fills that column.`);
  }
}

/** Approval headers delete-column must not remove. */
export const DELETE_REFUSED_COLUMNS = [
  "txt_approval_status",
  "nm_approved_by",
  "dt_approved_at",
  "txt_approval_comment",
] as const;

export type ColumnDeleteAction = "skip" | "delete" | "refuse";

/**
 * An approval header is refuse, including when it is already absent.
 * Any other absent header is skip. A header that is present is delete.
 */
export function columnDeleteAction(column: string, headers: readonly string[]): ColumnDeleteAction {
  if ((DELETE_REFUSED_COLUMNS as readonly string[]).includes(column)) return "refuse";
  if (!headers.includes(column)) return "skip";
  return "delete";
}

export function refuseDeleteColumn(column: string): void {
  if (columnDeleteAction(column, []) === "refuse") {
    fail(`delete-column cannot delete ${JSON.stringify(column)}.`);
  }
}
