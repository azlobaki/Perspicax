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
