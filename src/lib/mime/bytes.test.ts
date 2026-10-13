import assert from "node:assert/strict";
import { test } from "node:test";
import { binaryToBytes, bytesToBinary, decodeBase64, decodeQuotedPrintable } from "./bytes.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test("binary strings round-trip every byte value", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(binaryToBytes(bytesToBinary(all)), all);
});

test("binary strings handle inputs larger than one chunk", () => {
  const big = new Uint8Array(100_000).fill(0xe9);
  const binary = bytesToBinary(big);
  assert.equal(binary.length, 100_000);
  assert.equal(binary.charCodeAt(99_999), 0xe9);
});

test("decodes base64 across line breaks and without padding", () => {
  assert.equal(text(decodeBase64("SGVs\r\nbG8=")), "Hello");
  assert.equal(text(decodeBase64("SGVsbG8")), "Hello");
});

test("realigns after padding in concatenated base64 blocks", () => {
  assert.equal(text(decodeBase64("SGk=SGk=")), "HiHi");
});

test("skips characters outside the base64 alphabet", () => {
  assert.equal(text(decodeBase64("SG Vs*bG8=")), "Hello");
});

test("decodes quoted-printable escapes and soft line breaks", () => {
  assert.equal(text(decodeQuotedPrintable("caf=C3=A9")), "café");
  assert.equal(text(decodeQuotedPrintable("abc=\r\ndef")), "abcdef");
  assert.equal(text(decodeQuotedPrintable("abc=  \ndef")), "abcdef");
});

test("keeps malformed quoted-printable escapes literally", () => {
  assert.equal(text(decodeQuotedPrintable("100=ZZ =")), "100=ZZ ");
});
