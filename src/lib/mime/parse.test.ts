import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeEncodedWords } from "./encoded-words.ts";
import { getHeader } from "./headers.ts";
import { parseEmail, parseHeadersOnly } from "./parse.ts";

const eml = (source: string) => parseEmail(new TextEncoder().encode(source));
const fixture = (name: string) =>
  parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));

const NESTED = [
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "preamble",
  "--mix",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  "Content-Type: text/plain",
  "",
  "plain body",
  "--alt",
  "Content-Type: text/html",
  "",
  "<p>html body</p>",
  "--alt--",
  "",
  "--mix",
  'Content-Type: application/pdf; name="a.pdf"',
  "Content-Disposition: attachment",
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0=",
  "--mix--",
  "epilogue",
];

test("parses a single-part message with quoted-printable text", () => {
  const email = eml(
    "Subject: hi\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nCaf=C3=A9 cr=C3=A8me=\r\n ok\r\n",
  );
  assert.equal(email.source, "eml");
  assert.equal(email.text, "Café crème ok\r\n");
  assert.equal(email.html, null);
  assert.deepEqual(email.attachments, []);
});

test("defaults to text/plain when Content-Type is missing", () => {
  assert.equal(eml("Subject: x\n\nhello").text, "hello");
});

test("walks nested multiparts: alternative bodies plus an attachment", () => {
  for (const eol of ["\r\n", "\n"]) {
    const email = eml(NESTED.join(eol));
    assert.equal(email.text, "plain body");
    assert.equal(email.html, "<p>html body</p>");
    assert.equal(email.attachments.length, 1);
    assert.equal(email.attachments[0].filename, "a.pdf");
    assert.equal(email.attachments[0].contentType, "application/pdf");
    assert.equal(email.attachments[0].inline, false);
    assert.equal(new TextDecoder().decode(email.attachments[0].data), "%PDF-");
    assert.deepEqual(email.warnings, []);
  }
});

test("tolerates a missing closing boundary", () => {
  const email = eml(
    ['Content-Type: multipart/mixed; boundary="b"', "", "--b", "Content-Type: text/plain", "", "body", "--b",
      'Content-Type: text/plain; name="note.txt"', "", "trailing"].join("\n"),
  );
  assert.equal(email.text, "body");
  assert.equal(email.attachments[0].filename, "note.txt");
  assert.match(email.warnings.join(" "), /closing boundary/);
});

test("names unnamed extra parts instead of dropping them", () => {
  const email = eml(
    ['Content-Type: multipart/mixed; boundary="b"', "", "--b", "Content-Type: text/plain", "", "one", "--b",
      "Content-Type: text/plain", "", "two", "--b--"].join("\n"),
  );
  assert.equal(email.text, "one");
  assert.equal(email.attachments[0].filename, "part-1.txt");
});

test("survives absurd multipart nesting", () => {
  let body = "Content-Type: text/plain\n\ncore";
  for (let i = 0; i < 40; i++) {
    body = `Content-Type: multipart/mixed; boundary="b${i}"\n\n--b${i}\n${body}\n--b${i}--`;
  }
  assert.match(eml(body).warnings.join(" "), /too deep/);
});

test("reads the spoofed-invoice fixture", () => {
  const email = fixture("spoofed-invoice.eml");
  assert.equal(
    decodeEncodedWords(getHeader(email.headers, "subject") ?? ""),
    "Rappel : votre facture RE-2026-4471 reste impayée",
  );
  assert.match(email.text ?? "", /1 284,60 € reste impayée/);
  assert.match(email.html ?? "", /safelinks\.protection\.outlook\.com/);
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, "Facture_RE-4471.pdf.html");
  assert.match(new TextDecoder().decode(email.attachments[0].data), /msSaveOrOpenBlob/);
  assert.deepEqual(email.warnings, []);
});

test("reads the clean-newsletter fixture", () => {
  const email = fixture("clean-newsletter.eml");
  assert.equal(decodeEncodedWords(getHeader(email.headers, "subject") ?? ""), "Nos coups de cœur d'octobre");
  assert.match(email.text ?? "", /cœur du mois/);
  assert.match(email.html ?? "", /Voir la sélection/);
});

test("pasted headers: everything up to the first blank line, leading blank lines ignored", () => {
  const email = parseHeadersOnly("\n\nReceived: from a by b; Tue, 13 Oct 2026 07:14:02 +0000\nSubject: x\n\nnot a header");
  assert.equal(email.source, "headers");
  assert.deepEqual(email.headers.map((h) => h.name), ["Received", "Subject"]);
  assert.equal(email.text, null);
});
