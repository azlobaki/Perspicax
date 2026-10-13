import { decodeBase64, decodeQuotedPrintable } from "./bytes.ts";
import { decodeText } from "./charset.ts";

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

type Run = { charset: string; bytes: number[] };

/**
 * Decodes RFC 2047 encoded words. Whitespace between two adjacent encoded
 * words is dropped (§6.2), and consecutive words in one charset are decoded
 * as a single run of bytes, because senders split multi-byte characters
 * across words.
 */
export function decodeEncodedWords(value: string): string {
  if (!value.includes("=?")) return value;
  let out = "";
  let last = 0;
  let run: Run | null = null;
  for (const match of value.matchAll(ENCODED_WORD)) {
    const start = match.index ?? 0;
    const gap = value.slice(last, start);
    // The *lang suffix comes from RFC 2231 §5.
    const charset = match[1].split("*")[0].toLowerCase();
    const bytes =
      match[2].toUpperCase() === "B"
        ? decodeBase64(match[3])
        : decodeQuotedPrintable(match[3].replace(/_/g, " "));
    const adjacent = run !== null && /^\s*$/.test(gap);
    if (run !== null && adjacent && run.charset === charset) {
      run.bytes.push(...bytes);
    } else {
      if (run !== null) out += decodeText(Uint8Array.from(run.bytes), run.charset);
      if (!adjacent) out += gap;
      run = { charset, bytes: Array.from(bytes) };
    }
    last = start + match[0].length;
  }
  if (run !== null) out += decodeText(Uint8Array.from(run.bytes), run.charset);
  return out + value.slice(last);
}
