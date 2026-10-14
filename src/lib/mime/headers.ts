import type { HeaderField } from "../email.ts";
import type { Text } from "../i18n/text.ts";
import { binaryToBytes } from "./bytes.ts";
import { decodeUtf8OrLegacy } from "./charset.ts";

/** Splits a message or part at its first empty line. Accepts CRLF and bare LF. */
export function splitHeaderBody(binary: string): { header: string; body: string } {
  // A part that starts with an empty line has no headers at all.
  if (binary.startsWith("\r\n")) return { header: "", body: binary.slice(2) };
  if (binary.startsWith("\n")) return { header: "", body: binary.slice(1) };
  const blank = /\r?\n\r?\n/.exec(binary);
  if (!blank) return { header: binary, body: "" };
  return {
    header: binary.slice(0, blank.index),
    body: binary.slice(blank.index + blank[0].length),
  };
}

/**
 * Parses a header block (a binary string) into unfolded fields, in order.
 * Raw 8-bit bytes are read as UTF-8 (RFC 6532), or windows-1252 when they
 * are not valid UTF-8. Lines that are not `name: value` are skipped.
 */
export function parseHeaderBlock(header: string, warnings?: Text[]): HeaderField[] {
  const text = decodeUtf8OrLegacy(binaryToBytes(header));
  const fields: HeaderField[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && fields.length > 0) {
      // Unfolding: drop the line break, keep the whitespace.
      fields[fields.length - 1].value += line;
      continue;
    }
    const colon = line.indexOf(":");
    const name = colon > 0 ? line.slice(0, colon).replace(/[ \t]+$/, "") : "";
    if (!/^[!-9;-~]+$/.test(name)) {
      if (line.trim()) warnings?.push({
        en: `Ignored a line that is not a header: ${line.slice(0, 80)}`,
        fr: `Ligne ignorée, car ce n’est pas un en-tête : ${line.slice(0, 80)}`,
      });
      continue;
    }
    fields.push({ name, value: line.slice(colon + 1).replace(/^[ \t]+/, "") });
  }
  for (const field of fields) field.value = field.value.replace(/[ \t]+$/, "");
  return fields;
}

/** First field with this name (case-insensitive) — the topmost, i.e. the most recent. */
export function getHeader(fields: readonly HeaderField[], name: string): string | null {
  const lower = name.toLowerCase();
  return fields.find((f) => f.name.toLowerCase() === lower)?.value ?? null;
}

export function getHeaders(fields: readonly HeaderField[], name: string): string[] {
  const lower = name.toLowerCase();
  return fields.filter((f) => f.name.toLowerCase() === lower).map((f) => f.value);
}
