import { fail } from "./errors.js";

function wordsOf(title: string): string[] {
  return title.trim().split(/\s+/).filter((word) => word.length > 0);
}

/** Sentence case: first word starts with a capital, and no word is all capitals. */
export function isSentenceCase(title: string): boolean {
  const words = wordsOf(title);
  if (words.length === 0) return false;
  if (!/^[A-Z]/.test(words[0] ?? "")) return false;
  return words.every((word) => {
    const letters = word.replace(/[^A-Za-z]/g, "");
    return letters.length < 2 || letters !== letters.toUpperCase();
  });
}

export function requireSentenceCase(title: string, label: string): void {
  if (!isSentenceCase(title)) fail(`${label} must be sentence case`);
}

/** `BE - <Sentence case>` or `FE - <Sentence case>`. */
export function requireTableTitle(title: string): void {
  const match = /^(BE|FE) - (.+)$/.exec(title.trim());
  if (!match?.[2] || !isSentenceCase(match[2])) {
    fail("add input-table requires a BE - or FE - title in sentence case");
  }
}
