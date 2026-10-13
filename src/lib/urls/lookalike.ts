import { orgDomain } from "../net/domain.ts";

/**
 * Letters from other scripts that render like Latin ones — a subset of
 * Unicode's confusables.txt, enough for the spoofs seen in mail.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  "а": "a", "в": "b", "е": "e", "ё": "e", "і": "i", "ї": "i", "ј": "j", "к": "k", "м": "m", "о": "o",
  "п": "n", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ь": "b", "ѕ": "s", "һ": "h", "ӏ": "l",
  "ԁ": "d", "ԛ": "q", "ԝ": "w",
  // Greek
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t",
  "υ": "u", "χ": "x", "ϲ": "c",
  // Latin letters that pass for plainer ones
  "ı": "i", "ɩ": "i", "ɑ": "a", "ɡ": "g", "ʀ": "r", "ȷ": "j", "ƚ": "l", "þ": "p",
};

/**
 * What a label looks like at a glance: confusable letters mapped to Latin,
 * then the ASCII tricks (`rn`→`m`, `vv`→`w`, `0`→`o`, `1`/`i`/`|`→`l`).
 */
export function skeleton(text: string): string {
  return [...text.toLowerCase()]
    .map((ch) => CONFUSABLES[ch] ?? ch)
    .join("")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/[1i|]/g, "l");
}

function scriptOf(ch: string): "latin" | "cyrillic" | "greek" | "common" | "other" {
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f)) return "latin";
  if ((code >= 0x30 && code <= 0x39) || ch === "-") return "common";
  if (code >= 0x370 && code <= 0x3ff) return "greek";
  if (code >= 0x400 && code <= 0x52f) return "cyrillic";
  return "other";
}

/**
 * A label mixing Latin with Cyrillic or Greek, or written entirely in
 * letters that all pass for Latin under an ASCII top-level domain.
 */
export function isHomoglyph(unicodeHost: string): boolean {
  const labels = unicodeHost.toLowerCase().split(".");
  const asciiTld = /^[a-z0-9-]+$/.test(labels[labels.length - 1] ?? "");
  return labels.some((label) => {
    if (/^[\x00-\x7f]*$/.test(label)) return false;
    const scripts = new Set([...label].map(scriptOf));
    if (scripts.has("latin") && (scripts.has("cyrillic") || scripts.has("greek"))) return true;
    return asciiTld && /^[a-z0-9-]+$/.test([...label].map((ch) => CONFUSABLES[ch] ?? ch).join(""));
  });
}

/** Optimal string alignment distance: insertions, deletions, substitutions, adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * A domain worth comparing against. `own` marks the organisation's domains:
 * for those, the same name under another TLD and names that merely contain
 * it count too — for brands they are too common to flag.
 */
export type Reference = { domain: string; own: boolean };

/** The reference domain `unicodeHost` imitates, or null. */
export function lookalikeOf(unicodeHost: string, references: readonly Reference[]): string | null {
  const org = orgDomain(unicodeHost);
  const label = org.split(".")[0];
  const shape = skeleton(label);
  for (const reference of references) {
    const refOrg = orgDomain(reference.domain);
    if (org === refOrg) return null;
  }
  for (const reference of references) {
    const refOrg = orgDomain(reference.domain);
    const refLabel = refOrg.split(".")[0];
    if (refLabel.length < 3) continue;
    if (label === refLabel) {
      if (reference.own) return refOrg;
      continue;
    }
    if (skeleton(refLabel) === shape) return refOrg;
    if (
      reference.own &&
      refLabel.length >= 5 &&
      (label.replace(/-/g, "") === refLabel.replace(/-/g, "") || label.includes(refLabel))
    ) {
      return refOrg;
    }
    if (refLabel.length >= 5 && editDistance(label, refLabel) <= (refLabel.length >= 9 ? 2 : 1)) return refOrg;
  }
  return null;
}
