import { inflateSync, unzlibSync } from "fflate";
import { bytesToBinary } from "../mime/bytes.ts";

export type PdfInfo = {
  /** Every /URI action target. */
  urls: string[];
  /** Plain-language names of active features present. */
  active: string[];
};

const ACTIVE: [RegExp, string][] = [
  [/\/(JavaScript|JS)\b/, "JavaScript"],
  [/\/OpenAction\b/, "runs an action when opened"],
  [/\/AA\b/, "automatic actions"],
  [/\/Launch\b/, "launches a program"],
  [/\/EmbeddedFile\b/, "embedded file"],
  [/\/SubmitForm\b/, "submits a form"],
  [/\/XFA\b/, "XFA form"],
];

const MAX_INFLATED = 50_000_000;
const MAX_STREAMS = 500;

function inflate(raw: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(raw);
  } catch {
    try {
      return inflateSync(raw);
    } catch {
      return null;
    }
  }
}

/** Decodes a PDF literal string body: escapes and octal codes. */
function unescapeLiteral(text: string): string {
  return text.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, code: string) => {
    if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8));
    const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    return map[code] ?? "";
  });
}

function hexString(text: string): string {
  const hex = text.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
  return out;
}

/**
 * Links and active content in a PDF. Objects are often packed into
 * compressed streams, so every stream that inflates is searched too.
 */
export function inspectPdf(data: Uint8Array): PdfInfo {
  const text = bytesToBinary(data);
  const chunks = [text];
  let inflated = 0;
  let index = 0;
  for (let n = 0; n < MAX_STREAMS; n++) {
    const keyword = text.indexOf("stream", index);
    if (keyword < 0) break;
    if (text.slice(keyword - 3, keyword) === "end") {
      index = keyword + 6;
      continue;
    }
    let start = keyword + 6;
    if (text[start] === "\r") start++;
    if (text[start] === "\n") start++;
    const endKeyword = text.indexOf("endstream", start);
    if (endKeyword < 0) break;
    index = endKeyword + 9;
    let end = endKeyword;
    if (text[end - 1] === "\n") end--;
    if (text[end - 1] === "\r") end--;
    const out = inflate(data.subarray(start, end));
    if (out) {
      inflated += out.length;
      if (inflated > MAX_INFLATED) break;
      chunks.push(bytesToBinary(out));
    }
  }

  const urls: string[] = [];
  const active: string[] = [];
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/\/URI\s*\(((?:\\[\s\S]|[^\\)])*)\)/g)) urls.push(unescapeLiteral(m[1]));
    for (const m of chunk.matchAll(/\/URI\s*<([0-9A-Fa-f\s]*)>/g)) urls.push(hexString(m[1]));
    for (const [pattern, label] of ACTIVE) if (pattern.test(chunk) && !active.includes(label)) active.push(label);
  }
  return { urls: [...new Set(urls.map((u) => u.trim()).filter(Boolean))], active: ACTIVE.map(([, l]) => l).filter((l) => active.includes(l)) };
}
