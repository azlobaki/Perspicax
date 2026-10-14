import assert from "node:assert/strict";
import { test } from "node:test";
import type { Text } from "../i18n/text.ts";
import { bytesToBinary } from "./bytes.ts";
import { getHeader, getHeaders, parseHeaderBlock, splitHeaderBody } from "./headers.ts";

const bin = (s: string) => bytesToBinary(new TextEncoder().encode(s));

test("splits headers from body on the first empty line, CRLF or LF", () => {
  assert.deepEqual(splitHeaderBody("A: 1\r\nB: 2\r\n\r\nbody\r\n\r\nmore"), {
    header: "A: 1\r\nB: 2",
    body: "body\r\n\r\nmore",
  });
  assert.deepEqual(splitHeaderBody("A: 1\n\nbody"), { header: "A: 1", body: "body" });
  assert.deepEqual(splitHeaderBody("A: 1"), { header: "A: 1", body: "" });
  assert.deepEqual(splitHeaderBody("\r\nbody"), { header: "", body: "body" });
});

test("unfolds continuation lines and keeps header order", () => {
  const fields = parseHeaderBlock(
    bin("Received: from a\r\n by b;\r\n\tTue, 13 Oct 2026 07:14:02 +0000\r\nSubject: hi\r\nReceived: from c by d"),
  );
  assert.deepEqual(fields.map((f) => f.name), ["Received", "Subject", "Received"]);
  assert.equal(fields[0].value, "from a by b;\tTue, 13 Oct 2026 07:14:02 +0000");
  assert.deepEqual(getHeaders(fields, "received"), [fields[0].value, "from c by d"]);
  assert.equal(getHeader(fields, "SUBJECT"), "hi");
  assert.equal(getHeader(fields, "x-missing"), null);
});

test("reads raw UTF-8 header bytes (RFC 6532) and falls back to windows-1252", () => {
  assert.equal(getHeader(parseHeaderBlock(bin("Subject: Résumé")), "subject"), "Résumé");
  const legacy = "Subject: caf" + String.fromCharCode(0xe9);
  assert.equal(getHeader(parseHeaderBlock(legacy), "subject"), "café");
});

test("skips lines that are not headers and reports them", () => {
  const warnings: Text[] = [];
  const fields = parseHeaderBlock(bin("From someone@example.com Tue Oct 13 07:14:02 2026\nSubject: ok"), warnings);
  assert.deepEqual(fields, [{ name: "Subject", value: "ok" }]);
  assert.equal(warnings.length, 1);
});

test("tolerates whitespace before the colon", () => {
  assert.equal(getHeader(parseHeaderBlock(bin("Subject : hi")), "subject"), "hi");
});
