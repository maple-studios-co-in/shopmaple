/**
 * The statement band's line in four runs: the lead that stays still, then the closing clause the
 * homepage types out — its plain words, the last word (set in italic script) and the full stop after it.
 * "Elegance isn’t found. At Maple, it is crafted." types "it is crafted.": the words after the last
 * comma, or after the last full stop, or the last two words before the accent when neither exists.
 */
export type StatementParts = { lead: string; before: string; accent: string; after: string };

export function statementParts(text: string): StatementParts | null {
  const match = /^(.*?)([^\s.]+)(\.?)\s*$/s.exec(text);
  if (!match) return null;
  const head = match[1]!, accent = match[2]!, after = match[3]!;
  const comma = head.lastIndexOf(", ");
  const stop = head.lastIndexOf(". ");
  let cut = comma >= 0 ? comma + 2 : stop >= 0 ? stop + 2 : -1;
  if (cut < 0) {
    const words = head.trimEnd().split(/\s+/);
    const typedWords = words.slice(-2).join(" ");
    cut = typedWords ? head.trimEnd().length - typedWords.length : head.length;
  }
  return { lead: head.slice(0, cut), before: head.slice(cut), accent, after };
}
