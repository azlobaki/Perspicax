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
