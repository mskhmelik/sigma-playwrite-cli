import { fail } from "./errors.js";

export type SelectionMove = {
  url: string;
  page: string | undefined;
  titles: string[];
  rows: number;
};

/** Parse selection-move flags. Does not open a browser. */
export function parseSelectionMove(args: string[]): SelectionMove {
  let url: string | undefined;
  let page: string | undefined;
  const titles: string[] = [];
  let rowsText: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag !== "--url" && flag !== "--page" && flag !== "--title" && flag !== "--rows") {
      fail(`Unknown selection-move option: ${flag}`);
    }
    const value = args[i + 1];
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    if (flag === "--url") url = value;
    if (flag === "--page") page = value;
    if (flag === "--title") titles.push(value);
    if (flag === "--rows") rowsText = value;
    i++;
  }

  if (!url) fail("selection-move requires --url");
  if (titles.length < 2) fail("selection-move requires at least two --title values");
  const seen = new Set<string>();
  for (const title of titles) {
    if (seen.has(title)) fail(`selection-move title appears twice: ${title}`);
    seen.add(title);
  }
  if (rowsText === undefined) fail("selection-move requires --rows");
  if (!/^-?[1-9]\d*$/.test(rowsText)) fail("selection-move requires a non-zero integer --rows");
  const rows = Number(rowsText);
  if (!Number.isSafeInteger(rows)) fail("selection-move requires a non-zero integer --rows");

  return { url, page, titles, rows };
}
