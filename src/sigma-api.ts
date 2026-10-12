import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { loadOwned, matchingOwnedId } from "./ledger.js";

const SIGMA = process.env.SIGMA_BIN || "/opt/homebrew/bin/sigma";

export function sigmaBinary(): string {
  return SIGMA;
}

function fileArgs(args: string[]): string[] {
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("@") && arg !== "@-" && !arg.startsWith("@-")) {
      files.push(arg.slice(1));
    }
    const eq = arg.match(/^--(?:body|params|json)=@(.+)$/);
    if (eq && eq[1] !== "-") files.push(eq[1]);
    if ((arg === "--body" || arg === "--params" || arg === "--json") && args[i + 1]?.startsWith("@") && args[i + 1] !== "@-") {
      files.push(args[i + 1].slice(1));
    }
  }
  return files;
}

export function textTouchedByArgs(args: string[]): string {
  const chunks = [...args];
  for (const file of fileArgs(args)) {
    try {
      chunks.push(fs.readFileSync(file, "utf8"));
    } catch {
      chunks.push(file);
    }
  }
  return chunks.join("\n");
}

export function refuseIfOwned(args: string[]): void {
  const hit = matchingOwnedId(textTouchedByArgs(args), loadOwned());
  if (!hit) return;
  console.error(
    `Refusing sigma call: workbook ${hit} is Playwright-owned. A later Sigma CLI write would replace the document and drop components the API cannot store.`,
  );
  process.exit(1);
}

export function runApi(args: string[]): never {
  refuseIfOwned(args);
  const result = spawnSync(SIGMA, ["api", ...args], { stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${SIGMA}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

type WorkbookEntry = {
  workbookId?: string;
  url?: string;
};

type WorkbookList = {
  entries?: WorkbookEntry[];
  nextPage?: string | null;
};

function parseJson(stdout: string): WorkbookList {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("sigma workbooks list did not return JSON");
  return JSON.parse(stdout.slice(start)) as WorkbookList;
}

function urlIdOf(entryUrl: string): string | undefined {
  try {
    const parts = new URL(entryUrl).pathname.split("/").filter(Boolean);
    const index = parts.indexOf("workbook");
    return index >= 0 ? parts[index + 1] : undefined;
  } catch {
    return undefined;
  }
}

export function segmentMatchesEntry(pathSegment: string, entryUrl: string): boolean {
  const urlId = urlIdOf(entryUrl);
  if (!urlId) return false;
  return pathSegment === urlId || pathSegment.endsWith(`-${urlId}`);
}

/** Resolve the API workbook id before any Playwright edit. Read-only. */
export function findWorkbook(pathSegment: string): { workbookId?: string; urlId: string } {
  let pageToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const params: Record<string, string> = { limit: "50" };
    if (pageToken) params.page = pageToken;
    const result = spawnSync(
      SIGMA,
      ["api", "workbooks", "list", "--params", JSON.stringify(params), "-f", "json"],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      return { urlId: pathSegment };
    }
    const body = parseJson(result.stdout || "");
    for (const entry of body.entries ?? []) {
      if (!entry.url || !segmentMatchesEntry(pathSegment, entry.url)) continue;
      return {
        workbookId: entry.workbookId,
        urlId: urlIdOf(entry.url) ?? pathSegment,
      };
    }
    if (!body.nextPage) break;
    pageToken = body.nextPage;
  }
  return { urlId: pathSegment };
}
