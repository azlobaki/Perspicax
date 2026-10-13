import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEncodedWords } from "./encoded-words.ts";

test("decodes B and Q encoded words", () => {
  assert.equal(
    decodeEncodedWords("=?utf-8?B?UmFwcGVsIDogdm90cmUgZmFjdHVyZSBSRS0yMDI2LTQ0NzEgcmVzdGUgaW1wYXnDqWU=?="),
    "Rappel : votre facture RE-2026-4471 reste impayée",
  );
  assert.equal(decodeEncodedWords("=?iso-8859-1?Q?Caf=E9_cr=E8me?="), "Café crème");
});

test("joins a multi-byte character split across adjacent words", () => {
  assert.equal(decodeEncodedWords("=?utf-8?B?ww==?= =?utf-8?B?qQ==?="), "é");
});

test("keeps plain text and its spacing around encoded words", () => {
  assert.equal(decodeEncodedWords("Re: =?utf-8?Q?caf=C3=A9?= ok"), "Re: café ok");
  assert.equal(decodeEncodedWords("no words here"), "no words here");
});

test("drops whitespace between adjacent words in different charsets", () => {
  assert.equal(decodeEncodedWords("=?utf-8?Q?a?= =?iso-8859-1?Q?=E9?="), "aé");
});

test("ignores the RFC 2231 language suffix", () => {
  assert.equal(decodeEncodedWords("=?utf-8*fr?Q?=C3=A9t=C3=A9?="), "été");
});

test("leaves malformed words untouched", () => {
  assert.equal(decodeEncodedWords("=?utf-8?X?abc?="), "=?utf-8?X?abc?=");
});
