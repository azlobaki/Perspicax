import * as CFB from "cfb";
import type { Attachment, HeaderField, ParsedEmail } from "../email.ts";
import { bytesToBinary } from "../mime/bytes.ts";
import { decodeText, decodeUtf8OrLegacy } from "../mime/charset.ts";
import { parseHeaderBlock } from "../mime/headers.ts";
import { decompressRtf, htmlFromRtf, rtfOrigin } from "./rtf.ts";

// MAPI property types, as they appear at the end of stream names.
const UNICODE = "001F";
const STRING8 = "001E";
const BINARY = "0102";
const EMBEDDED = "000D";

// MAPI property ids used here.
const TRANSPORT_HEADERS = "007D";
const SUBJECT = "0037";
const SENDER_NAME = "0C1A";
const SENDER_EMAIL = "0C1F";
const DISPLAY_TO = "0E04";
const BODY = "1000";
const RTF_COMPRESSED = "1009";
const HTML = "1013";
const ATTACH_DATA = "3701";
const ATTACH_SHORT_NAME = "3704";
const ATTACH_LONG_NAME = "3707";
const ATTACH_MIME = "370E";
const ATTACH_CONTENT_ID = "3712";

const ATTACHMENT_STORAGE = /^(__attach_version1\.0_#[0-9A-Fa-f]{8}\/)/;

function htmlFromCompressedRtf(bytes: Uint8Array, warnings: string[]): string | null {
  let rtf: string;
  try {
    const { data, crcOk } = decompressRtf(bytes);
    if (!crcOk) warnings.push("The formatted body's checksum does not match: it was modified after Outlook stored it.");
    rtf = bytesToBinary(data);
  } catch {
    warnings.push("The formatted body is stored as compressed RTF that could not be read; its links are not analysed.");
    return null;
  }
  if (rtfOrigin(rtf) === "rtf") {
    warnings.push("The formatted body was written as RTF, not HTML; only its plain-text version is analysed.");
  }
  return htmlFromRtf(rtf);
}

/**
 * Reads an Outlook .msg (an OLE compound file of MAPI properties) into the
 * same ParsedEmail as an .eml. Received mail keeps its internet headers in
 * one property; without them, only sender, recipients and subject are known.
 */
export function parseMsg(bytes: Uint8Array): ParsedEmail {
  let container: CFB.CFB$Container;
  try {
    container = CFB.read(bytes, { type: "array" });
  } catch {
    throw new Error("This is not an Outlook .msg file.");
  }
  const streams = new Map<string, Uint8Array>();
  container.FileIndex.forEach((entry, i) => {
    if (entry.type === 2 && entry.content) {
      streams.set(container.FullPaths[i].replace(/^Root Entry\//, ""), new Uint8Array(entry.content as ArrayLike<number>));
    }
  });
  if (![...streams.keys()].some((path) => path.startsWith("__substg1.0_") || path === "__properties_version1.0")) {
    throw new Error("This is not an Outlook .msg file.");
  }

  const text = (prefix: string, id: string): string | null => {
    const unicode = streams.get(`${prefix}__substg1.0_${id}${UNICODE}`);
    if (unicode) return new TextDecoder("utf-16le").decode(unicode).replace(/\0+$/, "");
    const legacy = streams.get(`${prefix}__substg1.0_${id}${STRING8}`);
    return legacy ? decodeUtf8OrLegacy(legacy).replace(/\0+$/, "") : null;
  };
  const binary = (prefix: string, id: string) => streams.get(`${prefix}__substg1.0_${id}${BINARY}`) ?? null;

  const warnings: string[] = [];
  const transport = text("", TRANSPORT_HEADERS);
  let headers: HeaderField[];
  if (transport) {
    headers = parseHeaderBlock(bytesToBinary(new TextEncoder().encode(transport.replace(/(\r?\n)+$/, ""))), warnings);
  } else {
    const name = text("", SENDER_NAME);
    const address = text("", SENDER_EMAIL);
    headers = [];
    if (address) headers.push({ name: "From", value: name ? `${name} <${address}>` : address });
    const to = text("", DISPLAY_TO);
    if (to) headers.push({ name: "To", value: to });
    const subject = text("", SUBJECT);
    if (subject) headers.push({ name: "Subject", value: subject });
    warnings.push("No transport headers: this message was probably never sent over the internet, so only its sender, recipients and subject are known.");
  }

  const htmlBytes = binary("", HTML);
  const charset = htmlBytes ? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytesToBinary(htmlBytes.subarray(0, 2048)))?.[1] : null;
  let html = htmlBytes ? decodeText(htmlBytes, charset) : text("", HTML);
  const compressedRtf = binary("", RTF_COMPRESSED);
  // Exchange often keeps the formatted body only as compressed RTF, with the
  // HTML the message arrived as wrapped inside it.
  if (!html && compressedRtf) html = htmlFromCompressedRtf(compressedRtf, warnings);

  const attachments: Attachment[] = [];
  const prefixes = [...new Set([...streams.keys()].map((path) => ATTACHMENT_STORAGE.exec(path)?.[1]).filter((p): p is string => !!p))].sort();
  for (const prefix of prefixes) {
    const filename = text(prefix, ATTACH_LONG_NAME) ?? text(prefix, ATTACH_SHORT_NAME) ?? `attachment-${attachments.length + 1}`;
    const data = binary(prefix, ATTACH_DATA);
    if (!data) {
      if ([...streams.keys()].some((path) => path.startsWith(`${prefix}__substg1.0_${ATTACH_DATA}${EMBEDDED}/`))) {
        warnings.push(`The attached message “${filename}” is embedded in Outlook's own format and was not analysed.`);
      }
      continue;
    }
    const contentId = text(prefix, ATTACH_CONTENT_ID);
    attachments.push({
      filename,
      contentType: (text(prefix, ATTACH_MIME) ?? "application/octet-stream").toLowerCase(),
      contentId,
      inline: contentId !== null,
      data,
    });
  }

  const body = text("", BODY);
  return {
    source: "msg",
    headers,
    text: body,
    html,
    attachments,
    raw: [transport ?? headers.map((h) => `${h.name}: ${h.value}`).join("\r\n"), body ?? ""].join("\r\n\r\n"),
    rawBody: null,
    warnings,
  };
}
