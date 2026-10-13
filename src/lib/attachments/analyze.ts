import type { Attachment } from "../email.ts";
import type { Finding, Severity } from "../finding.ts";
import { decodeUtf8OrLegacy } from "../mime/charset.ts";
import {
  detectType, extensionClass, extensionOf, isDangerousClass, kindClass, kindInfo, nameTricks, visibleName,
  type ExtensionClass, type FileKind,
} from "./filetype.ts";
import { hashes, type Hashes } from "./hash.ts";
import { inspectOle, inspectOoxml } from "./office.ts";
import { inspectPdf } from "./pdf.ts";
import { decodeQr, type Pixels } from "./qr.ts";
import { isSmuggling, smugglingIndicators } from "./smuggling.ts";
import { listZip } from "./zip.ts";

export type AttachmentFlag =
  | "program"
  | "script"
  | "shortcut"
  | "disk-image"
  | "web-page"
  | "archive"
  | "encrypted-archive"
  | "archive-hides-program"
  | "double-extension"
  | "rtlo"
  | "long-name"
  | "type-mismatch"
  | "macros"
  | "remote-template"
  | "html-smuggling"
  | "pdf-active"
  | "qr-code";

export type ArchiveEntry = { name: string; size: number; encrypted: boolean; flagged: boolean };

export type AttachmentReport = {
  filename: string;
  /** The name with hidden characters spelled out. */
  visibleName: string;
  declaredType: string;
  inline: boolean;
  size: number;
  detected: FileKind;
  hashes: Hashes;
  flags: AttachmentFlag[];
  /** What exactly triggered a flag, when there is more to say than the flag itself. */
  details: Partial<Record<AttachmentFlag, string>>;
  entries: ArchiveEntry[] | null;
  /** Links found inside: PDF actions, Office external targets. */
  urls: string[];
  /** Decoded QR codes. */
  qr: string[];
  /** Text of an HTML attachment, so its links and forms can be analysed. */
  html: string | null;
};

/** Turns image bytes into pixels; supplied by the caller (the browser in the app). */
export type ImageDecoder = (data: Uint8Array, contentType: string) => Promise<Pixels | null>;

const CLASS_FLAG: Partial<Record<ExtensionClass, AttachmentFlag>> = {
  program: "program",
  script: "script",
  shortcut: "shortcut",
  "disk-image": "disk-image",
  "web-page": "web-page",
  archive: "archive",
};
const IMAGE_KINDS = new Set(["png", "jpeg", "gif", "bmp", "webp"]);
const MAX_TEXT = 5_000_000;
const MAX_IMAGE = 10_000_000;
const MAX_IMAGES = 20;

export async function analyzeAttachments(
  attachments: readonly Attachment[],
  options: { decodeImage?: ImageDecoder } = {},
): Promise<AttachmentReport[]> {
  let imagesLeft = MAX_IMAGES;
  const reports: AttachmentReport[] = [];
  for (const attachment of attachments) {
    const data = attachment.data;
    const flags: AttachmentFlag[] = [];
    const details: Partial<Record<AttachmentFlag, string>> = {};
    const flag = (name: AttachmentFlag, detail?: string) => {
      if (!flags.includes(name)) flags.push(name);
      if (detail) details[name] = detail;
    };
    let detected = detectType(data);
    let entries: ArchiveEntry[] | null = null;
    const urls: string[] = [];
    const qr: string[] = [];
    let html: string | null = null;
    const ext = extensionOf(attachment.filename);

    if (detected.kind === "zip") {
      const listing = listZip(data) ?? [];
      const office = inspectOoxml(data, listing);
      if (office.kind) detected = kindInfo(office.kind);
      if (office.macros) flag("macros", office.macros);
      if (office.remoteTemplate) flag("remote-template", office.remoteTemplate);
      urls.push(...office.externalUrls);
      if (!office.kind) {
        entries = listing.map((e) => {
          const cls = extensionClass(extensionOf(e.name));
          return { name: e.name, size: e.size, encrypted: e.encrypted, flagged: isDangerousClass(cls) || nameTricks(e.name).length > 0 };
        });
        if (entries.some((e) => e.encrypted)) flag("encrypted-archive");
        const hidden = entries.filter((e) => e.flagged).map((e) => e.name);
        if (hidden.length > 0) flag("archive-hides-program", hidden.join(", "));
      }
    } else if (detected.kind === "ole") {
      const ole = inspectOle(data);
      if (ole.kind) detected = kindInfo(ole.kind);
      if (ole.macros) flag("macros", ole.macros);
    }

    // What the name says and what the bytes say both count: the worse wins.
    for (const cls of [extensionClass(ext), kindClass(detected.kind)]) {
      const classFlag = CLASS_FLAG[cls];
      if (!classFlag) continue;
      if (classFlag === "web-page" && attachment.inline && detected.kind === "svg") continue;
      if (classFlag === "archive" && detected.kind !== "zip" && kindClass(detected.kind) !== "archive") continue;
      flag(classFlag);
    }
    for (const trick of nameTricks(attachment.filename)) flag(trick);
    if (detected.extensions.length > 0 && ext !== "" && !detected.extensions.includes(ext)) {
      flag("type-mismatch", `named .${ext}, actually ${detected.label}`);
    }

    if ((detected.kind === "html" || detected.kind === "svg" || ["js", "hta"].includes(ext)) && data.length <= MAX_TEXT) {
      const text = decodeUtf8OrLegacy(data);
      if (detected.kind === "html") html = text;
      const found = smugglingIndicators(text);
      if (isSmuggling(found)) flag("html-smuggling", [...found.payload, ...found.delivery].join("; "));
    }
    if (detected.kind === "pdf") {
      const pdf = inspectPdf(data);
      urls.push(...pdf.urls);
      if (pdf.active.length > 0) flag("pdf-active", pdf.active.join(", "));
    }
    if (IMAGE_KINDS.has(detected.kind) && options.decodeImage && data.length <= MAX_IMAGE && imagesLeft > 0) {
      imagesLeft--;
      const pixels = await options.decodeImage(data, attachment.contentType);
      const text = pixels ? decodeQr(pixels) : null;
      if (text) {
        qr.push(text);
        flag("qr-code", text);
      }
    }

    reports.push({
      filename: attachment.filename,
      visibleName: visibleName(attachment.filename),
      declaredType: attachment.contentType,
      inline: attachment.inline,
      size: data.length,
      detected,
      hashes: await hashes(data),
      flags,
      details,
      entries,
      urls: [...new Set(urls)],
      qr,
      html,
    });
  }
  return reports;
}

type Rule = { flag: AttachmentFlag; severity: Severity; weight: number; title: string; explanation: string };

const RULES: Rule[] = [
  { flag: "html-smuggling", severity: "high", weight: 20, title: "HTML smuggling",
    explanation: "The attachment is a web page that assembles a file inside the browser and saves it, so the file never crosses the mail filter." },
  { flag: "program", severity: "high", weight: 20, title: "Executable attachment",
    explanation: "Opening it runs a program." },
  { flag: "script", severity: "high", weight: 18, title: "Script attachment",
    explanation: "Opening it runs a script with the reader's rights." },
  { flag: "shortcut", severity: "high", weight: 18, title: "Shortcut attachment",
    explanation: "A shortcut can launch any command; it is a common first stage of an infection." },
  { flag: "macros", severity: "high", weight: 18, title: "Office document with macros",
    explanation: "The document carries VBA code that runs once the reader enables content." },
  { flag: "disk-image", severity: "high", weight: 15, title: "Disk image attachment",
    explanation: "A disk image unpacks files out of reach of mail filters, and on older systems without the downloaded-file warning." },
  { flag: "archive-hides-program", severity: "high", weight: 15, title: "Archive hides a program",
    explanation: "The archive contains something that runs when opened." },
  { flag: "remote-template", severity: "high", weight: 15, title: "Office document loads a remote template",
    explanation: "Opening the document fetches a template from the network, which can carry macros or an exploit (template injection)." },
  { flag: "rtlo", severity: "high", weight: 15, title: "File name uses a direction override",
    explanation: "A right-to-left override reverses the end of the name on screen, so “fdp.exe” displays as “exe.pdf”." },
  { flag: "qr-code", severity: "high", weight: 15, title: "QR code in an image",
    explanation: "A QR code moves the link to a phone, away from link scanning and the corporate browser." },
  { flag: "double-extension", severity: "high", weight: 12, title: "Double extension",
    explanation: "The name ends like a document, then carries the real, dangerous extension." },
  { flag: "web-page", severity: "medium", weight: 10, title: "HTML attachment",
    explanation: "It opens as a local web page, a common vessel for fake login forms." },
  { flag: "encrypted-archive", severity: "medium", weight: 10, title: "Password-protected archive",
    explanation: "Encryption keeps scanners from looking inside; the password is usually in the email." },
  { flag: "type-mismatch", severity: "medium", weight: 8, title: "File type does not match its name",
    explanation: "The content is not what the extension says." },
  { flag: "pdf-active", severity: "medium", weight: 8, title: "PDF with active content",
    explanation: "The PDF can run script, act when opened, launch a program or carry another file." },
  { flag: "long-name", severity: "low", weight: 4, title: "Padded file name",
    explanation: "A very long or space-padded name pushes the real extension out of sight." },
  { flag: "archive", severity: "low", weight: 2, title: "Archive attachment",
    explanation: "Archives hide their contents from a quick look." },
];

// A more specific flag on the same attachment makes these redundant.
const SUPERSEDED: Partial<Record<AttachmentFlag, AttachmentFlag[]>> = {
  "web-page": ["html-smuggling"],
  archive: ["archive-hides-program", "encrypted-archive", "rtlo", "double-extension", "type-mismatch"],
};

export function attachmentFindings(reports: readonly AttachmentReport[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    const hits = reports.filter(
      (r) => r.flags.includes(rule.flag) && !(SUPERSEDED[rule.flag] ?? []).some((f) => r.flags.includes(f)),
    );
    if (hits.length === 0) continue;
    findings.push({
      id: `attachment.${rule.flag}`, category: "attachment", severity: rule.severity, title: rule.title,
      explanation: rule.explanation,
      evidence: hits.map((r) => (r.details[rule.flag] ? `${r.visibleName} — ${r.details[rule.flag]}` : r.visibleName)),
      weight: rule.weight,
    });
  }
  return findings;
}
