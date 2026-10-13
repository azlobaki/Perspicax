import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeText } from "./charset.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const LATIN1_CAFE = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);

test("decodes the declared charset", () => {
  assert.equal(decodeText(LATIN1_CAFE, "ISO-8859-1"), "café");
  assert.equal(decodeText(Uint8Array.from([0x80]), "windows-1252"), "€");
  assert.equal(decodeText(utf8("été"), "UTF-8"), "été");
});

test("falls back to windows-1252 when bytes labelled UTF-8 are not UTF-8", () => {
  assert.equal(decodeText(LATIN1_CAFE, "utf-8"), "café");
});

test("tries UTF-8 first for unknown, missing or ASCII labels", () => {
  assert.equal(decodeText(utf8("crème"), "x-made-up"), "crème");
  assert.equal(decodeText(utf8("crème"), null), "crème");
  assert.equal(decodeText(utf8("crème"), "us-ascii"), "crème");
});

test("accepts quoted labels", () => {
  assert.equal(decodeText(utf8("ok"), '"utf-8"'), "ok");
});
