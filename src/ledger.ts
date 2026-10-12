import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type OwnedWorkbook = {
  workbookId?: string;
  urlId: string;
  pathSegment: string;
  markedAt: string;
};

type LedgerFile = {
  workbooks: OwnedWorkbook[];
};

const ledgerDir = path.join(os.homedir(), ".sigma-playwrite-cli");
const ledgerPath = path.join(ledgerDir, "owned.json");

export function ledgerFilePath(): string {
  return ledgerPath;
}

export function loadOwned(): OwnedWorkbook[] {
  if (!fs.existsSync(ledgerPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as LedgerFile;
  return Array.isArray(parsed.workbooks) ? parsed.workbooks : [];
}

export function markOwned(entry: Omit<OwnedWorkbook, "markedAt">): OwnedWorkbook {
  const saved: OwnedWorkbook = { ...entry, markedAt: new Date().toISOString() };
  const rest = loadOwned().filter(
    (row) => row.pathSegment !== saved.pathSegment && row.urlId !== saved.urlId,
  );
  fs.mkdirSync(ledgerDir, { recursive: true });
  const body: LedgerFile = { workbooks: [...rest, saved] };
  const tmp = `${ledgerPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2));
  fs.renameSync(tmp, ledgerPath);
  return saved;
}

/** Identifiers long enough that a substring match is not an accident. */
export function ownedNeedles(row: OwnedWorkbook): string[] {
  return [row.workbookId, row.urlId, row.pathSegment].filter(
    (value): value is string => typeof value === "string" && value.length >= 8,
  );
}

export function matchingOwnedId(text: string, rows: OwnedWorkbook[]): string | undefined {
  for (const row of rows) {
    for (const needle of ownedNeedles(row)) {
      if (text.includes(needle)) return needle;
    }
  }
  return undefined;
}
