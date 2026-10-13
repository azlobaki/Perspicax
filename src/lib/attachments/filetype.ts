export type FileKind = { kind: string; label: string; extensions: string[] };

const KINDS: Record<string, { label: string; extensions: string[] }> = {
  pdf: { label: "PDF document", extensions: ["pdf"] },
  zip: { label: "ZIP archive", extensions: ["zip"] },
  docx: { label: "Word document", extensions: ["docx", "docm", "dotx", "dotm"] },
  xlsx: { label: "Excel workbook", extensions: ["xlsx", "xlsm", "xltx", "xltm", "xlsb", "xlam"] },
  pptx: { label: "PowerPoint presentation", extensions: ["pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "ppam"] },
  jar: { label: "Java archive", extensions: ["jar"] },
  ole: { label: "OLE compound file", extensions: ["doc", "dot", "xls", "xlt", "ppt", "pps", "msg", "msi", "vsd", "pub"] },
  doc: { label: "Word 97-2003 document", extensions: ["doc", "dot"] },
  xls: { label: "Excel 97-2003 workbook", extensions: ["xls", "xlt"] },
  ppt: { label: "PowerPoint 97-2003 presentation", extensions: ["ppt", "pps", "pot"] },
  msg: { label: "Outlook message", extensions: ["msg"] },
  exe: { label: "Windows executable", extensions: ["exe", "dll", "scr", "com", "cpl", "sys", "ocx", "pif"] },
  elf: { label: "Linux executable", extensions: [] },
  macho: { label: "macOS executable", extensions: [] },
  lnk: { label: "Windows shortcut", extensions: ["lnk"] },
  iso: { label: "Disk image", extensions: ["iso", "img"] },
  vhd: { label: "Virtual hard disk", extensions: ["vhd", "vhdx"] },
  rar: { label: "RAR archive", extensions: ["rar"] },
  "7z": { label: "7-Zip archive", extensions: ["7z"] },
  gzip: { label: "GZIP archive", extensions: ["gz", "tgz"] },
  cab: { label: "Cabinet archive", extensions: ["cab"] },
  rtf: { label: "Rich Text document", extensions: ["rtf"] },
  onenote: { label: "OneNote section", extensions: ["one"] },
  png: { label: "PNG image", extensions: ["png"] },
  jpeg: { label: "JPEG image", extensions: ["jpg", "jpeg", "jfif", "jpe"] },
  gif: { label: "GIF image", extensions: ["gif"] },
  bmp: { label: "BMP image", extensions: ["bmp"] },
  webp: { label: "WebP image", extensions: ["webp"] },
  tiff: { label: "TIFF image", extensions: ["tif", "tiff"] },
  ico: { label: "Icon", extensions: ["ico"] },
  html: { label: "HTML document", extensions: ["html", "htm", "shtml", "xhtml", "hta", "mht", "mhtml"] },
  svg: { label: "SVG image", extensions: ["svg"] },
  xml: { label: "XML document", extensions: ["xml"] },
  text: { label: "Plain text", extensions: [] },
  unknown: { label: "Unknown", extensions: [] },
};

export function kindInfo(kind: string): FileKind {
  const info = KINDS[kind] ?? KINDS.unknown;
  return { kind: KINDS[kind] ? kind : "unknown", ...info };
}

function startsWith(data: Uint8Array, signature: number[], offset = 0): boolean {
  if (data.length < offset + signature.length) return false;
  return signature.every((byte, i) => data[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const SIGNATURES: [string, number[], number?][] = [
  ["pdf", ascii("%PDF-")],
  ["zip", [0x50, 0x4b, 0x03, 0x04]],
  ["zip", [0x50, 0x4b, 0x05, 0x06]],
  ["ole", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  ["exe", [0x4d, 0x5a]],
  ["elf", [0x7f, 0x45, 0x4c, 0x46]],
  ["macho", [0xcf, 0xfa, 0xed, 0xfe]],
  ["macho", [0xca, 0xfe, 0xba, 0xbe]],
  ["lnk", [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]],
  ["rar", ascii("Rar!\x1a\x07")],
  ["7z", [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
  ["gzip", [0x1f, 0x8b]],
  ["cab", ascii("MSCF")],
  ["rtf", ascii("{\\rtf")],
  ["onenote", [0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d]],
  ["vhd", ascii("conectix")],
  ["vhd", ascii("vhdxfile")],
  ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["jpeg", [0xff, 0xd8, 0xff]],
  ["gif", ascii("GIF8")],
  ["tiff", [0x49, 0x49, 0x2a, 0x00]],
  ["tiff", [0x4d, 0x4d, 0x00, 0x2a]],
  ["ico", [0x00, 0x00, 0x01, 0x00]],
];

/** What a file really is, from its bytes. ZIP and OLE containers are refined later from their contents. */
export function detectType(data: Uint8Array): FileKind {
  if (startsWith(data, ascii("RIFF")) && startsWith(data, ascii("WEBP"), 8)) return kindInfo("webp");
  // "BM" alone would catch any text starting with those letters; a bitmap's reserved bytes are zero.
  if (startsWith(data, ascii("BM")) && data.length >= 26 && startsWith(data, [0, 0, 0, 0], 6)) return kindInfo("bmp");
  for (const [kind, signature, offset] of SIGNATURES) {
    if (startsWith(data, signature, offset)) return kindInfo(kind);
  }
  for (const offset of [0x8001, 0x8801, 0x9001]) {
    if (startsWith(data, ascii("CD001"), offset)) return kindInfo("iso");
  }
  const head = String.fromCharCode(...data.subarray(0, 1024));
  const markup = head.replace(/^(\xef\xbb\xbf|﻿)/, "").trimStart().toLowerCase();
  if (/^<(!doctype html|html|head|body|script|meta|iframe|form|div|p|a|title)[\s>]/.test(markup) || /<html[\s>]/.test(markup)) {
    return kindInfo("html");
  }
  if (/<svg[\s>]/.test(markup)) return kindInfo("svg");
  if (markup.startsWith("<?xml")) return kindInfo("xml");
  const sample = data.subarray(0, 1024);
  const printable = sample.filter((b) => b === 9 || b === 10 || b === 13 || b >= 0x20).length;
  if (sample.length > 0 && !sample.includes(0) && printable / sample.length > 0.95) return kindInfo("text");
  return kindInfo("unknown");
}

export type ExtensionClass =
  | "program"
  | "script"
  | "shortcut"
  | "disk-image"
  | "web-page"
  | "archive"
  | "macro-document"
  | "document"
  | "image"
  | "other";

const CLASS_EXTENSIONS: Record<Exclude<ExtensionClass, "other">, string[]> = {
  program: ["exe", "dll", "scr", "com", "pif", "cpl", "msi", "msix", "msp", "appx", "appxbundle", "jar", "gadget", "application", "xll", "sys", "ocx"],
  script: ["bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "wsc", "hta", "sct", "reg", "inf", "msc", "jnlp", "one"],
  shortcut: ["lnk", "url", "scf", "settingcontent-ms", "library-ms", "search-ms"],
  "disk-image": ["iso", "img", "vhd", "vhdx"],
  "web-page": ["html", "htm", "shtml", "xhtml", "svg", "mht", "mhtml"],
  archive: ["zip", "rar", "7z", "gz", "tgz", "tar", "bz2", "xz", "cab", "ace", "arj", "lzh", "z"],
  "macro-document": ["docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam"],
  document: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv"],
  image: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "ico", "heic"],
};

const EXTENSION_CLASS = new Map<string, ExtensionClass>(
  Object.entries(CLASS_EXTENSIONS).flatMap(([cls, list]) => list.map((ext) => [ext, cls as ExtensionClass] as const)),
);

const KIND_CLASS: Record<string, ExtensionClass> = {
  exe: "program", elf: "program", macho: "program", lnk: "shortcut", iso: "disk-image", vhd: "disk-image",
  html: "web-page", svg: "web-page", zip: "archive", rar: "archive", "7z": "archive", gzip: "archive",
  cab: "archive", onenote: "script", jar: "program",
};

const DANGEROUS = new Set<ExtensionClass>(["program", "script", "shortcut", "disk-image", "web-page"]);

// Bidirectional controls and invisible characters that can disguise a name.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

export function extensionOf(name: string): string {
  const clean = name.replace(INVISIBLE, "").trim();
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(dot + 1).trim().toLowerCase() : "";
}

export function extensionClass(ext: string): ExtensionClass {
  return EXTENSION_CLASS.get(ext.toLowerCase()) ?? "other";
}

export function kindClass(kind: string): ExtensionClass {
  return KIND_CLASS[kind] ?? "other";
}

export function isDangerousClass(cls: ExtensionClass): boolean {
  return DANGEROUS.has(cls);
}

export type NameTrick = "rtlo" | "double-extension" | "long-name";

export function nameTricks(name: string): NameTrick[] {
  const tricks: NameTrick[] = [];
  if (/[‪-‮⁦-⁩‎‏]/.test(name)) tricks.push("rtlo");
  const clean = name.replace(INVISIBLE, "");
  const double = /\.([a-z0-9]{2,4})\s*\.([a-z0-9]{2,5})$/i.exec(clean);
  if (double) {
    const inner = extensionClass(double[1]);
    const outer = extensionClass(double[2]);
    if ((inner === "document" || inner === "image" || inner === "archive") && isDangerousClass(outer)) {
      tricks.push("double-extension");
    }
  }
  if (clean.length > 120 || /\s{5,}\.[a-z0-9]+$/i.test(clean)) tricks.push("long-name");
  return tricks;
}

/** The name with every invisible or direction-changing character spelled out. */
export function visibleName(name: string): string {
  return name.replace(INVISIBLE, (ch) => `⟨U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟩`);
}
