import type { MimePart, ParsedEmail } from "../email.ts";
import type { Text } from "../i18n/text.ts";
import { binaryToBytes, bytesToBinary, decodeBase64, decodeQuotedPrintable } from "./bytes.ts";
import { decodeText, decodeUtf8OrLegacy } from "./charset.ts";
import { getHeader, parseHeaderBlock, splitHeaderBody } from "./headers.ts";
import { parseStructured } from "./params.ts";

// A crafted email can nest multiparts deep enough to exhaust the stack.
const MAX_DEPTH = 32;

const EXTENSIONS: Record<string, string> = {
  "text/plain": "txt",
  "text/html": "html",
  "message/rfc822": "eml",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};

/** Parses a complete RFC 5322 / MIME message. Never throws on malformed input. */
export function parseEmail(bytes: Uint8Array): ParsedEmail {
  const warnings: Text[] = [];
  const binary = bytesToBinary(bytes);
  const root = parsePart(binary, 0, warnings);
  const email: ParsedEmail = {
    source: "eml",
    headers: root.headers,
    text: null,
    html: null,
    attachments: [],
    raw: decodeUtf8OrLegacy(bytes),
    rawBody: binaryToBytes(splitHeaderBody(binary).body),
    warnings,
  };
  collect(root, email);
  return email;
}

/** "Paste headers" mode: the header block only; anything after a blank line is ignored. */
export function parseHeadersOnly(text: string): ParsedEmail {
  const trimmed = text.replace(/^(?:[ \t]*\r?\n)+/, "");
  const warnings: Text[] = [];
  const { header } = splitHeaderBody(bytesToBinary(new TextEncoder().encode(trimmed)));
  return {
    source: "headers",
    headers: parseHeaderBlock(header, warnings),
    text: null,
    html: null,
    attachments: [],
    raw: trimmed,
    rawBody: null,
    warnings,
  };
}

function parsePart(binary: string, depth: number, warnings: Text[]): MimePart {
  const { header, body } = splitHeaderBody(binary);
  const headers = parseHeaderBlock(header, warnings);
  const type = parseStructured(getHeader(headers, "content-type") ?? "text/plain");
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(type.value) ? type.value : "text/plain";
  const disposition = parseStructured(getHeader(headers, "content-disposition") ?? "");
  const contentId = (getHeader(headers, "content-id") ?? "").trim().replace(/^<|>$/g, "");
  const part: MimePart = {
    headers,
    contentType,
    params: type.params,
    disposition:
      disposition.value === "attachment" || disposition.value === "inline" ? disposition.value : null,
    filename: disposition.params.filename || type.params.name || null,
    contentId: contentId || null,
    body: new Uint8Array(0),
    children: [],
  };

  if (contentType.startsWith("multipart/")) {
    const boundary = type.params.boundary;
    if (boundary && depth < MAX_DEPTH) {
      part.children = splitMultipart(body, boundary, warnings).map((child) =>
        parsePart(child, depth + 1, warnings),
      );
      return part;
    }
    warnings.push(
      depth >= MAX_DEPTH
        ? {
            en: "Multipart nesting too deep; inner parts were not parsed.",
            fr: "Imbrication multipart trop profonde : les parties internes n’ont pas été analysées.",
          }
        : {
            en: `A ${contentType} part has no boundary; it was read as a single body.`,
            fr: `Une partie ${contentType} n’a pas de séparateur : elle a été lue comme un corps unique.`,
          },
    );
  }

  part.body = decodeTransfer(body, getHeader(headers, "content-transfer-encoding"));
  return part;
}

function decodeTransfer(body: string, encoding: string | null): Uint8Array {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return binaryToBytes(body);
  }
}

/**
 * Splits a multipart body on its delimiter lines (RFC 2046 §5.1.1). The line
 * break before a delimiter belongs to the delimiter; preamble and epilogue
 * are dropped; a missing close delimiter is tolerated.
 */
export function splitMultipart(body: string, boundary: string, warnings: Text[]): string[] {
  const delimiter = `--${boundary}`;
  const parts: string[] = [];
  let partStart = -1;
  let lineStart = 0;
  while (lineStart <= body.length) {
    let lineEnd = body.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = body.length;
    // Only lines starting with "-" can be delimiters; skip the rest cheaply.
    if (body.charCodeAt(lineStart) === 0x2d) {
      const line = body.slice(lineStart, lineEnd).replace(/\r$/, "");
      if (line.startsWith(delimiter)) {
        const rest = line.slice(delimiter.length);
        const isClose = /^--[ \t]*$/.test(rest);
        if (isClose || /^[ \t]*$/.test(rest)) {
          if (partStart !== -1) parts.push(body.slice(partStart, contentEnd(body, lineStart)));
          if (isClose) return parts;
          partStart = lineEnd + 1;
        }
      }
    }
    lineStart = lineEnd + 1;
  }
  if (partStart !== -1) {
    parts.push(body.slice(partStart));
    warnings.push({
      en: "A multipart body ends without its closing boundary.",
      fr: "Un corps multipart se termine sans son séparateur de fin.",
    });
  }
  return parts;
}

function contentEnd(body: string, delimiterStart: number): number {
  let end = delimiterStart;
  if (end > 0 && body[end - 1] === "\n") end--;
  if (end > 0 && body[end - 1] === "\r") end--;
  return end;
}

/**
 * The first unnamed, non-attachment text/plain and text/html leaves are the
 * bodies; every other leaf is an attachment, so nothing a sender included
 * goes unseen.
 */
function collect(part: MimePart, email: ParsedEmail): void {
  if (part.children.length > 0) {
    for (const child of part.children) collect(child, email);
    return;
  }
  if (part.contentType.startsWith("multipart/")) return;
  const isBody = part.disposition !== "attachment" && part.filename === null;
  if (isBody && part.contentType === "text/plain" && email.text === null) {
    email.text = decodeText(part.body, part.params.charset);
    return;
  }
  if (isBody && part.contentType === "text/html" && email.html === null) {
    email.html = decodeText(part.body, part.params.charset);
    return;
  }
  const n = email.attachments.length + 1;
  email.attachments.push({
    filename: part.filename ?? `part-${n}.${EXTENSIONS[part.contentType] ?? "bin"}`,
    contentType: part.contentType,
    contentId: part.contentId,
    inline: part.disposition === "inline" || (part.disposition === null && part.contentId !== null),
    data: part.body,
  });
}
