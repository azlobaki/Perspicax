import * as CFB from "cfb";
import { TextError } from "../i18n/error.ts";
import type { Text } from "../i18n/text.ts";
import type { AttachedMessage, Attachment, HeaderField, ParsedEmail } from "../email.ts";
import { bytesToBinary } from "../mime/bytes.ts";
import { decodeText, decodeUtf8OrLegacy } from "../mime/charset.ts";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader, parseHeaderBlock } from "../mime/headers.ts";
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

const NOT_MSG: Text = { en: "This is not an Outlook .msg file.", fr: "Ce n’est pas un fichier .msg d’Outlook." };

function htmlFromCompressedRtf(bytes: Uint8Array, warnings: Text[]): string | null {
  let rtf: string;
  try {
    const { data, crcOk } = decompressRtf(bytes);
    if (!crcOk) warnings.push({
      en: "The formatted body's checksum does not match: it was modified after Outlook stored it.",
      fr: "La somme de contrôle du corps mis en forme ne correspond pas\u00a0: il a été modifié après son enregistrement par Outlook.",
    });
    rtf = bytesToBinary(data);
  } catch {
    warnings.push({
      en: "The formatted body is stored as compressed RTF that could not be read; its links are not analysed.",
      fr: "Le corps mis en forme est stocké en RTF compressé qui n’a pas pu être lu\u00a0: ses liens ne sont pas analysés.",
    });
    return null;
  }
  if (rtfOrigin(rtf) === "rtf") {
    warnings.push({
      en: "The formatted body was written as RTF, not HTML; only its plain-text version is analysed.",
      fr: "Le corps mis en forme a été écrit en RTF et non en HTML\u00a0: seule sa version en texte brut est analysée.",
    });
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
    throw new TextError(NOT_MSG);
  }
  const streams = new Map<string, Uint8Array>();
  container.FileIndex.forEach((entry, i) => {
    if (entry.type === 2 && entry.content) {
      streams.set(container.FullPaths[i].replace(/^Root Entry\//, ""), new Uint8Array(entry.content as ArrayLike<number>));
    }
  });
  if (![...streams.keys()].some((path) => path.startsWith("__substg1.0_") || path === "__properties_version1.0")) {
    throw new TextError(NOT_MSG);
  }
  return readMessage(streams, "", 0);
}

// An attached message can itself carry one; past this depth they are only named.
const MAX_EMBEDDED_DEPTH = 3;

/** The message whose properties sit under `root`: "" for the file itself, an attachment's storage for an embedded one. */
function readMessage(streams: ReadonlyMap<string, Uint8Array>, root: string, depth: number): ParsedEmail {
  const text = (prefix: string, id: string): string | null => {
    const unicode = streams.get(`${root}${prefix}__substg1.0_${id}${UNICODE}`);
    if (unicode) return new TextDecoder("utf-16le").decode(unicode).replace(/\0+$/, "");
    const legacy = streams.get(`${root}${prefix}__substg1.0_${id}${STRING8}`);
    return legacy ? decodeUtf8OrLegacy(legacy).replace(/\0+$/, "") : null;
  };
  const binary = (prefix: string, id: string) => streams.get(`${root}${prefix}__substg1.0_${id}${BINARY}`) ?? null;

  const warnings: Text[] = [];
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
    warnings.push({
      en: "No transport headers: this message was probably never sent over the internet, so only its sender, recipients and subject are known.",
      fr: "Aucun en-tête de transport : ce message n’a probablement jamais transité par Internet, on ne connaît donc que son expéditeur, ses destinataires et son objet.",
    });
  }

  const htmlBytes = binary("", HTML);
  const charset = htmlBytes ? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytesToBinary(htmlBytes.subarray(0, 2048)))?.[1] : null;
  let html = htmlBytes ? decodeText(htmlBytes, charset) : text("", HTML);
  const compressedRtf = binary("", RTF_COMPRESSED);
  // Exchange often keeps the formatted body only as compressed RTF, with the
  // HTML the message arrived as wrapped inside it.
  if (!html && compressedRtf) html = htmlFromCompressedRtf(compressedRtf, warnings);

  const attachments: Attachment[] = [];
  const embedded: AttachedMessage[] = [];
  const storage = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(__attach_version1\\.0_#[0-9A-Fa-f]{8}\\/)`);
  const prefixes = [...new Set([...streams.keys()].map((path) => storage.exec(path)?.[1]).filter((p): p is string => !!p))].sort();
  for (const prefix of prefixes) {
    const filename = text(prefix, ATTACH_LONG_NAME) ?? text(prefix, ATTACH_SHORT_NAME) ?? `attachment-${attachments.length + embedded.length + 1}`;
    const data = binary(prefix, ATTACH_DATA);
    if (!data) {
      const inner = `${root}${prefix}__substg1.0_${ATTACH_DATA}${EMBEDDED}/`;
      if ([...streams.keys()].some((path) => path.startsWith(inner))) {
        if (depth < MAX_EMBEDDED_DEPTH) {
          const email = readMessage(streams, inner, depth + 1);
          const subject = getHeader(email.headers, "subject");
          embedded.push({ name: subject ? `${decodeEncodedWords(subject)}.msg` : filename, email });
        } else {
          warnings.push({
            en: `The attached message “${filename}” is nested too deep and was not read.`,
            fr: `Le message joint « ${filename} » est imbriqué trop profondément et n’a pas été lu.`,
          });
        }
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
    ...(embedded.length > 0 ? { embedded } : {}),
    raw: [transport ?? headers.map((h) => `${h.name}: ${h.value}`).join("\r\n"), body ?? ""].join("\r\n\r\n"),
    rawBody: null,
    warnings,
  };
}
