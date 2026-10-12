export function parseOrder(raw: string): string[] {
  const titles = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (titles.length === 0) {
    throw new Error("--order is empty");
  }
  const seen = new Set<string>();
  for (const title of titles) {
    if (seen.has(title)) throw new Error(`Duplicate title in --order: ${title}`);
    seen.add(title);
  }
  return titles;
}

export function sameTitleSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((title, index) => title === b[index]);
}

export function topsIncrease(ys: number[]): boolean {
  for (let i = 1; i < ys.length; i++) {
    if (!(ys[i] > ys[i - 1])) return false;
  }
  return ys.length > 0;
}
