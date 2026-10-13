# Perspicax — Milestone 3 Implementation Plan (attachments, IOCs, pivots)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every attachment is hashed, typed from its bytes and checked (executables, scripts, disk images, double extensions, direction overrides, macros, remote templates, HTML smuggling, active PDFs, QR codes, archive contents); every IOC of the email is collected with its provenance, can be copied defanged or raw, and pivots to external services in one click.

**Architecture:** `attachments/` (hash, filetype, zip, office, pdf, smuggling, qr, analyze) produces `AttachmentReport[]` and findings; URLs found inside attachments (PDF links, Office external targets, QR codes, HTML attachments) flow into `links/` like any other link; `ioc/` collects IOCs from headers, links and attachments; `pivots/` turns an IOC into service URLs. `analyzeEmail` becomes `async` (WebCrypto hashes, image decoding for QR codes).

**Tech Stack:** as milestones 1–2, plus three bundled, local-only libraries allowed by the spec (§2): `fflate` (ZIP/zlib inflate, MIT), `cfb` (OLE compound files, Apache-2.0), `jsqr` (QR decoding, Apache-2.0).

**Spec:** `docs/design/2026-10-13-perspicax-design.md` — milestone 3 of §7 (`attachments/`, `ioc/`, `pivots/`, IOCs and Attachments tabs), §3 module table, §6 fixtures.

## Global Constraints

Everything in milestones 1–2's Global Constraints still applies (stack, no network at runtime, nothing persisted, `.ts` runtime imports in `src/lib/`, no TS syntax Node cannot strip, ES2017 regexes, tokens-only styling, the engine never builds a DOM, author `azlobaki`, no Claude/Anthropic mention, no `CLAUDE.md`). In addition:

- MD5 is computed in-house; SHA-1 and SHA-256 with WebCrypto (`crypto.subtle`, present in browsers and Node).
- Only `fflate`, `cfb` and `jsqr` may be added as runtime dependencies. Pixels for QR decoding come from an injected decoder: the browser's `createImageBitmap` + `OffscreenCanvas` in the app, a test-only PNG decoder in tests.
- Pivot links are plain `<a target="_blank" rel="noopener noreferrer">`: nothing is fetched until the analyst clicks. Pivot services and the defang default become editable in milestone 4; milestone 3 uses the defaults.
- Size limits so a hostile attachment cannot freeze the tab: ZIP entries read up to 20 MB, inflated PDF streams up to 50 MB in total, HTML attachments analysed up to 5 MB, images decoded up to 10 MB and 20 per email.

## File structure (added in milestone 3)

```
src/lib/attachments/hash.ts       MD5 (in-house), SHA-1/SHA-256 (WebCrypto)
src/lib/attachments/filetype.ts   magic bytes, extension classes, name tricks
src/lib/attachments/zip.ts        central-directory listing, entry reading (fflate inflate)
src/lib/attachments/office.ts     OOXML macros and external targets, OLE macros (cfb)
src/lib/attachments/pdf.ts        URIs and active content, compressed streams included
src/lib/attachments/smuggling.ts  HTML smuggling indicators
src/lib/attachments/qr.ts         QR decoding from pixels (jsqr)
src/lib/attachments/analyze.ts    AttachmentReport[] + attachment findings
src/lib/testing/png.ts            test-only PNG decoder
src/lib/ioc/defang.ts             defang / refang
src/lib/ioc/collect.ts            IOCs with provenance
src/lib/pivots/pivots.ts          pivot services and URL templates
src/components/CopyButton.tsx, AttachmentsTab.tsx, IocsTab.tsx, decodeImage.ts
fixtures/quishing-qr.eml, fixtures/macro-docm.eml, fixtures/rtlo-archive.eml
```

---

### Task 1: Hashes

**Files:**
- Create: `src/lib/attachments/hash.ts`, `src/lib/attachments/hash.test.ts`

**Interfaces:**
- Produces: `md5(data: Uint8Array): string`, `Hashes = { md5: string; sha1: string; sha256: string }`, `hashes(data: Uint8Array): Promise<Hashes>`, `toHex(bytes: Uint8Array): string`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/attachments/hash.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashes, md5 } from "./hash.ts";

const node = (algo: string, data: Uint8Array) => createHash(algo).update(data).digest("hex");

test("computes MD5 on the RFC 1321 test vectors", () => {
  assert.equal(md5(new Uint8Array(0)), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5(new TextEncoder().encode("abc")), "900150983cd24fb0d6963f7d28e17f72");
});

test("matches Node's MD5 around block boundaries and on large inputs", () => {
  for (const size of [55, 56, 63, 64, 65, 119, 120, 1_000_003]) {
    const data = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 7) & 0xff);
    assert.equal(md5(data), node("md5", data), `size ${size}`);
  }
});

test("computes all three hashes", async () => {
  const data = new TextEncoder().encode("Perspicax");
  assert.deepEqual(await hashes(data), {
    md5: node("md5", data),
    sha1: node("sha1", data),
    sha256: node("sha256", data),
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `hash.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/attachments/hash.ts
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
// RFC 1321 defines its constants this way: floor(|sin(i + 1)| · 2^32).
const CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** MD5 (RFC 1321). WebCrypto does not offer it, and analysts still pivot on it. */
export function md5(data: Uint8Array): string {
  const blocks = Math.floor((data.length + 8) / 64) + 1;
  const buffer = new Uint8Array(blocks * 64);
  buffer.set(data);
  buffer[data.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(buffer.length - 8, (data.length * 8) >>> 0, true);
  view.setUint32(buffer.length - 4, Math.floor(data.length / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);
  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let j = 0; j < 16; j++) words[j] = view.getUint32(offset + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = d;
      d = c;
      c = b;
      const sum = (a + f + CONSTANTS[i] + words[g]) >>> 0;
      b = (b + ((sum << SHIFTS[i]) | (sum >>> (32 - SHIFTS[i])))) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((value, i) => out.setUint32(i * 4, value, true));
  return toHex(new Uint8Array(out.buffer));
}

export type Hashes = { md5: string; sha1: string; sha256: string };

export async function hashes(data: Uint8Array): Promise<Hashes> {
  // slice(): WebCrypto wants a plain ArrayBuffer-backed view.
  const digest = async (algorithm: string) => toHex(new Uint8Array(await crypto.subtle.digest(algorithm, data.slice())));
  const [sha1, sha256] = await Promise.all([digest("SHA-1"), digest("SHA-256")]);
  return { md5: md5(data), sha1, sha256 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attachments
git commit -m "Hash attachments: MD5 in-house, SHA-1 and SHA-256 with WebCrypto

WebCrypto has no MD5, yet it is still what many feeds and tickets use, so
it is implemented from RFC 1321 and checked against Node's on block
boundaries and a megabyte of data."
```

---

### Task 2: File types and names

**Files:**
- Create: `src/lib/attachments/filetype.ts`, `src/lib/attachments/filetype.test.ts`

**Interfaces:**
- Produces: `FileKind = { kind: string; label: string; extensions: string[] }`, `detectType(data: Uint8Array): FileKind`, `kindInfo(kind: string): FileKind`, `ExtensionClass`, `extensionOf(name: string): string`, `extensionClass(ext: string): ExtensionClass`, `kindClass(kind: string): ExtensionClass`, `NameTrick = "rtlo" | "double-extension" | "long-name"`, `nameTricks(name: string): NameTrick[]`, `visibleName(name: string): string`, `isDangerousClass(c: ExtensionClass): boolean`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/attachments/filetype.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectType, extensionClass, extensionOf, nameTricks, visibleName } from "./filetype.ts";

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const kind = (data: Uint8Array) => detectType(data).kind;

test("recognises file types from their first bytes", () => {
  assert.equal(kind(bytes("%PDF-1.7\n")), "pdf");
  assert.equal(kind(bytes("PK", [3, 4, 20, 0])), "zip");
  assert.equal(kind(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), "ole");
  assert.equal(kind(bytes("MZ", [0x90, 0])), "exe");
  assert.equal(kind(bytes([0x4c, 0, 0, 0, 1, 0x14, 2, 0])), "lnk");
  assert.equal(kind(bytes([0x89], "PNG\r\n", [0x1a, 0x0a])), "png");
  assert.equal(kind(bytes([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(kind(bytes("GIF89a")), "gif");
  assert.equal(kind(bytes("Rar!", [0x1a, 7, 0])), "rar");
  assert.equal(kind(bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])), "7z");
  assert.equal(kind(bytes([0x1f, 0x8b, 8])), "gzip");
  assert.equal(kind(bytes("{\\rtf1\\ansi")), "rtf");
  assert.equal(kind(bytes([0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d])), "onenote");
});

test("finds ISO images by their volume descriptor", () => {
  const iso = new Uint8Array(0x9000);
  iso.set(bytes("CD001"), 0x8001);
  assert.equal(kind(iso), "iso");
});

test("tells HTML, SVG, XML and text apart", () => {
  assert.equal(kind(bytes([0xef, 0xbb, 0xbf], "  <!DOCTYPE html><html>")), "html");
  assert.equal(kind(bytes("<script>var a=1</script>")), "html");
  assert.equal(kind(bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">')), "svg");
  assert.equal(kind(bytes('<?xml version="1.0"?><root/>')), "xml");
  assert.equal(kind(bytes("Bonjour,\nvoici le texte.\n")), "text");
  assert.equal(kind(bytes([0, 1, 2, 3, 250, 251])), "unknown");
});

test("classifies extensions", () => {
  assert.equal(extensionOf("Facture_RE-4471.pdf.html"), "html");
  assert.equal(extensionOf("README"), "");
  assert.equal(extensionClass("exe"), "program");
  assert.equal(extensionClass("js"), "script");
  assert.equal(extensionClass("lnk"), "shortcut");
  assert.equal(extensionClass("iso"), "disk-image");
  assert.equal(extensionClass("htm"), "web-page");
  assert.equal(extensionClass("7z"), "archive");
  assert.equal(extensionClass("docm"), "macro-document");
  assert.equal(extensionClass("pdf"), "document");
  assert.equal(extensionClass("png"), "image");
  assert.equal(extensionClass("xyz"), "other");
});

test("spots tricks in file names", () => {
  assert.deepEqual(nameTricks("Facture_RE-4471.pdf.html"), ["double-extension"]);
  assert.deepEqual(nameTricks("Commande_4471‮fdp.zip"), ["rtlo"]);
  assert.deepEqual(nameTricks("Scan_2026‮gpj.exe"), ["rtlo"]);
  assert.deepEqual(nameTricks("invoice.pdf                          .exe"), ["double-extension", "long-name"]);
  assert.deepEqual(nameTricks("rapport-annuel.pdf"), []);
  assert.deepEqual(nameTricks("archive.tar.gz"), []);
});

test("shows invisible characters in names", () => {
  assert.equal(visibleName("Commande_4471‮fdp.zip"), "Commande_4471⟨U+202E⟩fdp.zip");
  assert.equal(visibleName("plain.pdf"), "plain.pdf");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `filetype.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/attachments/filetype.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attachments
git commit -m "Tell what an attachment really is

detectType reads magic bytes (documents, archives, executables,
shortcuts, disk images, images, markup) instead of trusting the name or
the declared type. Extensions are sorted into classes so a name can be
judged — program, script, shortcut, disk image, web page — and names are
checked for direction overrides, double extensions and padding. Hidden
characters are spelled out for display."
```

---

### Task 3: ZIP listing

**Files:**
- Modify: `package.json` (dependency `fflate`)
- Create: `src/lib/attachments/zip.ts`, `src/lib/attachments/zip.test.ts`

**Interfaces:**
- Produces: `ZipEntry = { name: string; size: number; compressedSize: number; method: number; encrypted: boolean; offset: number }`, `listZip(data: Uint8Array): ZipEntry[] | null`, `readZipEntry(data: Uint8Array, entry: ZipEntry): Uint8Array | null`.

- [ ] **Step 1: Install fflate**

```bash
npm install fflate@^0.8.3
```

- [ ] **Step 2: Write the failing test**

```ts file=src/lib/attachments/zip.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { listZip, readZipEntry } from "./zip.ts";

const archive = () =>
  zipSync({
    "docs/readme.txt": strToU8("hello zip"),
    "été.pdf": [new Uint8Array(4096).fill(65), { level: 0 }],
  });

test("lists entries from the central directory", () => {
  const entries = listZip(archive());
  assert.deepEqual(entries?.map((e) => [e.name, e.size, e.encrypted]), [
    ["docs/readme.txt", 9, false],
    ["été.pdf", 4096, false],
  ]);
});

test("reads stored and deflated entries", () => {
  const data = archive();
  const entries = listZip(data) ?? [];
  assert.equal(new TextDecoder().decode(readZipEntry(data, entries[0]) ?? new Uint8Array()), "hello zip");
  assert.equal(readZipEntry(data, entries[1])?.length, 4096);
});

test("notices encrypted entries and does not read them", () => {
  const data = archive();
  const central = data.findIndex((_, i) => data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 1 && data[i + 3] === 2);
  data[central + 8] |= 1; // general-purpose flag bit 0: encrypted
  const [first] = listZip(data) ?? [];
  assert.equal(first.encrypted, true);
  assert.equal(readZipEntry(data, first), null);
});

test("returns null for data that is not a ZIP", () => {
  assert.equal(listZip(new TextEncoder().encode("not a zip at all")), null);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `zip.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/attachments/zip.ts
import { inflateSync } from "fflate";
import { decodeUtf8OrLegacy } from "../mime/charset.ts";

export type ZipEntry = {
  name: string;
  size: number;
  compressedSize: number;
  /** 0 = stored, 8 = deflate. */
  method: number;
  encrypted: boolean;
  /** Offset of the entry's local header. */
  offset: number;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const MAX_ENTRY_SIZE = 20_000_000;

/** Entries from the central directory, without decompressing anything. Null if this is not a ZIP. */
export function listZip(data: Uint8Array): ZipEntry[] | null {
  if (data.length < 22) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65_557); i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > data.length || view.getUint32(p, true) !== CENTRAL_HEADER) break;
    const flags = view.getUint16(p + 8, true);
    const nameLength = view.getUint16(p + 28, true);
    const nameBytes = data.subarray(p + 46, p + 46 + nameLength);
    entries.push({
      // Bit 11 marks UTF-8 names; older tools write the OEM code page.
      name: flags & 0x800 ? new TextDecoder().decode(nameBytes) : decodeUtf8OrLegacy(nameBytes),
      size: view.getUint32(p + 24, true),
      compressedSize: view.getUint32(p + 20, true),
      method: view.getUint16(p + 10, true),
      encrypted: (flags & 1) === 1,
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return entries.length > 0 || count === 0 ? entries : null;
}

/** The entry's content, or null when it is encrypted, too large, damaged or uses another method. */
export function readZipEntry(data: Uint8Array, entry: ZipEntry): Uint8Array | null {
  if (entry.encrypted || entry.size > MAX_ENTRY_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const p = entry.offset;
  if (p + 30 > data.length || view.getUint32(p, true) !== LOCAL_HEADER) return null;
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const raw = data.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method !== 8) return null;
  if (entry.size === 0) return new Uint8Array(0);
  try {
    return inflateSync(raw, { out: new Uint8Array(entry.size) });
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/attachments
git commit -m "List and read ZIP archives

Entries come from the central directory, so an archive's contents and
encryption are known without inflating anything; only the entries a
check needs are inflated, with fflate, up to 20 MB each. fflate is one of
the three local-only libraries the design allows."
```

---

### Task 4: Office documents

**Files:**
- Modify: `package.json` (dependency `cfb`)
- Create: `src/lib/attachments/office.ts`, `src/lib/attachments/office.test.ts`

**Interfaces:**
- Consumes: `listZip`, `readZipEntry`, `ZipEntry` (Task 3).
- Produces: `OoxmlInfo = { kind: string | null; macros: string | null; remoteTemplate: string | null; externalUrls: string[] }`, `inspectOoxml(data: Uint8Array, entries: ZipEntry[]): OoxmlInfo`, `OleInfo = { kind: string | null; macros: string | null }`, `inspectOle(data: Uint8Array): OleInfo`.

- [ ] **Step 1: Install cfb**

```bash
npm install cfb@^1.2.2
```

- [ ] **Step 2: Write the failing test**

```ts file=src/lib/attachments/office.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import * as CFB from "cfb";
import { strToU8, zipSync } from "fflate";
import { inspectOle, inspectOoxml } from "./office.ts";
import { listZip } from "./zip.ts";

const RELS = (type: string, target: string) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}" TargetMode="External"/></Relationships>`;

const ooxml = (files: Record<string, string | Uint8Array>) => {
  const data = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])));
  return inspectOoxml(data, listZip(data) ?? []);
};

test("recognises a macro-enabled Word document with a remote template", () => {
  const info = ooxml({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document/>",
    "word/vbaProject.bin": new Uint8Array(8),
    "word/_rels/settings.xml.rels": RELS("attachedTemplate", "https://cdn-office365.top/t.dotm"),
    "word/_rels/document.xml.rels": RELS("hyperlink", "https://example.com/terms"),
  });
  assert.deepEqual(info, {
    kind: "docx",
    macros: "word/vbaProject.bin",
    remoteTemplate: "https://cdn-office365.top/t.dotm",
    externalUrls: ["https://cdn-office365.top/t.dotm", "https://example.com/terms"],
  });
});

test("recognises clean Excel and PowerPoint files and Java archives", () => {
  assert.equal(ooxml({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<w/>" }).kind, "xlsx");
  assert.equal(ooxml({ "[Content_Types].xml": "<Types/>", "ppt/presentation.xml": "<p/>" }).macros, null);
  assert.equal(ooxml({ "META-INF/MANIFEST.MF": "Manifest-Version: 1.0" }).kind, "jar");
  assert.equal(ooxml({ "readme.txt": "x" }).kind, null);
});

test("finds macros in legacy OLE documents", () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "/WordDocument", new Uint8Array(16));
  CFB.utils.cfb_add(container, "/Macros/VBA/dir", new Uint8Array(16));
  const data = new Uint8Array(CFB.write(container, { type: "buffer" }));
  assert.deepEqual(inspectOle(data), { kind: "doc", macros: "Macros/VBA" });

  const clean = CFB.utils.cfb_new();
  CFB.utils.cfb_add(clean, "/Workbook", new Uint8Array(16));
  assert.deepEqual(inspectOle(new Uint8Array(CFB.write(clean, { type: "buffer" }))), { kind: "xls", macros: null });
});

test("survives damaged containers", () => {
  assert.deepEqual(inspectOle(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), { kind: null, macros: null });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `office.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/attachments/office.ts
import * as CFB from "cfb";
import { decodeUtf8OrLegacy } from "../mime/charset.ts";
import { readZipEntry, type ZipEntry } from "./zip.ts";

export type OoxmlInfo = {
  /** docx / xlsx / pptx / jar, or null for an ordinary ZIP. */
  kind: string | null;
  /** Where the VBA project sits, when there is one. */
  macros: string | null;
  /** A template fetched from the network when the document opens (template injection). */
  remoteTemplate: string | null;
  /** Every external http(s) target in the package's relationships. */
  externalUrls: string[];
};

const RELATIONSHIP = /<Relationship\b[^>]*>/gi;

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;
}

export function inspectOoxml(data: Uint8Array, entries: ZipEntry[]): OoxmlInfo {
  const names = entries.map((e) => e.name);
  const under = (prefix: string) => names.some((n) => n.startsWith(prefix));
  let kind: string | null = null;
  if (names.includes("[Content_Types].xml")) {
    kind = under("word/") ? "docx" : under("xl/") ? "xlsx" : under("ppt/") ? "pptx" : null;
  } else if (names.some((n) => n.toUpperCase() === "META-INF/MANIFEST.MF")) {
    kind = "jar";
  }

  const macros = names.find((n) => /(^|\/)vbaProject\.bin$/i.test(n)) ?? null;
  let remoteTemplate: string | null = null;
  const externalUrls: string[] = [];
  for (const entry of entries) {
    if (!/\.rels$/i.test(entry.name)) continue;
    const content = readZipEntry(data, entry);
    if (!content) continue;
    for (const tag of decodeUtf8OrLegacy(content).match(RELATIONSHIP) ?? []) {
      const target = attribute(tag, "Target");
      if (!target || !/^https?:\/\//i.test(target) || (attribute(tag, "TargetMode") ?? "").toLowerCase() !== "external") continue;
      if (!externalUrls.includes(target)) externalUrls.push(target);
      if (/attachedTemplate$/i.test(attribute(tag, "Type") ?? "")) remoteTemplate = target;
    }
  }
  return { kind, macros, remoteTemplate, externalUrls };
}

export type OleInfo = { kind: string | null; macros: string | null };

/** Legacy Office (OLE compound file): which application, and whether it carries a VBA project. */
export function inspectOle(data: Uint8Array): OleInfo {
  let paths: string[];
  try {
    paths = CFB.read(data, { type: "array" }).FullPaths.map((p) => p.replace(/^Root Entry\//, "").replace(/\/$/, ""));
  } catch {
    return { kind: null, macros: null };
  }
  const segments = new Set(paths.flatMap((p) => p.split("/")).map((s) => s.toLowerCase()));
  const kind = segments.has("worddocument")
    ? "doc"
    : segments.has("workbook") || segments.has("book")
      ? "xls"
      : segments.has("powerpoint document")
        ? "ppt"
        : paths.some((p) => p.toLowerCase().includes("__properties_version1.0"))
          ? "msg"
          : null;
  const macros =
    paths.find((p) => /(^|\/)(Macros|_VBA_PROJECT_CUR)\/VBA$/i.test(p)) ??
    paths.find((p) => /(^|\/)VBA$/i.test(p)) ??
    null;
  return { kind, macros };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/attachments
git commit -m "Look inside Office documents

OOXML packages are identified (Word, Excel, PowerPoint, or a Java archive
in disguise) and checked for a VBA project and for external
relationships, the template fetched on open above all (template
injection). Legacy OLE documents are read with cfb, the local-only
compound-file reader the design allows, to find their application and any
Macros or _VBA_PROJECT_CUR storage."
```

---

### Task 5: PDF documents

**Files:**
- Create: `src/lib/attachments/pdf.ts`, `src/lib/attachments/pdf.test.ts`

**Interfaces:**
- Consumes: `bytesToBinary` (`mime/bytes.ts`), fflate `unzlibSync`, `inflateSync`.
- Produces: `PdfInfo = { urls: string[]; active: string[] }`, `inspectPdf(data: Uint8Array): PdfInfo`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/attachments/pdf.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zlibSync } from "fflate";
import { inspectPdf } from "./pdf.ts";

function pdf(): Uint8Array {
  const plain =
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 3 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://evil.example/plain\\(1\\)) >> >>\nendobj\n" +
    "5 0 obj\n<< /A << /S /URI /URI <68747470733a2f2f6865782e6578616d706c652f> >> >>\nendobj\n";
  const packed = zlibSync(strToU8("<< /A << /S /URI /URI (https://evil.example/packed) >> >> << /S /JavaScript /JS (app.alert\\(1\\)) >>"));
  const head = strToU8(`${plain}4 0 obj\n<< /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`);
  const tail = strToU8("\nendstream\nendobj\n%%EOF\n");
  const out = new Uint8Array(head.length + packed.length + tail.length);
  out.set(head);
  out.set(packed, head.length);
  out.set(tail, head.length + packed.length);
  return out;
}

test("collects links from plain, hex and compressed objects", () => {
  assert.deepEqual(inspectPdf(pdf()).urls, [
    "https://evil.example/plain(1)",
    "https://hex.example/",
    "https://evil.example/packed",
  ]);
});

test("names active content", () => {
  assert.deepEqual(inspectPdf(pdf()).active, ["JavaScript", "runs an action when opened"]);
});

test("is quiet on a plain document", () => {
  assert.deepEqual(inspectPdf(strToU8("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")), { urls: [], active: [] });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `pdf.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/attachments/pdf.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attachments
git commit -m "Read links and active content out of PDFs

/URI targets are collected from literal and hex strings, including those
packed into compressed object streams, which are inflated (50 MB at
most) and searched too. JavaScript, open actions, launch actions,
embedded files and form submission are named."
```

---

### Task 6: HTML smuggling and QR codes

**Files:**
- Modify: `package.json` (dependency `jsqr`)
- Create: `src/lib/attachments/smuggling.ts`, `src/lib/attachments/smuggling.test.ts`
- Create: `src/lib/attachments/qr.ts`, `src/lib/attachments/qr.test.ts`, `src/lib/testing/png.ts`
- Create: `fixtures/quishing-qr.eml`

**Interfaces:**
- Produces: `smugglingIndicators(text: string): { payload: string[]; delivery: string[] }`, `isSmuggling(found): boolean`; `Pixels = { data: Uint8ClampedArray; width: number; height: number }`, `decodeQr(image: Pixels): string | null`; tests only: `decodePng(bytes: Uint8Array): Pixels`.

- [ ] **Step 1: Install jsqr**

```bash
npm install jsqr@^1.4.0
```

- [ ] **Step 2: Fixture**

```eml file=fixtures/quishing-qr.eml
Received: from mail.m365-notification.top (mail.m365-notification.top [91.208.197.42])
        by mx.google.com with ESMTPS id 3f2a1b0c9d8e
        for <claire.dupont@gmail.com>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 13 Oct 2026 06:12:30 -0700 (PDT)
Authentication-Results: mx.google.com;
       dkim=pass header.i=@m365-notification.top header.s=s1;
       spf=pass (google.com: domain of securite@m365-notification.top designates 91.208.197.42 as permitted sender) smtp.mailfrom=securite@m365-notification.top;
       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=m365-notification.top
Return-Path: <securite@m365-notification.top>
From: Microsoft 365 <securite@m365-notification.top>
To: claire.dupont@gmail.com
Subject: =?UTF-8?Q?R=C3=A9activez_l=27authentification_multifacteur?=
Date: Tue, 13 Oct 2026 13:12:29 +0000
Message-ID: <mfa.4471@m365-notification.top>
MIME-Version: 1.0
Content-Type: multipart/related; boundary="rel_4471"

--rel_4471
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html><body>
<p>Votre authentification multifacteur expire aujourd'hui.</p>
<p>Scannez ce code avec votre t=C3=A9l=C3=A9phone pour la r=C3=A9activer&nbsp;:</p>
<p><img src=3D"cid:qr4471@m365" width=3D"148" height=3D"148" alt=3D"QR"></p>
</body></html>
--rel_4471
Content-Type: image/png; name="mfa.png"
Content-Disposition: inline; filename="mfa.png"
Content-ID: <qr4471@m365>
Content-Transfer-Encoding: base64

iVBORw0KGgoAAAANSUhEUgAAAJQAAACUCAYAAAB1PADUAAAAAklEQVR4AewaftIAAAXRSURBVO3B
QY5otxHAQFKY+1+Z8bJXMh5G/omDrrK/sNYjh7UeOqz10GGthw5rPXRY66HDWg8d1nroh7+h8idV
fKEyVUwqNxU3Kv+kiknlpmJS+ZMqbg5rPXRY66HDWg/98FHFSyovqUwVk8qk8kXFpDJV3KjcVEwq
X1S8pPLFYa2HDms9dFjroR9+SeWLii9UpoqpYlK5qfhC5abiJZWp4jdUvqj4jcNaDx3Weuiw1kM/
/MuoTBVTxY3KTcVUMalMFV9U/D87rPXQYa2HDms99MP/GZWp4jdUpooblZuK/2eHtR46rPXQYa2H
fvilij+pYlKZKm4qJpVJ5UZlqpgqJpVJ5abipYo/6bDWQ4e1Hjqs9dAPH6n8m6hMFTcVk8pUMalM
FTcVk8qNylRxo/LfdFjrocNaDx3WeuiHv1Hxv0TlRmWq+G+qmFRuVKaKm4r/JYe1Hjqs9dBhrYfs
L1yoTBWTyksVL6ncVHyhMlXcqEwVk8oXFZPKSxW/cVjrocNaDx3WeuiHX6p4SWWquFG5qfgNlani
RmWquKmYVKaK36iYVG5UbipuDms9dFjrocNaD/3wkcpUMalMFTcqX6i8pPKFyk3FpDJVTCpTxY3K
TcWkMlVMKjcVXxzWeuiw1kOHtR764bGKSWWqmCpuVH5DZaqYKn5DZVKZKiaVL1RuKr5Q+Scd1nro
sNZDh7Ue+uGjihuVL1Smit+omFS+UJkqJpWp4ouKG5XfUPmiYlL5jcNaDx3Weuiw1kM/fKQyVfxG
xaQyVUwqU8VLFZPKVDGpfFExqdxU3KhMFV+o3KhMFTeHtR46rPXQYa2H7C88pPJPqrhReaniJZWb
iknli4rfUJkqvjis9dBhrYcOaz30wy+p/EbFpPKFyn+TylQxqfxGxaTyhcoXFb9xWOuhw1oPHdZ6
6Ie/oTJVTBU3KlPFpDJVfFHxhcpUMancqNyo3FRMKjcqNxWTyk3FFypTxc1hrYcOaz10WOuhH/5G
xaRyUzFV3FR8ofIbFZPKVDGpTBU3Kl9UTCpTxY3KTcWkclPxG4e1Hjqs9dBhrYfsL1yoTBWTylQx
qUwVk8pNxRcqL1X8hspUMalMFTcqU8WkclMxqdxUfHFY66HDWg8d1nrI/sKFylQxqfxGxaQyVdyo
TBWTylTxhcpUcaPyUsWNyksVk8pUcXNY66HDWg8d1nrohz+sYlKZKr6o+EJlqvhC5YuKG5Wp4kZl
qphUvqiYVKaKLw5rPXRY66HDWg/98EsVX6hMFTcqU8Wk8idVTCo3KlPFVDGpTBVTxaRyU/FFxaQy
Vdwc1nrosNZDh7Uesr9woTJVTCpTxY3KTcVvqNxUTCovVUwqNxU3Kl9U3Kh8UfHFYa2HDms9dFjr
oR9+qeI3Kn5DZaqYVF6quFGZKiaVSeWm4guV36iYVKaKm8NaDx3Weuiw1kM//JLKVDGpTBWTyhcV
U8Wk8kXFpDJVTCo3FTcVk8qNyksVNyq/cVjrocNaDx3Wesj+wv8wlZuKL1RuKm5UpopJ5YuKG5Wp
4guVqWJS+aLi5rDWQ4e1Hjqs9dAPf0PlT6qYKiaVlyomld+ouFGZVH5DZap4qeKLw1oPHdZ66LDW
Qz98VPGSyo3KjcpUMalMFZPKFxWTyk3FP6niC5Wbikllqrg5rPXQYa2HDms99MMvqXxR8RsVv6Ey
VUwqNypTxRcVX6hMKi9VTCq/cVjrocNaDx3WeuiHfxmVqeKm4ouKSWWqmFT+SRWTylRxo3Kj8tJh
rYcOaz10WOuhH/5lKiaVqWJS+Y2KSWWquFGZKm5UbiomlZuKP+mw1kOHtR46rPXQD79U8U+qmFSm
ikllqphUpopJZVKZKiaVqeJG5abii4oblS8qfuOw1kOHtR46rPXQDx+p/EkqU8VNxRcqX6jcqNxU
TCo3KjcVk8pUMalMFZPKVPHFYa2HDms9dFjrIfsLaz1yWOuhw1oPHdZ66LDWQ4e1Hjqs9dBhrYf+
A2s9A1JzAaoqAAAAAElFTkSuQmCC
--rel_4471--
```

- [ ] **Step 3: Write the failing tests**

```ts file=src/lib/attachments/smuggling.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail } from "../mime/parse.ts";
import { isSmuggling, smugglingIndicators } from "./smuggling.ts";

test("recognises the spoofed invoice's smuggling page", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const found = smugglingIndicators(new TextDecoder().decode(email.attachments[0].data));
  assert.deepEqual(found.payload, ["atob() decodes an embedded payload"]);
  assert.deepEqual(found.delivery, [
    "builds a file in the browser (Blob)",
    "gives the file a local URL",
    "saves it without a download prompt",
    "triggers a download",
    "clicks a link by script",
  ]);
  assert.ok(isSmuggling(found));
});

test("needs both a payload and a way to deliver it", () => {
  assert.ok(!isSmuggling(smugglingIndicators("<script>var x = atob('aGk=');</script>")));
  assert.ok(!isSmuggling(smugglingIndicators('<a href="report.pdf" download="report.pdf">Download</a>')));
  assert.ok(isSmuggling(smugglingIndicators(`<a href="data:application/octet-stream;base64,TVqQ" download="x.iso">x</a>`)));
});
```

```ts file=src/lib/attachments/qr.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail } from "../mime/parse.ts";
import { decodePng } from "../testing/png.ts";
import { decodeQr } from "./qr.ts";

test("decodes the QR code of the quishing fixture", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/quishing-qr.eml", import.meta.url)));
  const image = email.attachments.find((a) => a.filename === "mfa.png");
  assert.ok(image);
  assert.equal(decodeQr(decodePng(image.data)), "https://login-micros0ft365.com.verify-mfa.top/?e=claire.dupont");
});

test("returns null when there is no code", () => {
  const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 };
  assert.equal(decodeQr(blank), null);
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `smuggling.ts`, `qr.ts`, `testing/png.ts`.

- [ ] **Step 5: Implement**

```ts file=src/lib/attachments/smuggling.ts
// Where an embedded file comes from…
const PAYLOAD: [RegExp, string][] = [
  [/\batob\s*\(/, "atob() decodes an embedded payload"],
  [/data:application\/(?:octet-stream|x-msdownload|zip|x-zip-compressed|x-iso9660-image)[^"'\s]*;base64,/i, "embeds a file as a data: URL"],
  [/[A-Za-z0-9+/]{4000,}={0,2}/, "carries a long base64 blob"],
];

// …and how it reaches the disk.
const DELIVERY: [RegExp, string][] = [
  [/new\s+Blob\s*\(/, "builds a file in the browser (Blob)"],
  [/createObjectURL\s*\(/, "gives the file a local URL"],
  [/msSaveOrOpenBlob|msSaveBlob/, "saves it without a download prompt"],
  [/\.download\s*=|\sdownload\s*=\s*["']/, "triggers a download"],
  [/\.click\s*\(\s*\)/, "clicks a link by script"],
];

export type SmugglingIndicators = { payload: string[]; delivery: string[] };

export function smugglingIndicators(text: string): SmugglingIndicators {
  const matching = (rules: [RegExp, string][]) => rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return { payload: matching(PAYLOAD), delivery: matching(DELIVERY) };
}

/**
 * HTML smuggling: a page that carries a file and writes it to disk itself,
 * so the file never crosses the mail filter as an attachment.
 */
export function isSmuggling(found: SmugglingIndicators): boolean {
  return found.payload.length > 0 && found.delivery.length > 0;
}
```

```ts file=src/lib/attachments/qr.ts
import jsQR from "jsqr";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** The text of a QR code in an RGBA image, or null. jsqr is one of the local-only libraries the design allows. */
export function decodeQr(image: Pixels): string | null {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return result?.data ? result.data : null;
}
```

```ts file=src/lib/testing/png.ts
import { unzlibSync } from "fflate";
import type { Pixels } from "../attachments/qr.ts";

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * A minimal PNG decoder for tests (8-bit, non-interlaced), standing in for
 * the browser's image decoder. Never imported by the app.
 */
export function decodePng(bytes: Uint8Array): Pixels {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Uint8Array[] = [];
  for (let pos = 8; pos < bytes.length; ) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      channels = CHANNELS[bytes[pos + 17]] ?? 0;
      if (bytes[pos + 16] !== 8 || bytes[pos + 20] !== 0 || channels === 0) throw new Error("test PNG decoder: 8-bit, non-interlaced, no palette");
    } else if (type === "IDAT") {
      parts.push(bytes.subarray(pos + 8, pos + 8 + length));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  const compressed = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((offset, p) => (compressed.set(p, offset), offset + p.length), 0);
  const raw = unzlibSync(compressed);
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const s = x * channels;
      const gray = channels < 3;
      out[i] = line[s];
      out[i + 1] = gray ? line[s] : line[s + 1];
      out[i + 2] = gray ? line[s] : line[s + 2];
      out[i + 3] = channels === 4 ? line[s + 3] : channels === 2 ? line[s + 1] : 255;
    }
    previous = line;
  }
  return { data: out, width, height };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/attachments src/lib/testing fixtures/quishing-qr.eml
git commit -m "Spot HTML smuggling and read QR codes

An HTML attachment smuggles a file when it both carries a payload
(atob, a data: URL, a long base64 blob) and writes it out (Blob,
createObjectURL, msSaveOrOpenBlob, a download attribute, a scripted
click). QR codes are decoded from pixels with jsqr, the third local-only
library the design allows; the engine never decodes images itself.

Adds a quishing fixture: a Microsoft 365 lookalike whose only link is a
QR code."
```

---

### Task 7: Attachment analysis and findings

**Files:**
- Modify: `src/lib/finding.ts` (category `attachment`)
- Create: `fixtures/macro-docm.eml`, `fixtures/rtlo-archive.eml`
- Create: `src/lib/attachments/analyze.ts`, `src/lib/attachments/analyze.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6, `Attachment` (`email.ts`), `decodeUtf8OrLegacy`.
- Produces: `AttachmentFlag`, `AttachmentReport = { filename; visibleName; declaredType; inline; size; detected: FileKind; hashes: Hashes; flags: AttachmentFlag[]; details: Partial<Record<AttachmentFlag, string>>; entries: { name: string; size: number; encrypted: boolean; flagged: boolean }[] | null; urls: string[]; qr: string[]; html: string | null }`, `ImageDecoder = (data: Uint8Array, contentType: string) => Promise<Pixels | null>`, `analyzeAttachments(attachments: readonly Attachment[], options?: { decodeImage?: ImageDecoder }): Promise<AttachmentReport[]>`, `attachmentFindings(reports: readonly AttachmentReport[]): Finding[]`.

- [ ] **Step 1: Finding category**

In `src/lib/finding.ts`, replace the `FindingCategory` declaration and its comment with:

```ts
export type FindingCategory = "auth" | "sender" | "route" | "vendor" | "link" | "html" | "attachment";
```

- [ ] **Step 2: Fixtures**

```eml file=fixtures/macro-docm.eml
Received: from smtp.banque-cotes.fr (smtp.banque-cotes.fr [62.210.18.77])
        by mx.google.com with ESMTPS id 9b8c7d6e5f4a
        for <claire.dupont@gmail.com>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 13 Oct 2026 01:05:44 -0700 (PDT)
Authentication-Results: mx.google.com;
       dkim=pass header.i=@banque-cotes.fr header.s=mail;
       spf=pass (google.com: domain of releves@banque-cotes.fr designates 62.210.18.77 as permitted sender) smtp.mailfrom=releves@banque-cotes.fr;
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=banque-cotes.fr
Return-Path: <releves@banque-cotes.fr>
From: Banque des =?UTF-8?Q?C=C3=B4tes?= <releves@banque-cotes.fr>
To: claire.dupont@gmail.com
Subject: =?UTF-8?Q?Votre_relev=C3=A9_d=27octobre?=
Date: Tue, 13 Oct 2026 08:05:43 +0000
Message-ID: <releve.4471@banque-cotes.fr>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="mix_docm"

--mix_docm
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

Bonjour,

Votre relevé d'octobre est joint. Activez le contenu à l'ouverture pour l'afficher.
--mix_docm
Content-Type: application/vnd.ms-word.document.macroEnabled.12; name="Releve_compte_2026-10.docm"
Content-Disposition: attachment; filename="Releve_compte_2026-10.docm"
Content-Transfer-Encoding: base64

UEsDBBQAAAAIAABQTV1W4zNKpgAAANcAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbD2OOw7CMBBE
rxK5RfEGCgoUOwWiBQousNhLYhF/ZJsAt8cGiXI1+95MP7zs3CwUk/FOsDXv2CD7yztQakrikmBT
zmEHkNREFhP3gVxJbj5azOWMIwRUdxwJNl23BeVdJpfbXB1M9qcij0ZTc8aYj2hJMHj6qEF79bDl
kxcba/Y/rDYLhiHMRmEum2BxmtvUVoT/EYsq+oPD60wlReNWVQKyh+90+QFQSwMEFAAAAAgAAFBN
XW6oB0yeAAAA0wAAABEAAAB3b3JkL2RvY3VtZW50LnhtbDWO0Q3CMAxEV4kyQFP44KMqrRglpG4b
KbEjJ22BjZiDxXCE+Hm2dbrz9eMjBrUDZ0941aem1ePQH91EbouARYmMuTuuei0ldcZkt0K0uaEE
KNpMHG2RkxdzEE+JyUHOHpcYzLltLyZaj7pG3ml61pkquKIMN1f8Di8VQDnCAripRBsrO89eHnEV
GALsn3fTm+qoFLNQcoS/VFn+jYcvUEsDBBQAAAAIAABQTV0OupMZuAAAAD0BAAAcAAAAd29yZC9f
cmVscy9zZXR0aW5ncy54bWwucmVsc43QvQrCQAwA4Fcpt9tURQdp66KDg4v4AuEu/cHeD3dR9O2N
VMGCg2P+voSU27sdshvF1HtXqXleqG1dnmhAlkTq+pAy6XCpUh1z2AAk3ZHFlPtATiqNjxZZwthC
QH3BlmBRFGuI34aamtnBVCoezFxl50egf2zfNL2mnddXS45/rABkRpk3Z7JB8iQ2xpZ41JPw2rjZ
6CzXq5x9AH73ppdFN8qNZ/sZPHojp+3vTNHhoKAuYfKY+glQSwMEFAAAAAgAAFBNXSd7xkoNAAAA
QAAAABMAAAB3b3JkL3ZiYVByb2plY3QuYmluu3Be8MHCjVIPGcgEAFBLAQIUABQAAAAIAABQTV1W
4zNKpgAAANcAAAATAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAA
AAgAAFBNXW6oB0yeAAAA0wAAABEAAAAAAAAAAAAAAAAA1wAAAHdvcmQvZG9jdW1lbnQueG1sUEsB
AhQAFAAAAAgAAFBNXQ66kxm4AAAAPQEAABwAAAAAAAAAAAAAAAAApAEAAHdvcmQvX3JlbHMvc2V0
dGluZ3MueG1sLnJlbHNQSwECFAAUAAAACAAAUE1dJ3vGSg0AAABAAAAAEwAAAAAAAAAAAAAAAACW
AgAAd29yZC92YmFQcm9qZWN0LmJpblBLBQYAAAAABAAEAAsBAADUAgAAAAA=
--mix_docm--
```

```eml file=fixtures/rtlo-archive.eml
Received: from mail.fournisseur-industriel.com (mail.fournisseur-industriel.com [37.120.140.9])
        by mx.google.com with ESMTPS id 1a2b3c4d5e6f
        for <claire.dupont@gmail.com>
        (version=TLS1_2 cipher=ECDHE-RSA-AES128-GCM-SHA256 bits=128/128);
        Tue, 13 Oct 2026 02:30:10 -0700 (PDT)
Authentication-Results: mx.google.com;
       spf=pass (google.com: domain of commandes@fournisseur-industriel.com designates 37.120.140.9 as permitted sender) smtp.mailfrom=commandes@fournisseur-industriel.com;
       dkim=pass header.i=@fournisseur-industriel.com header.s=default;
       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=fournisseur-industriel.com
Return-Path: <commandes@fournisseur-industriel.com>
From: Service Commandes <commandes@fournisseur-industriel.com>
To: claire.dupont@gmail.com
Subject: Commande 4471 - bon de commande
Date: Tue, 13 Oct 2026 09:30:09 +0000
Message-ID: <cmd.4471@fournisseur-industriel.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="mix_rtlo"

--mix_rtlo
Content-Type: text/plain; charset=utf-8

Bonjour,

Veuillez trouver ci-joint le bon de commande 4471.
--mix_rtlo
Content-Type: application/zip; name*=utf-8''Commande_4471%E2%80%AEfdp.zip
Content-Disposition: attachment; filename*=utf-8''Commande_4471%E2%80%AEfdp.zip
Content-Transfer-Encoding: base64

UEsDBBQAAAAIAABQTV0xZR1tMAAAAIAAAAAVAAAAQ29tbWFuZGVfNDQ3MS5wZGYuZXhl841ioCII
ycgsVigoyk8vSsxVSE7My8svUUhKVSgqzVPIzFNw8Q9WyM1PSdVD0gEAUEsBAhQAFAAAAAgAAFBN
XTFlHW0wAAAAgAAAABUAAAAAAAAAAAAAAAAAAAAAAENvbW1hbmRlXzQ0NzEucGRmLmV4ZVBLBQYA
AAAAAQABAEMAAABjAAAAAAA=
--mix_rtlo--
```

- [ ] **Step 3: Write the failing test**

```ts file=src/lib/attachments/analyze.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import type { Attachment } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { decodePng } from "../testing/png.ts";
import { analyzeAttachments, attachmentFindings } from "./analyze.ts";

const attachmentsOf = (name: string) =>
  parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url))).attachments;
const file = (filename: string, data: Uint8Array, contentType = "application/octet-stream"): Attachment => ({
  filename, contentType, contentId: null, inline: false, data,
});
const decodeImage = async (data: Uint8Array) => decodePng(data);

test("unmasks the spoofed invoice's smuggling page", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("spoofed-invoice.eml"));
  assert.equal(report.detected.kind, "html");
  assert.deepEqual(report.flags, ["web-page", "double-extension", "html-smuggling"]);
  assert.equal(report.hashes.sha256, createHash("sha256").update(report.html ?? "").digest("hex"));
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id), ["attachment.html-smuggling", "attachment.double-extension"]);
});

test("finds the macros and remote template in the .docm", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("macro-docm.eml"));
  assert.equal(report.detected.kind, "docx");
  assert.deepEqual(report.flags, ["macros", "remote-template"]);
  assert.equal(report.details["remote-template"], "https://cdn-office365.top/templates/releve.dotm");
  assert.deepEqual(report.urls, ["https://cdn-office365.top/templates/releve.dotm"]);
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id), ["attachment.macros", "attachment.remote-template"]);
});

test("sees through the reversed name and into the archive", async () => {
  const [report] = await analyzeAttachments(attachmentsOf("rtlo-archive.eml"));
  assert.equal(report.visibleName, "Commande_4471⟨U+202E⟩fdp.zip");
  assert.deepEqual(report.entries, [{ name: "Commande_4471.pdf.exe", size: 128, encrypted: false, flagged: true }]);
  assert.deepEqual(attachmentFindings([report]).map((f) => f.id).sort(), ["attachment.archive-hides-program", "attachment.rtlo"]);
});

test("reads the QR code when an image decoder is available", async () => {
  const withDecoder = await analyzeAttachments(attachmentsOf("quishing-qr.eml"), { decodeImage });
  assert.deepEqual(withDecoder[0].qr, ["https://login-micros0ft365.com.verify-mfa.top/?e=claire.dupont"]);
  assert.deepEqual(withDecoder[0].flags, ["qr-code"]);
  const without = await analyzeAttachments(attachmentsOf("quishing-qr.eml"));
  assert.deepEqual(without[0].qr, []);
});

test("flags a misnamed file, an encrypted archive and an active PDF", async () => {
  const zip = zipSync({ "a.txt": strToU8("x") });
  const encrypted = zip.slice();
  const central = encrypted.findIndex((_, i) => encrypted[i] === 0x50 && encrypted[i + 1] === 0x4b && encrypted[i + 2] === 1 && encrypted[i + 3] === 2);
  encrypted[central + 8] |= 1;
  const reports = await analyzeAttachments([
    file("invoice.pdf", zip),
    file("scan.zip", encrypted),
    file("terms.pdf", strToU8("%PDF-1.7\n1 0 obj\n<< /OpenAction << /S /Launch /F (cmd.exe) >> >>\nendobj\n")),
  ]);
  assert.equal(reports[0].details["type-mismatch"], "named .pdf, actually ZIP archive");
  assert.ok(reports[1].flags.includes("encrypted-archive"));
  assert.equal(reports[2].details["pdf-active"], "runs an action when opened, launches a program");
  assert.deepEqual(attachmentFindings(reports).map((f) => f.id), [
    "attachment.encrypted-archive",
    "attachment.type-mismatch",
    "attachment.pdf-active",
  ]);
});

test("leaves ordinary attachments alone", async () => {
  const reports = await analyzeAttachments([file("photo.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")]);
  assert.deepEqual(reports[0].flags, []);
  assert.deepEqual(attachmentFindings(reports), []);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `attachments/analyze.ts`.

- [ ] **Step 5: Implement**

```ts file=src/lib/attachments/analyze.ts
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
  { flag: "double-extension", severity: "high", weight: 12, title: "Double extension",
    explanation: "The name ends like a document, then carries the real, dangerous extension." },
  { flag: "web-page", severity: "medium", weight: 10, title: "HTML attachment",
    explanation: "It opens as a local web page, a common vessel for fake login forms." },
  { flag: "encrypted-archive", severity: "medium", weight: 10, title: "Password-protected archive",
    explanation: "Encryption keeps scanners from looking inside; the password is usually in the email." },
  { flag: "qr-code", severity: "medium", weight: 10, title: "QR code in an image",
    explanation: "A QR code moves the link to a phone, away from link scanning and the corporate browser." },
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finding.ts src/lib/attachments fixtures
git commit -m "Analyse attachments and report what they hide

Each attachment is hashed, typed from its bytes, and checked by name and
content: programs, scripts, shortcuts, disk images and web pages; double
extensions, direction overrides and padded names; a type that
contradicts the name; archive contents and encryption; Office macros and
remote templates; HTML smuggling; active PDFs; QR codes. One finding per
kind, with a more specific one silencing a generic one on the same file.

Adds two fixtures: a macro-enabled .docm with a remote template, and a
ZIP named with a right-to-left override that hides an executable."
```

---

### Task 8: Links found in attachments

**Files:**
- Modify: `src/lib/links/analyze.ts`, `src/lib/links/analyze.test.ts`

**Interfaces:**
- Produces (changed): `LinkOrigin = HtmlOrigin | "text" | "file" | "qr"`; `Link` gains `attachment: string | null` and `source: "html" | "text" | "attachment"`; `AttachmentContent = { name: string; html: Document | null; urls: string[]; qr: string[] }`; `LocatedForm = HtmlForm & { attachment: string | null }`; `LinkReport.forms: LocatedForm[]`; `analyzeLinks(email, doc, context, attachments: readonly AttachmentContent[] = [])`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/links/analyze.test.ts`:

```ts
test("analyses links, QR codes and forms found in attachments", () => {
  const report = analyzeLinks(htmlEmail(null), null, { fromDomain: null, references }, [
    {
      name: "login.html",
      html: parse(`<form action="https://evil.example/collect" method="post"><input type="password" name="p"></form>
        <a href="https://bit.ly/x">https://www.paypal.com</a>`),
      urls: [],
      qr: [],
    },
    { name: "terms.pdf", html: null, urls: ["https://paypa1.com/doc"], qr: [] },
    { name: "mfa.png", html: null, urls: [], qr: ["https://evil.example/qr", "WIFI:S:office;;"] },
  ]);
  assert.deepEqual(
    report.links.map((l) => [l.source, l.attachment, l.origin, l.url.final]),
    [
      ["attachment", "login.html", "form", "https://evil.example/collect"],
      ["attachment", "login.html", "a", "https://bit.ly/x"],
      ["attachment", "terms.pdf", "file", "https://paypa1.com/doc"],
      ["attachment", "mfa.png", "qr", "https://evil.example/qr"],
    ],
  );
  assert.equal(report.forms[0].attachment, "login.html");
  const password = report.findings.find((f) => f.id === "html.password-form");
  assert.equal(password?.title, "Password form in an attachment");
  assert.deepEqual(password?.evidence, ["POST https://evil.example/collect — p (in login.html)"]);
  assert.deepEqual(report.findings.map((f) => f.id), [
    "link.deceptive",
    "url.lookalike",
    "url.shortener",
    "html.password-form",
  ]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `analyzeLinks` ignores its fourth argument; the new test sees no links.

- [ ] **Step 3: Implement**

In `src/lib/links/analyze.ts`, make these changes:

1. Replace the `LinkOrigin`, `Link` and `LinkReport` declarations with:

```ts
export type LinkOrigin = HtmlOrigin | "text" | "file" | "qr";

export type Link = {
  source: "html" | "text" | "attachment";
  /** Name of the attachment the link was found in, for `source: "attachment"`. */
  attachment: string | null;
  origin: LinkOrigin;
  text: string | null;
  hidden: string | null;
  url: InspectedUrl;
  /** Domain the link text displays, when it is not where the link goes. */
  shownHost: string | null;
  tracking: "pixel" | "tracker" | null;
};

/** What an attachment contributes: its parsed HTML, the URLs inside it, its QR codes. */
export type AttachmentContent = { name: string; html: Document | null; urls: string[]; qr: string[] };

export type LocatedForm = HtmlForm & { attachment: string | null };

export type LinkReport = { links: Link[]; forms: LocatedForm[]; findings: Finding[] };
```

2. Replace `const CLICKABLE = new Set<LinkOrigin>(["a", "area", "form", "meta-refresh", "text"]);` with:

```ts
const CLICKABLE = new Set<LinkOrigin>(["a", "area", "form", "meta-refresh", "text", "file", "qr"]);
```

3. Replace the whole `analyzeLinks` function with:

```ts
export function analyzeLinks(
  email: ParsedEmail,
  doc: Document | null,
  context: LinkContext,
  attachments: readonly AttachmentContent[] = [],
): LinkReport {
  const links: Link[] = [];
  const forms: LocatedForm[] = [];
  let brokenWords: string[] = [];
  let bidiOverrides = 0;

  const fromDocument = (document: Document, attachment: string | null) => {
    const html = extractHtml(document);
    forms.push(...html.forms.map((form) => ({ ...form, attachment })));
    if (attachment === null) {
      brokenWords = html.brokenWords;
      bidiOverrides = html.bidiOverrides;
    }
    for (const item of html.links) {
      if (item.raw.startsWith("#")) continue; // in-page anchors go nowhere
      const url = inspectUrl(item.raw, { base: html.base, references: context.references });
      links.push({
        source: attachment === null ? "html" : "attachment", attachment, origin: item.origin, text: item.text,
        hidden: item.hidden, url, shownHost: shownHost(item, url), tracking: tracking(item, url),
      });
    }
  };
  const plain = (raw: string, origin: LinkOrigin, source: Link["source"], attachment: string | null): Link => ({
    source, attachment, origin, text: null, hidden: null,
    url: inspectUrl(raw, { references: context.references }), shownHost: null, tracking: null,
  });

  if (doc) fromDocument(doc, null);
  if (email.text) for (const raw of findUrlsInText(email.text)) links.push(plain(raw, "text", "text", null));
  for (const attachment of attachments) {
    if (attachment.html) fromDocument(attachment.html, attachment.name);
    for (const raw of attachment.urls) links.push(plain(raw, "file", "attachment", attachment.name));
    // QR codes also carry Wi-Fi settings, contacts or plain text; only web addresses are links.
    for (const raw of attachment.qr.filter((t) => /^(https?:\/\/|www\.)/i.test(t))) {
      links.push(plain(/^www\./i.test(raw) ? `http://${raw}` : raw, "qr", "attachment", attachment.name));
    }
  }
  return { links, forms, findings: linkFindings(links, forms, brokenWords, bidiOverrides, context) };
}
```

4. In `linkFindings`, change the `forms` parameter type from `HtmlForm[]` to `LocatedForm[]`, and replace the form part — from `const formEvidence` through the end of the `else if (forms.length > 0) { … }` block — with:

```ts
  const formEvidence = (list: LocatedForm[]) =>
    unique(list.map((f) => `${f.method.toUpperCase()} ${f.action || "(no action)"} — ${f.fields.join(", ")}${f.attachment ? ` (in ${f.attachment})` : ""}`));
  const passwordForms = forms.filter((f) => f.hasPassword);
  if (passwordForms.length > 0) {
    findings.push({
      id: "html.password-form", category: "html", severity: "high",
      title: passwordForms.every((f) => f.attachment) ? "Password form in an attachment" : "Password form inside the email",
      explanation: "The message asks for a password in a form of its own. No legitimate service collects credentials that way.",
      evidence: formEvidence(passwordForms), weight: 18,
    });
  } else if (forms.length > 0) {
    findings.push({
      id: "html.form", category: "html", severity: "medium",
      title: forms.every((f) => f.attachment) ? "Form in an attachment" : "Form inside the email",
      explanation: "The message contains a form that sends what is typed into it to a server.",
      evidence: formEvidence(forms), weight: 10,
    });
  }
```

5. Remove `type HtmlForm` from the `../html/extract.ts` import if the linter reports it unused (it is still used by `LocatedForm`, so keep it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (the milestone 2 link tests are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/links
git commit -m "Analyse links found inside attachments

HTML attachments are analysed like the body — links, forms, remote
content — and PDF actions, Office external targets and QR codes that
hold a web address become links too, each tagged with the attachment it
came from. A password form in an attachment is reported as such."
```

---

### Task 9: IOCs, defang and refang

**Files:**
- Create: `src/lib/ioc/defang.ts`, `src/lib/ioc/defang.test.ts`, `src/lib/ioc/collect.ts`

**Interfaces:**
- Consumes: `HeaderReport`, `Link`, `isClickable`, `LinkOrigin`, `AttachmentReport`, `ParsedEmail`, `isFreeMail`, `normaliseHost`, `isIp`, `ipScope`, `parseAddressList`, `getHeaders`.
- Produces: `IOC_TYPES`, `IocType = "url" | "domain" | "ip" | "email" | "sha256" | "sha1" | "md5"`, `Ioc = { type: IocType; value: string; sources: string[] }`, `defang(type: IocType, value: string): string`, `refang(text: string): string`, `collectIocs(input: { email: ParsedEmail; headers: HeaderReport; links: Link[]; attachments: AttachmentReport[] }): Ioc[]`. (`collectIocs` is tested through `analyzeEmail` in Task 11.)

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/ioc/defang.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { defang, refang } from "./defang.ts";

test("defangs each kind of indicator", () => {
  assert.equal(defang("url", "https://rhone-energie.fr.secure-login.click/auth?u=j.martin"), "hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth?u=j.martin");
  assert.equal(defang("url", "HTTP://evil.example/a.b"), "hxxp://evil[.]example/a.b");
  assert.equal(defang("domain", "mta-relay.click"), "mta-relay[.]click");
  assert.equal(defang("ip", "185.234.72.19"), "185[.]234[.]72[.]19");
  assert.equal(defang("email", "bounce-7f3a@mta-relay.click"), "bounce-7f3a[@]mta-relay[.]click");
  assert.equal(defang("sha256", "ab12"), "ab12");
});

test("refangs the usual notations", () => {
  assert.equal(refang("hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth"), "https://rhone-energie.fr.secure-login.click/auth");
  assert.equal(refang("bounce[@]mta-relay(.)click, 1.2.3[.]4, evil[dot]example, hxxp[://]x[.]y"), "bounce@mta-relay.click, 1.2.3.4, evil.example, http://x.y");
});

test("round-trips", () => {
  for (const [type, value] of [["url", "https://a.example/x?y=1"], ["domain", "a.b.example"], ["ip", "10.0.0.1"], ["email", "x@y.example"]] as const) {
    assert.equal(refang(defang(type, value)), value);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `defang.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/ioc/defang.ts
import type { IocType } from "./collect.ts";

/**
 * The form tickets and chat tools will not turn into live links:
 * `hxxps://evil[.]example/path`, `user[@]evil[.]example`, `1[.]2[.]3[.]4`.
 */
export function defang(type: IocType, value: string): string {
  switch (type) {
    case "url": {
      const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/.exec(value);
      if (!match) return value.replace(/\./g, "[.]");
      return `${match[1].replace(/^http/i, "hxxp")}://${match[2].replace(/\./g, "[.]")}${match[3]}`;
    }
    case "domain":
    case "ip":
      return value.replace(/\./g, "[.]");
    case "email": {
      const at = value.lastIndexOf("@");
      return at < 0 ? value : `${value.slice(0, at)}[@]${value.slice(at + 1).replace(/\./g, "[.]")}`;
    }
    default:
      return value;
  }
}

/** Undoes the common defanging notations, so pasted indicators can be used again. */
export function refang(text: string): string {
  return text
    .replace(/\bhxxp(s?)\[?:\/\/\]?/gi, "http$1://")
    .replace(/\bhxxp(s?)/gi, "http$1")
    .replace(/\[:\/\/\]/g, "://")
    .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)/gi, ".")
    .replace(/\[@\]|\(@\)|\[at\]|\(at\)/gi, "@");
}
```

```ts file=src/lib/ioc/collect.ts
import type { AttachmentReport } from "../attachments/analyze.ts";
import { isFreeMail } from "../data/freemail.ts";
import type { ParsedEmail } from "../email.ts";
import type { HeaderReport } from "../headers/analyze.ts";
import { isClickable, type Link, type LinkOrigin } from "../links/analyze.ts";
import { parseAddressList } from "../mime/address.ts";
import { getHeaders } from "../mime/headers.ts";
import { normaliseHost } from "../net/domain.ts";
import { ipScope, isIp } from "../net/ip.ts";

export const IOC_TYPES = ["url", "domain", "ip", "email", "sha256", "sha1", "md5"] as const;
export type IocType = (typeof IOC_TYPES)[number];

export type Ioc = {
  type: IocType;
  value: string;
  /** Where it was seen: "From", "link in HTML body", "attachment x.pdf"… */
  sources: string[];
};

const ORIGIN_NOUN: Record<LinkOrigin, string> = {
  a: "link", area: "link", form: "form", "meta-refresh": "redirect", text: "link", img: "image", css: "image",
  link: "stylesheet", frame: "frame", media: "media", file: "link", qr: "QR code",
};

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Indicators worth searching for elsewhere: the sender's addresses and
 * infrastructure, every destination and remote resource (except mailing
 * services' trackers), attachment hashes, addresses written in the body.
 * Recipients, private addresses and free-mail domains are left out.
 */
export function collectIocs(input: { email: ParsedEmail; headers: HeaderReport; links: Link[]; attachments: AttachmentReport[] }): Ioc[] {
  const found = new Map<string, Ioc>();
  const add = (type: IocType, value: string, source: string) => {
    const key = `${type}:${value}`;
    const existing = found.get(key);
    if (!existing) found.set(key, { type, value, sources: [source] });
    else if (!existing.sources.includes(source)) existing.sources.push(source);
  };
  const addHost = (host: string, source: string) => {
    const h = normaliseHost(host.replace(/^\[|\]$/g, ""));
    if (isIp(h)) {
      if (ipScope(h) === "public") add("ip", h, source);
    } else if (h.includes(".") && !isFreeMail(h)) {
      add("domain", h, source);
    }
  };
  const addEmail = (address: string, source: string) => {
    const at = address.lastIndexOf("@");
    if (at <= 0) return;
    const domain = address.slice(at + 1).toLowerCase();
    add("email", `${address.slice(0, at)}@${domain}`, source);
    addHost(domain, source);
  };

  for (const row of input.headers.sender.rows) {
    if (row.header !== "Message-ID" && row.value.includes("@")) addEmail(row.value, row.header);
  }
  const origin = input.headers.hops.find((hop) => hop.ipScope === "public");
  if (origin) {
    for (const value of [origin.ip, origin.helo, origin.rdns]) if (value) addHost(value, "Received (origin)");
  }

  for (const link of input.links) {
    if (!isClickable(link) && link.tracking === "tracker") continue;
    const place = link.source === "html" ? "HTML body" : link.source === "text" ? "text body" : `attachment ${link.attachment}`;
    const source = `${ORIGIN_NOUN[link.origin]} in ${place}`;
    const { scheme, final, host } = link.url;
    if ((scheme === "http" || scheme === "https") && final) {
      add("url", final, source);
      if (host) addHost(host, source);
    } else if (scheme === "mailto" && final) {
      addEmail(decodeSafely(final.slice("mailto:".length).split("?")[0]), source);
    }
  }

  for (const attachment of input.attachments) {
    const source = `attachment ${attachment.visibleName}`;
    add("sha256", attachment.hashes.sha256, source);
    add("sha1", attachment.hashes.sha1, source);
    add("md5", attachment.hashes.md5, source);
  }

  const recipients = new Set(
    ["to", "cc", "delivered-to"]
      .flatMap((name) => getHeaders(input.email.headers, name))
      .flatMap(parseAddressList)
      .map((a) => a.address.toLowerCase()),
  );
  const bodyText = `${input.email.text ?? ""}\n${(input.email.html ?? "").replace(/<[^>]+>/g, " ")}`;
  for (const match of bodyText.matchAll(EMAIL_IN_TEXT)) {
    if (!recipients.has(match[0].toLowerCase())) addEmail(match[0], "body");
  }

  return [...found.values()].sort((a, b) => IOC_TYPES.indexOf(a.type) - IOC_TYPES.indexOf(b.type));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ioc
git commit -m "Collect IOCs with their provenance, and defang them

collectIocs gathers the sender's addresses and sending infrastructure,
every destination and remote resource except mailing-service trackers,
attachment hashes and addresses written in the body, de-duplicated and
each with where it was seen. Recipients, private addresses and free-mail
domains are left out. defang/refang handle the hxxp and [.] notations."
```

---

### Task 10: Pivots

**Files:**
- Create: `src/lib/pivots/pivots.ts`, `src/lib/pivots/pivots.test.ts`

**Interfaces:**
- Consumes: `Ioc`, `IocType` (Task 9), `bytesToBinary`.
- Produces: `PivotService = { id: string; name: string; types: IocType[]; template: string }`, `DEFAULT_PIVOTS: PivotService[]`, `pivotUrl(template: string, value: string): string`, `pivotsFor(ioc: Ioc, services: readonly PivotService[]): { id: string; name: string; url: string }[]`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/pivots/pivots.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PIVOTS, pivotUrl, pivotsFor } from "./pivots.ts";

test("fills templates with an encoded, raw or base64url value", () => {
  assert.equal(pivotUrl("https://x.example/?q={value}", "a b&c"), "https://x.example/?q=a%20b%26c");
  assert.equal(pivotUrl("https://x.example/{raw}", "a/b"), "https://x.example/a/b");
  assert.equal(
    pivotUrl("https://www.virustotal.com/gui/url/{base64url}", "https://evil.example/"),
    "https://www.virustotal.com/gui/url/aHR0cHM6Ly9ldmlsLmV4YW1wbGUv",
  );
});

test("offers the services that fit each indicator type", () => {
  const names = (type: "ip" | "domain" | "url" | "sha256" | "email", value: string) =>
    pivotsFor({ type, value, sources: [] }, DEFAULT_PIVOTS).map((p) => p.name);
  assert.deepEqual(names("ip", "185.234.72.19"), ["VirusTotal", "urlscan", "URLhaus", "WHOIS", "MXToolbox", "AbuseIPDB", "Talos", "Shodan"]);
  assert.deepEqual(names("domain", "mta-relay.click"), ["VirusTotal", "urlscan", "URLhaus", "WHOIS", "MXToolbox", "Talos"]);
  assert.deepEqual(names("url", "https://evil.example/"), ["VirusTotal", "URLhaus"]);
  assert.deepEqual(names("sha256", "ab"), ["VirusTotal"]);
  assert.deepEqual(names("email", "a@b.example"), []);
});

test("builds working URLs", () => {
  const [vt] = pivotsFor({ type: "ip", value: "185.234.72.19", sources: [] }, DEFAULT_PIVOTS);
  assert.equal(vt.url, "https://www.virustotal.com/gui/ip-address/185.234.72.19");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `pivots.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/pivots/pivots.ts
import type { Ioc, IocType } from "../ioc/collect.ts";
import { bytesToBinary } from "../mime/bytes.ts";

/**
 * A lookup service. `template` holds `{value}` (URL-encoded), `{raw}` (as
 * is) or `{base64url}` (VirusTotal's URL identifiers). Editable in settings
 * (milestone 4). Nothing is requested until the analyst clicks.
 */
export type PivotService = { id: string; name: string; types: IocType[]; template: string };

export const DEFAULT_PIVOTS: PivotService[] = [
  { id: "virustotal-file", name: "VirusTotal", types: ["sha256", "sha1", "md5"], template: "https://www.virustotal.com/gui/file/{value}" },
  { id: "virustotal-url", name: "VirusTotal", types: ["url"], template: "https://www.virustotal.com/gui/url/{base64url}" },
  { id: "virustotal-domain", name: "VirusTotal", types: ["domain"], template: "https://www.virustotal.com/gui/domain/{value}" },
  { id: "virustotal-ip", name: "VirusTotal", types: ["ip"], template: "https://www.virustotal.com/gui/ip-address/{value}" },
  { id: "urlscan-domain", name: "urlscan", types: ["domain"], template: "https://urlscan.io/domain/{value}" },
  { id: "urlscan-ip", name: "urlscan", types: ["ip"], template: "https://urlscan.io/ip/{value}" },
  { id: "urlhaus", name: "URLhaus", types: ["url", "domain", "ip"], template: "https://urlhaus.abuse.ch/browse.php?search={value}" },
  { id: "whois-domain", name: "WHOIS", types: ["domain"], template: "https://who.is/whois/{value}" },
  { id: "whois-ip", name: "WHOIS", types: ["ip"], template: "https://who.is/whois-ip/ip-address/{value}" },
  { id: "mxtoolbox-domain", name: "MXToolbox", types: ["domain"], template: "https://mxtoolbox.com/SuperTool.aspx?action=mx%3a{value}&run=toolpage" },
  { id: "mxtoolbox-ip", name: "MXToolbox", types: ["ip"], template: "https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a{value}&run=toolpage" },
  { id: "abuseipdb", name: "AbuseIPDB", types: ["ip"], template: "https://www.abuseipdb.com/check/{value}" },
  { id: "talos", name: "Talos", types: ["ip", "domain"], template: "https://talosintelligence.com/reputation_center/lookup?search={value}" },
  { id: "shodan", name: "Shodan", types: ["ip"], template: "https://www.shodan.io/host/{value}" },
];

function base64url(text: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pivotUrl(template: string, value: string): string {
  return template.replace(/\{(value|raw|base64url)\}/g, (_m, key: string) =>
    key === "raw" ? value : key === "base64url" ? base64url(value) : encodeURIComponent(value),
  );
}

export function pivotsFor(ioc: Ioc, services: readonly PivotService[]): { id: string; name: string; url: string }[] {
  return services
    .filter((service) => service.types.includes(ioc.type))
    .map((service) => ({ id: service.id, name: service.name, url: pivotUrl(service.template, ioc.value) }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pivots
git commit -m "Pivot from an indicator to lookup services

Each service is a URL template for the indicator types it accepts:
VirusTotal (files, URLs, domains, IPs), urlscan, URLhaus, WHOIS,
MXToolbox, AbuseIPDB, Talos and Shodan. Templates take the value
URL-encoded, raw, or as VirusTotal's base64url URL identifier. Building
a pivot URL fetches nothing."
```

---

### Task 11: Asynchronous whole-email analysis

**Files:**
- Modify: `src/lib/analyze.ts` (full replacement), `src/lib/analyze.test.ts` (full replacement)
- Create: `src/lib/ioc/collect.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces (changed): `EmailReport = { headers: HeaderReport; links: LinkReport; attachments: AttachmentReport[]; iocs: Ioc[]; findings: Finding[] }`, `AnalyzeOptions = { orgDomains: string[]; parseHtml: (html: string) => Document; decodeImage?: ImageDecoder }`, `analyzeEmail(email, options): Promise<EmailReport>`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/analyze.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { parseEmail, parseHeadersOnly } from "./mime/parse.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";
import { decodePng } from "./testing/png.ts";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
const decodeImage = async (data: Uint8Array) => decodePng(data);
const ids = async (name: string, orgDomains: string[] = []) =>
  (await analyzeEmail(parseEmail(read(name)), { orgDomains, parseHtml, decodeImage })).findings.map((f) => f.id);

test("merges header, link and attachment findings, most severe first", async () => {
  assert.deepEqual(await ids("spoofed-invoice.eml"), [
    "link.deceptive",
    "attachment.html-smuggling",
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "url.disguised-domain",
    "attachment.double-extension",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
    "html.tracking-pixel",
    "url.abused-tld",
  ]);
});

test("uses the organisation's domains for both header and link checks", async () => {
  const report = await analyzeEmail(parseEmail(read("spoofed-invoice.eml")), { orgDomains: ["rhone-energie.fr"], parseHtml });
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title ?? "", /your own domain/);
});

test("finds nothing on the clean newsletter", async () => {
  assert.deepEqual(await ids("clean-newsletter.eml"), []);
});

test("combines the lookalike's sender and link findings", async () => {
  assert.deepEqual((await ids("lookalike-paypal.eml")).sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "sender.brand-impersonation",
    "url.lookalike",
    "url.shortener",
  ]);
});

test("follows the QR code of the quishing email", async () => {
  assert.deepEqual(await ids("quishing-qr.eml"), [
    "url.disguised-domain",
    "sender.brand-impersonation",
    "attachment.qr-code",
    "url.abused-tld",
  ]);
});

test("reports the macro document and the reversed archive", async () => {
  assert.deepEqual(await ids("macro-docm.eml"), ["attachment.macros", "attachment.remote-template", "url.abused-tld"]);
  assert.deepEqual((await ids("rtlo-archive.eml")).sort(), ["attachment.archive-hides-program", "attachment.rtlo"]);
});

test("handles pasted headers, which have no body", async () => {
  const report = await analyzeEmail(parseHeadersOnly("From: a@b.com\nSubject: x"), { orgDomains: [], parseHtml });
  assert.deepEqual(report.links.links, []);
  assert.deepEqual(report.attachments, []);
});
```

```ts file=src/lib/ioc/collect.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";

const fixture = async (name: string) => {
  const email = parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
  return { email, report: await analyzeEmail(email, { orgDomains: [], parseHtml }) };
};

test("collects the spoofed invoice's indicators with their provenance", async () => {
  const { email, report } = await fixture("spoofed-invoice.eml");
  const of = (type: string) => report.iocs.filter((i) => i.type === type).map((i) => i.value);
  assert.deepEqual(of("url"), [
    "https://rhone-energie.fr.secure-login.click/auth?u=j.martin",
    "https://t.mta-relay.click/o/9f3a2c1e.gif",
    "https://espace-client.rhone-energie.fr/",
  ]);
  assert.deepEqual(of("domain"), [
    "rhone-energie.fr",
    "mta-relay.click",
    "mail.rhone-energie.fr",
    "rhone-energie.fr.secure-login.click",
    "t.mta-relay.click",
    "espace-client.rhone-energie.fr",
  ]);
  assert.deepEqual(of("ip"), ["185.234.72.19"]);
  assert.deepEqual(of("email"), ["facturation@rhone-energie.fr", "rhone.energie.paiement@outlook.fr", "bounce-7f3a@mta-relay.click"]);
  assert.deepEqual(of("sha256"), [createHash("sha256").update(email.attachments[0].data).digest("hex")]);
  assert.deepEqual(report.iocs.find((i) => i.type === "url")?.sources, ["link in HTML body"]);
  assert.deepEqual(report.iocs.find((i) => i.type === "ip")?.sources, ["Received (origin)"]);
});

test("leaves recipients and mailing-service trackers out", async () => {
  const { report } = await fixture("clean-newsletter.eml");
  const values = report.iocs.map((i) => i.value);
  assert.ok(!values.includes("claire.dupont@gmail.com"));
  assert.ok(!values.some((v) => v.includes("sendgrid.net")));
  assert.ok(values.includes("https://lettre.librairie-exemple.fr/selection-octobre"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `report.iocs` and `report.attachments` are undefined, and attachment findings are missing.

- [ ] **Step 3: Implement**

```ts file=src/lib/analyze.ts
import { analyzeAttachments, attachmentFindings, type AttachmentReport, type ImageDecoder } from "./attachments/analyze.ts";
import { BRANDS } from "./data/brands.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { collectIocs, type Ioc } from "./ioc/collect.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import type { Reference } from "./urls/lookalike.ts";

export type EmailReport = {
  headers: HeaderReport;
  links: LinkReport;
  attachments: AttachmentReport[];
  iocs: Ioc[];
  /** Every finding, most severe first. */
  findings: Finding[];
};

export type AnalyzeOptions = {
  orgDomains: string[];
  /** Builds an inert Document: the browser's DOMParser in the app, linkedom in tests. */
  parseHtml: (html: string) => Document;
  /** Decodes images for QR codes; without it, images are not scanned. */
  decodeImage?: ImageDecoder;
};

const BRAND_REFERENCES: Reference[] = BRANDS.flatMap((brand) => brand.domains.map((domain) => ({ domain, own: false })));

/** Asynchronous because hashing (WebCrypto) and image decoding are. */
export async function analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): Promise<EmailReport> {
  const headers = analyzeHeaders(email, { orgDomains: options.orgDomains });
  const attachments = await analyzeAttachments(email.attachments, { decodeImage: options.decodeImage });
  const references = [...options.orgDomains.map((domain) => ({ domain, own: true })), ...BRAND_REFERENCES];
  const links = analyzeLinks(
    email,
    email.html ? options.parseHtml(email.html) : null,
    { fromDomain: headers.sender.from?.domain ?? null, references },
    attachments.map((a) => ({ name: a.visibleName, html: a.html ? options.parseHtml(a.html) : null, urls: a.urls, qr: a.qr })),
  );
  return {
    headers,
    links,
    attachments,
    iocs: collectIocs({ email, headers, links: links.links, attachments }),
    findings: sortFindings([...headers.findings, ...links.findings, ...attachmentFindings(attachments)]),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyze.ts src/lib/analyze.test.ts src/lib/ioc
git commit -m "Bring attachments and IOCs into the whole-email report

analyzeEmail now analyses attachments, feeds the links found inside them
to the link analysis, collects IOCs, and merges every finding. It is
asynchronous because WebCrypto hashing and image decoding are; images are
only scanned for QR codes when the caller supplies a decoder."
```

---

### Task 12: Attachments and IOCs tabs

**Files:**
- Create: `src/components/CopyButton.tsx`, `src/components/AttachmentsTab.tsx`, `src/components/IocsTab.tsx`, `src/components/decodeImage.ts`
- Modify: `src/components/ui.ts` (small button), `src/components/LinksTab.tsx` (new origins, attachment name), `src/components/ReportView.tsx` (tabs), `src/app/page.tsx` (async analysis)

**Interfaces:**
- Consumes: `EmailReport` (Task 11), `AttachmentReport`, `AttachmentFlag` (Task 7), `Ioc`, `IOC_TYPES`, `defang` (Task 9), `DEFAULT_PIVOTS`, `pivotsFor` (Task 10), `Pixels` (Task 6).

- [ ] **Step 1: Shared pieces**

Append to `src/components/ui.ts`:

```ts
/** Compact secondary action: copy, pivot. */
export const SMALL_BUTTON =
  "inline-block border border-hairline px-1.5 text-xs leading-5 text-muted hover:border-rule hover:text-ink focus-visible:outline-2 focus-visible:outline-signal console:text-[11px] dossier:font-data";
```

```tsx file=src/components/CopyButton.tsx
"use client";

import { useState } from "react";
import { SMALL_BUTTON } from "./ui";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={SMALL_BUTTON}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard refused (permissions, insecure context): the value stays selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
```

```ts file=src/components/decodeImage.ts
import type { Pixels } from "@/lib/attachments/qr";

// QR codes stay readable well below this; larger images only cost memory.
const MAX_SIDE = 2000;

/**
 * Turns image bytes into pixels with the browser's own decoder, for QR
 * scanning. The bytes never leave the page: a Blob is not a request.
 */
export async function decodeImage(data: Uint8Array, contentType: string): Promise<Pixels | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data.slice()], { type: contentType }));
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { data: context.getImageData(0, 0, width, height).data, width, height };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Attachments tab**

```tsx file=src/components/AttachmentsTab.tsx
import { Fragment } from "react";
import type { AttachmentFlag, AttachmentReport } from "@/lib/attachments/analyze";
import { formatSize } from "@/lib/format";
import Breakable from "./Breakable";
import CopyButton from "./CopyButton";
import { DATA, FLAG, LABEL } from "./ui";

const FLAG_LABEL: Record<AttachmentFlag, string> = {
  program: "runs a program",
  script: "runs a script",
  shortcut: "shortcut",
  "disk-image": "disk image",
  "web-page": "opens as a web page",
  archive: "archive",
  "encrypted-archive": "password-protected",
  "archive-hides-program": "contains something that runs",
  "double-extension": "double extension",
  rtlo: "direction override in the name",
  "long-name": "padded name",
  "type-mismatch": "type does not match the name",
  macros: "macros",
  "remote-template": "remote template",
  "html-smuggling": "HTML smuggling",
  "pdf-active": "active PDF content",
  "qr-code": "QR code",
};

const HASHES = [
  ["sha256", "SHA-256"],
  ["sha1", "SHA-1"],
  ["md5", "MD5"],
] as const;

export default function AttachmentsTab({ attachments }: { attachments: AttachmentReport[] }) {
  if (attachments.length === 0) return <p className="text-muted">No attachments.</p>;
  return (
    <ol className="grid gap-8 console:gap-4">
      {attachments.map((report, i) => (
        <AttachmentItem key={i} n={i + 1} report={report} />
      ))}
    </ol>
  );
}

function AttachmentItem({ n, report }: { n: number; report: AttachmentReport }) {
  return (
    <li className="border-t-[3px] border-rule pt-3 console:border-t console:border-hairline console:pt-2 dossier:border-t">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-display text-3xl leading-none font-extrabold tabular-nums console:text-xs console:font-normal console:text-muted dossier:text-base dossier:font-semibold dossier:after:content-['.']">
          {n}
        </span>
        <h3 className={`${DATA} text-base font-semibold [overflow-wrap:anywhere] console:text-sm`}>
          <Breakable text={report.visibleName} />
        </h3>
        {report.inline && <span className={LABEL}>inline</span>}
      </div>

      {report.flags.length > 0 && (
        <ul className="mt-2 grid gap-0.5 text-sm console:text-xs">
          {report.flags.map((flag) => (
            <li key={flag}>
              <span className={`${FLAG} dossier:italic`}>{FLAG_LABEL[flag]}</span>
              {report.details[flag] && (
                <span className={`${DATA} text-muted [overflow-wrap:anywhere]`}> — {report.details[flag]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-1 text-sm console:grid-cols-[14ch_minmax(0,1fr)] console:gap-y-0 console:text-xs dossier:gap-y-0 dossier:*:border-b dossier:*:border-hairline dossier:*:py-1">
        <dt className={LABEL}>Declared</dt>
        <dd className={DATA}>{report.declaredType}</dd>
        <dt className={LABEL}>Detected</dt>
        <dd className={report.flags.includes("type-mismatch") ? FLAG : ""}>{report.detected.label}</dd>
        <dt className={LABEL}>Size</dt>
        <dd className="tabular-nums">{formatSize(report.size)}</dd>
        {HASHES.map(([key, label]) => (
          <Fragment key={key}>
            <dt className={LABEL}>{label}</dt>
            <dd className="flex items-baseline gap-3">
              <span className={`${DATA} break-all`}>{report.hashes[key]}</span>
              <CopyButton text={report.hashes[key]} />
            </dd>
          </Fragment>
        ))}
      </dl>

      {report.entries && (
        <details open className="mt-3">
          <summary className={`${LABEL} cursor-pointer`}>Archive contents · {report.entries.length}</summary>
          <ul className="mt-1">
            {report.entries.map((entry, i) => (
              <li key={i} className={`${DATA} ${entry.flagged ? FLAG : ""}`}>
                {entry.name} <span className="text-muted">{formatSize(entry.size)}</span>
                {entry.encrypted && <span className="text-muted"> · encrypted</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.urls.length + report.qr.length > 0 && (
        <p className="mt-2 text-sm text-muted console:text-xs">
          {report.urls.length + report.qr.length} address{report.urls.length + report.qr.length === 1 ? "" : "es"} found inside — see the Links
          tab.
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 3: IOCs tab**

```tsx file=src/components/IocsTab.tsx
"use client";

import { useState } from "react";
import { defang } from "@/lib/ioc/defang";
import { IOC_TYPES, type Ioc, type IocType } from "@/lib/ioc/collect";
import { DEFAULT_PIVOTS, pivotsFor } from "@/lib/pivots/pivots";
import Breakable from "./Breakable";
import CopyButton from "./CopyButton";
import { DATA, SECTION_TITLE, SMALL_BUTTON } from "./ui";

const TYPE_LABEL: Record<IocType, string> = {
  url: "URLs",
  domain: "Domains",
  ip: "IP addresses",
  email: "Email addresses",
  sha256: "SHA-256",
  sha1: "SHA-1",
  md5: "MD5",
};

export default function IocsTab({ iocs }: { iocs: Ioc[] }) {
  // Defanged by default: an IOC pasted in a ticket must not become a live link.
  const [defanged, setDefanged] = useState(true);
  if (iocs.length === 0) return <p className="text-muted">No indicators.</p>;
  const shown = (ioc: Ioc) => (defanged ? defang(ioc.type, ioc.value) : ioc.value);
  const groups = IOC_TYPES.map((type) => [type, iocs.filter((ioc) => ioc.type === type)] as const).filter(([, list]) => list.length > 0);

  return (
    <div className="grid gap-8 console:gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm console:text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={defanged} onChange={(e) => setDefanged(e.target.checked)} className="accent-signal" />
          Defanged
        </label>
        <CopyButton text={iocs.map(shown).join("\n")} label={`Copy all ${iocs.length}`} />
        <span className="text-muted">Pivot links open the service in a new tab, only when clicked.</span>
      </div>
      {groups.map(([type, list]) => (
        <section key={type} aria-labelledby={`ioc-${type}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id={`ioc-${type}`} className={SECTION_TITLE}>
              {TYPE_LABEL[type]} · {list.length}
            </h2>
            <CopyButton text={list.map(shown).join("\n")} label="Copy" />
          </div>
          <ul className="border-t border-rule console:border-t-0 dossier:border-t-0">
            {list.map((ioc) => (
              <IocRow key={ioc.value} ioc={ioc} shown={shown(ioc)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IocRow({ ioc, shown }: { ioc: Ioc; shown: string }) {
  const pivots = pivotsFor(ioc, DEFAULT_PIVOTS);
  return (
    <li className="grid gap-x-6 gap-y-1 border-b border-hairline py-2 lg:grid-cols-[minmax(0,1fr)_auto] console:border-b-0 console:py-0.5 dossier:border-dotted">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className={`${DATA} [overflow-wrap:anywhere]`}>
            <Breakable text={shown} />
          </span>
          <CopyButton text={shown} />
        </p>
        <p className="text-xs text-muted">{ioc.sources.join(" · ")}</p>
      </div>
      {pivots.length > 0 && (
        <div className="flex flex-wrap content-start gap-1.5 lg:justify-end">
          {pivots.map((pivot) => (
            <a key={pivot.id} href={pivot.url} target="_blank" rel="noopener noreferrer" className={SMALL_BUTTON}>
              {pivot.name}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Links tab, report view, page**

In `src/components/LinksTab.tsx`:
- add two entries to `ORIGIN_LABEL`: `file: "in file",` and `qr: "QR code",`
- right after the `{link.text && …}` paragraph in `LinkRow`, add:

```tsx
        {link.attachment && <p className="text-xs text-muted">in attachment {link.attachment}</p>}
```

In `src/components/ReportView.tsx`:
- add `import AttachmentsTab from "./AttachmentsTab";` and `import IocsTab from "./IocsTab";`
- replace `type TabId = "headers" | "links" | "preview" | "raw";` with `type TabId = "headers" | "links" | "attachments" | "iocs" | "preview" | "raw";`
- replace the `tabs={[ … ]}` array with:

```tsx
        tabs={[
          { id: "headers", label: "Headers" },
          { id: "links", label: "Links", count: report.links.links.filter(isClickable).length },
          { id: "attachments", label: "Attachments", count: report.attachments.length },
          { id: "iocs", label: "IOCs", count: report.iocs.length },
          { id: "preview", label: "Safe preview" },
          { id: "raw", label: "Raw source" },
        ]}
```

- after `{tab === "links" && <LinksTab links={report.links.links} />}` add:

```tsx
        {tab === "attachments" && <AttachmentsTab attachments={report.attachments} />}
        {tab === "iocs" && <IocsTab iocs={report.iocs} />}
```

In `src/app/page.tsx`:
- add `import { decodeImage } from "@/components/decodeImage";`
- make `analyse` asynchronous: replace

```ts
  const analyse = useCallback((parse: () => ParsedEmail, name: string, size: number) => {
```

with

```ts
  const analyse = useCallback(async (parse: () => ParsedEmail, name: string, size: number) => {
```

  and replace

```ts
      const report = analyzeEmail(email, { orgDomains: [], parseHtml });
```

  with

```ts
      const report = await analyzeEmail(email, { orgDomains: [], parseHtml, decodeImage });
```

- in `openFile`, replace `analyse(() => parseEmail(bytes), file.name, bytes.length);` with `await analyse(() => parseEmail(bytes), file.name, bytes.length);`
- in the `EntryPanel` props, replace `onHeaders={(text) => analyse(` with `onHeaders={(text) => void analyse(`

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. If the build cannot resolve Node's `fs` for `cfb` in the browser bundle, alias it to an empty module for the client in `next.config.ts` (`turbopack.resolveAlias: { fs: { browser: "./src/empty.ts" } }` with `src/empty.ts` exporting nothing) and note it in the commit.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Add the Attachments and IOCs tabs

Attachments shows each file's flags with what triggered them, declared
and detected type, size, copyable hashes and archive contents; names
with hidden characters are spelled out. IOCs lists every indicator by
type with where it was seen, copyable one by one, by type or all at
once, defanged by default, with pivot links that open a lookup service
in a new tab only when clicked.

Analysis is now asynchronous in the page; images are decoded for QR
codes by the browser's own decoder, from bytes already in memory."
```

---

### Task 13: Smoke test on six fixtures

**Files:**
- Modify: `fixtures/smoke.json`

- [ ] **Step 1: Expectations**

```json file=fixtures/smoke.json
[
  {
    "file": "spoofed-invoice.eml",
    "expect": [
      "Link text shows another destination",
      "HTML smuggling",
      "DMARC failed for rhone-energie.fr",
      "Microsoft 365 classified it as phishing",
      "Replies go to a different domain",
      "rhone-energie.fr.secure-login.click",
      "CAT: PHSH"
    ]
  },
  {
    "file": "clean-newsletter.eml",
    "expect": ["Nos coups de cœur d'octobre", "No finding", "mx.google.com"]
  },
  {
    "file": "lookalike-paypal.eml",
    "expect": [
      "Password form inside the email",
      "Lookalike domain",
      "pаypal.com (xn--pypal-4ve.com) imitates paypal.com",
      "Display name invokes PayPal"
    ]
  },
  {
    "file": "quishing-qr.eml",
    "expect": ["QR code in an image", "login-micros0ft365.com.verify-mfa.top", "Display name invokes Microsoft"]
  },
  {
    "file": "macro-docm.eml",
    "expect": ["Office document with macros", "Office document loads a remote template", "cdn-office365.top"]
  },
  {
    "file": "rtlo-archive.eml",
    "expect": ["File name uses a direction override", "Archive hides a program", "Commande_4471.pdf.exe"]
  }
]
```

- [ ] **Step 2: Run**

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed: 3 themes × 6 fixtures.` — the quishing fixture proves the browser path (createImageBitmap → OffscreenCanvas → jsqr) and that decoding an image makes no request. Review `.smoke/*-attachments.png` and `.smoke/*-iocs.png` in each theme.

- [ ] **Step 3: Commit**

```bash
git add fixtures/smoke.json
git commit -m "Smoke-test the attachment fixtures

The quishing, macro and reversed-archive fixtures join the smoke test,
which now also covers the Attachments and IOCs tabs and the browser's own
image decoding for QR codes, still with no request leaving the page."
```

---

## Milestone 3 exit criteria

- `npm test`, `npm run lint`, `npm run build`, `npm run smoke` all pass.
- Six fixtures: spoofed invoice 10 findings; clean newsletter none; PayPal lookalike 6; quishing 4; macro document 3; reversed archive 2.
- Every IOC copies defanged by default; pivot links fetch nothing until clicked.
