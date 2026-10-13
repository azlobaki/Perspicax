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
