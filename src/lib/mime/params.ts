import { decodeText } from "./charset.ts";
import { decodeEncodedWords } from "./encoded-words.ts";

export type Structured = { value: string; params: Record<string, string> };

type Segment = { index: number; text: string; encoded: boolean };

/**
 * Parses `value; key=val; key*=charset''%XX` headers (Content-Type,
 * Content-Disposition), including RFC 2231 continuations and charsets, and
 * the RFC 2047 words that clients put in quoted file names anyway.
 */
export function parseStructured(input: string): Structured {
  const [head = "", ...rest] = splitOutsideQuotes(input);
  const params: Record<string, string> = {};
  const segments = new Map<string, Segment[]>();

  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const raw = unquote(part.slice(eq + 1).trim());
    const match = /^(.+?)(?:\*(\d+))?(\*)?$/.exec(key);
    if (!match) continue;
    const [, name, index, star] = match;
    if (index === undefined && star === undefined) {
      params[name] = name === "boundary" ? raw : decodeEncodedWords(raw);
      continue;
    }
    const list = segments.get(name) ?? [];
    list.push({ index: index === undefined ? 0 : Number(index), text: raw, encoded: star !== undefined });
    segments.set(name, list);
  }

  // RFC 2231 values win over plain ones: senders add both for older clients.
  for (const [name, list] of segments) {
    list.sort((a, b) => a.index - b.index);
    let charset = "utf-8";
    const bytes: number[] = [];
    list.forEach((segment, i) => {
      let text = segment.text;
      if (segment.encoded && i === 0) {
        const declared = /^([^']*)'[^']*'([\s\S]*)$/.exec(text);
        if (declared) {
          charset = declared[1] || charset;
          text = declared[2];
        }
      }
      if (segment.encoded) bytes.push(...percentDecode(text));
      else bytes.push(...new TextEncoder().encode(text));
    });
    params[name] = decodeText(Uint8Array.from(bytes), charset);
  }

  return { value: head.trim().toLowerCase(), params };
}

function splitOutsideQuotes(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted && ch === "\\") {
      current += ch + (input[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === ";" && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return value;
}

function percentDecode(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(text.charCodeAt(i) & 0xff);
    }
  }
  return out;
}
