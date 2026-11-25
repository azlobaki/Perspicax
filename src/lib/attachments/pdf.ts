import { inflateSync, unzlibSync } from "fflate";
import { bytesToBinary } from "../mime/bytes.ts";

export type PdfInfo = {
  /** Every /URI action target. */
  urls: string[];
  /** Plain-language names of active features present. */
  active: string[];
};

const OPEN_ACTION = "runs an action when opened";

// `null`: an opening action only counts when it does something risky (see `opensRisky`).
const ACTIVE: [RegExp | null, string][] = [
  [/\/(JavaScript|JS)\b/, "JavaScript"],
  [null, OPEN_ACTION],
  [/\/AA\b/, "automatic actions"],
  [/\/Launch\b/, "launches a program"],
  [/\/EmbeddedFile\b/, "embedded file"],
  [/\/SubmitForm\b/, "submits a form"],
  [/\/XFA\b/, "XFA form"],
];

/** Every phrase `inspectPdf` can report in `active`. */
export const PDF_ACTIVE_PHRASES: readonly string[] = ACTIVE.map(([, label]) => label);

// Actions that reach outside the document. Opening on a page or at a zoom
// level (a destination, or /GoTo) is what most PDFs do and is left alone.
const RISKY_ACTION = /\/S\s*\/(JavaScript|Launch|URI|SubmitForm|ImportData|GoToR|GoToE)\b/;

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

/** The dictionary that opens at `start` ("<<"), nested dictionaries included. */
function dictionaryAt(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === "<" && text[i + 1] === "<") {
      depth++;
      i++;
    } else if (text[i] === ">" && text[i + 1] === ">") {
      depth--;
      i++;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/** The objects packed in an object stream (/Type /ObjStm), by number. */
function objectStream(dictionary: string, content: string, objects: Map<string, string>) {
  const first = /\/First\s+(\d+)/.exec(dictionary);
  if (!first) return;
  const offset = Number(first[1]);
  const numbers = content.slice(0, offset).trim().split(/\s+/).map(Number);
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const start = offset + numbers[i + 1];
    const end = i + 3 < numbers.length ? offset + numbers[i + 3] : content.length;
    objects.set(String(numbers[i]), content.slice(start, end));
  }
}

/** Whether an /OpenAction, inline or by reference, runs script, a program, a link or a form. */
function opensRisky(chunks: readonly string[], objects: ReadonlyMap<string, string>): boolean {
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/\/OpenAction\s*(?:(<<)|(\d+)\s+\d+\s+R\b)/g)) {
      const action = m[1] ? dictionaryAt(chunk, m.index + m[0].length - 2) : (objects.get(m[2]) ?? "");
      if (RISKY_ACTION.test(action)) return true;
    }
  }
  return false;
}

/**
 * Links and active content in a PDF. Objects are often packed into
 * compressed streams, so every stream that inflates is searched too.
 */
export function inspectPdf(data: Uint8Array): PdfInfo {
  const text = bytesToBinary(data);
  const chunks = [text];
  const objects = new Map<string, string>();
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
      const content = bytesToBinary(out);
      chunks.push(content);
      const dictionary = text.slice(text.lastIndexOf(" obj", keyword), keyword);
      if (/\/Type\s*\/ObjStm\b/.test(dictionary)) objectStream(dictionary, content, objects);
    }
  }
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj\b/g)) objects.set(m[1], m[2]);
  }

  const urls: string[] = [];
  const active: string[] = [];
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/\/URI\s*\(((?:\\[\s\S]|[^\\)])*)\)/g)) urls.push(unescapeLiteral(m[1]));
    for (const m of chunk.matchAll(/\/URI\s*<([0-9A-Fa-f\s]*)>/g)) urls.push(hexString(m[1]));
    for (const [pattern, label] of ACTIVE) if (pattern?.test(chunk) && !active.includes(label)) active.push(label);
  }
  if (opensRisky(chunks, objects)) active.push(OPEN_ACTION);
  return { urls: [...new Set(urls.map((u) => u.trim()).filter(Boolean))], active: ACTIVE.map(([, l]) => l).filter((l) => active.includes(l)) };
}
