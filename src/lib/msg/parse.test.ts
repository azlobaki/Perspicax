import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as CFB from "cfb";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { parseMsg } from "./parse.ts";

const utf16 = (text: string) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[2 * i] = text.charCodeAt(i) & 0xff;
    out[2 * i + 1] = text.charCodeAt(i) >> 8;
  }
  return out;
};

function build(streams: Record<string, Uint8Array>): Uint8Array {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "/__properties_version1.0", new Uint8Array(32));
  for (const [path, data] of Object.entries(streams)) CFB.utils.cfb_add(container, path, data);
  return new Uint8Array(CFB.write(container, { type: "buffer" }));
}

test("reads the DocuSign .msg fixture into a ParsedEmail", () => {
  const email = parseMsg(readFileSync(new URL("../../../fixtures/docusign.msg", import.meta.url)));
  assert.equal(email.source, "msg");
  assert.equal(decodeEncodedWords(getHeader(email.headers, "subject") ?? ""), "Contrat 4471 : document en attente de signature");
  assert.equal(getHeader(email.headers, "from"), "DocuSign <dse@envelope-notice.xyz>");
  assert.equal(email.headers.filter((h) => h.name === "Received").length, 2);
  assert.match(email.text ?? "", /Vous avez reçu un document/);
  assert.match(email.html ?? "", /<a href="https:\/\/docusign\.net\.review-envelope\.xyz\/e\/4471">/);
  assert.deepEqual(
    email.attachments.map((a) => [a.filename, a.contentType, new TextDecoder().decode(a.data.subarray(0, 5))]),
    [["Contrat_4471.pdf", "application/pdf", "%PDF-"]],
  );
  assert.equal(email.rawBody, null);
  assert.deepEqual(email.warnings, []);
  assert.match(email.raw, /^Received: from AM9PR04MB8456/);
});

test("rebuilds basic headers when there are no transport headers", () => {
  const email = parseMsg(build({
    "/__substg1.0_0037001F": utf16("Brouillon"),
    "/__substg1.0_0C1A001F": utf16("Claire Dupont"),
    "/__substg1.0_0C1F001F": utf16("claire@example.com"),
    "/__substg1.0_0E04001F": utf16("Jean Martin"),
    "/__substg1.0_1000001F": utf16("Texte"),
  }));
  assert.deepEqual(email.headers, [
    { name: "From", value: "Claire Dupont <claire@example.com>" },
    { name: "To", value: "Jean Martin" },
    { name: "Subject", value: "Brouillon" },
  ]);
  assert.match(email.warnings.join(" "), /No transport headers/);
});

test("says what it cannot read", () => {
  const email = parseMsg(build({
    "/__substg1.0_007D001F": utf16("Subject: x\r\n\r\n"),
    "/__substg1.0_10090102": new Uint8Array(16),
    "/__attach_version1.0_#00000000/__substg1.0_3707001F": utf16("forwarded.msg"),
    "/__attach_version1.0_#00000000/__substg1.0_3701000D/__properties_version1.0": new Uint8Array(32),
  }));
  assert.equal(email.html, null);
  assert.match(email.warnings.join(" "), /compressed RTF/);
  assert.match(email.warnings.join(" "), /forwarded\.msg/);
  assert.deepEqual(email.attachments, []);
});

test("refuses files that are not Outlook messages", () => {
  assert.throws(() => parseMsg(new TextEncoder().encode("From: x\n\nnot a msg")), /not an Outlook \.msg/);
});
