import assert from "node:assert/strict";
import { test } from "node:test";
import { compressRtf } from "../testing/rtf.ts";
import { decompressRtf, htmlFromRtf, rtfOrigin } from "./rtf.ts";

const hex = (s: string) => new Uint8Array(s.trim().split(/\s+/).map((b) => parseInt(b, 16)));
const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

// The two worked examples of [MS-OXRTFCP] section 3.
test("decompresses the specification's first example", () => {
  const { data, crcOk } = decompressRtf(hex(`
    2d 00 00 00 2b 00 00 00 4c 5a 46 75 f1 c5 c7 a7 03 00 0a 00 72 63 70 67 31 32 35 42 32 0a f3 20 68 65 6c
    09 00 20 62 77 05 b0 6c 64 7d 0a 80 0f a0`));
  assert.equal(latin1(data), "{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n");
  assert.equal(crcOk, true);
});

test("decompresses a reference that overlaps the bytes it is writing", () => {
  const { data, crcOk } = decompressRtf(hex(`
    1a 00 00 00 1c 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0`));
  assert.equal(latin1(data), "{\\rtf1 WXYZWXYZWXYZWXYZWXYZ}");
  assert.equal(crcOk, true);
});

test("reports a damaged checksum but still decompresses", () => {
  const bytes = hex(`
    1a 00 00 00 1c 00 00 00 4c 5a 46 75 e2 d4 4b 51 41 00 04 20 57 58 59 5a 0d 6e 7d 01 0e b0`);
  bytes[12] ^= 0xff;
  const { data, crcOk } = decompressRtf(bytes);
  assert.equal(latin1(data), "{\\rtf1 WXYZWXYZWXYZWXYZWXYZ}");
  assert.equal(crcOk, false);
});

test("returns stored data as is", () => {
  const body = new TextEncoder().encode("{\\rtf1 plain}");
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  view.setUint32(0, body.length + 12, true);
  view.setUint32(4, body.length, true);
  view.setUint32(8, 0x414c454d, true); // "MELA": uncompressed
  const { data } = decompressRtf(new Uint8Array([...header, ...body]));
  assert.equal(latin1(data), "{\\rtf1 plain}");
});

test("rejects data that is not compressed RTF", () => {
  assert.throws(() => decompressRtf(new Uint8Array(8)), /too short/);
  assert.throws(() => decompressRtf(new Uint8Array(32)), /not compressed RTF/);
});

// An encapsulated HTML body as Exchange writes it ([MS-OXRTFEX]): HTML tags
// in \htmltag groups, text between them, RTF-only parts behind \htmlrtf.
const ENCAPSULATED = [
  "{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 \\fbidis \\deff0{\\fonttbl{\\f0\\fswiss Arial;}{\\f1\\fmodern Courier New;}}",
  "{\\colortbl\\red0\\green0\\blue255;}",
  "\\uc1\\pard\\plain\\deftab360 \\f0\\fs24 ",
  "{\\*\\htmltag19 <html>}{\\*\\htmltag34 <head>}{\\*\\htmltag241 <style>p \\{margin:0\\}</style>}{\\*\\htmltag41 </head>}",
  "{\\*\\htmltag50 <body lang=FR>}\\htmlrtf {\\htmlrtf0 ",
  "{\\*\\htmltag64 <p>}\\htmlrtf {\\htmlrtf0 Bonjour, voici l\\rquote \\'e9t\\'e9 \\u8364?\\htmlrtf \\par\\htmlrtf0 ",
  "{\\*\\mhtmltag84 <a href=\"cid:ignored\">}",
  "{\\*\\htmltag84 <a href=\"https://login.example-evil.top/x?a=1&amp;b=2\">}\\htmlrtf {\\field{\\*\\fldinst{HYPERLINK \"https://login.example-evil.top/x\"}}{\\fldrslt\\cf0\\ul \\htmlrtf0 Votre facture\\htmlrtf }}\\htmlrtf0 ",
  "{\\*\\htmltag92 </a>}",
  "\\htmlrtf }\\htmlrtf0 {\\*\\htmltag72 </p>}",
  "\\htmlrtf }\\htmlrtf0 {\\*\\htmltag58 </body>}{\\*\\htmltag27 </html>}}",
].join("\r\n");

test("rebuilds the HTML an RTF body was converted from", () => {
  assert.equal(rtfOrigin(ENCAPSULATED), "html");
  assert.equal(
    htmlFromRtf(ENCAPSULATED),
    "<html><head><style>p {margin:0}</style></head><body lang=FR><p>Bonjour, voici l’été €" +
      '<a href="https://login.example-evil.top/x?a=1&amp;b=2">Votre facture</a></p></body></html>',
  );
});

test("keeps line breaks and escaped characters inside HTML tags", () => {
  const rtf = "{\\rtf1\\ansi\\fromhtml1 {\\*\\htmltag0 <p title=\"a\\{b\\}c\\\\d\">}x\\par y{\\*\\htmltag0 </p>}}";
  assert.equal(htmlFromRtf(rtf), '<p title="a{b}c\\d">x\r\ny</p>');
});

test("decodes characters in the document's code page", () => {
  const rtf = "{\\rtf1\\ansi\\ansicpg1251\\fromhtml1 {\\*\\htmltag0 <p>}\\'cf\\'f0\\'e8\\'e2\\'e5\\'f2{\\*\\htmltag0 </p>}}";
  assert.equal(htmlFromRtf(rtf), "<p>Привет</p>");
});

test("skips the fallback characters after a Unicode escape, and binary data", () => {
  const rtf = "{\\rtf1\\ansi\\fromhtml1 {\\*\\htmltag0 <p>}\\uc2 \\u20013\\'d6\\'d0a\\bin3 xyzb{\\*\\htmltag0 </p>}}";
  assert.equal(htmlFromRtf(rtf), "<p>中ab</p>");
});

test("tells apart HTML, plain text and native RTF bodies", () => {
  assert.equal(rtfOrigin("{\\rtf1\\ansi\\fromtext \\deff0 hello}"), "text");
  assert.equal(rtfOrigin("{\\rtf1\\ansi\\deff0 {\\field{\\*\\fldinst HYPERLINK x}}}"), "rtf");
  assert.equal(htmlFromRtf("{\\rtf1\\ansi\\fromtext \\deff0 hello}"), null);
});

test("reads back what the test compressor writes", () => {
  for (const text of ["", "{\\rtf1}", ENCAPSULATED]) {
    const { data, crcOk } = decompressRtf(compressRtf(text));
    assert.equal(latin1(data), text);
    assert.equal(crcOk, true);
  }
});
