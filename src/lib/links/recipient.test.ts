import assert from "node:assert/strict";
import { test } from "node:test";
import { findRecipients, recipientAddresses, redactRecipients } from "./recipient.ts";

const ME = ["claire.dupont@rhone-energie.fr"];
const b64 = (s: string) => Buffer.from(s).toString("base64");
const b64url = (s: string) => Buffer.from(s).toString("base64url");

test("reads the recipients from To, Cc and Delivered-To", () => {
  const headers = [
    { name: "To", value: '"Claire Dupont" <Claire.Dupont@rhone-energie.fr>' },
    { name: "Cc", value: "compta@rhone-energie.fr" },
    { name: "Delivered-To", value: "claire.dupont@rhone-energie.fr" },
    { name: "From", value: "boss@evil.top" },
  ];
  assert.deepEqual(recipientAddresses(headers), ["claire.dupont@rhone-energie.fr", "compta@rhone-energie.fr"]);
});

test("finds the address written plainly or URL-encoded, in any case", () => {
  assert.deepEqual(
    findRecipients("https://evil.top/login?email=Claire.Dupont@rhone-energie.fr", ME).map((m) => m.encoding),
    ["plain"],
  );
  assert.deepEqual(
    findRecipients("https://evil.top/login?u=claire.dupont%40rhone-energie.fr", ME).map((m) => m.encoding),
    ["plain"],
  );
});

test("finds the address in base64, at any alignment, standard or URL-safe", () => {
  for (const prefix of ["", "x", "id=", "user=1&e="]) {
    const encoded = b64(`${prefix}claire.dupont@rhone-energie.fr&t=9`);
    assert.deepEqual(findRecipients(`https://evil.top/#${encoded}`, ME).map((m) => m.encoding), ["base64"], prefix);
  }
  const safe = b64url("??>claire.dupont@rhone-energie.fr");
  assert.deepEqual(findRecipients(`https://evil.top/$${safe}`, ME).map((m) => m.encoding), ["base64"]);
});

test("ignores links without the recipient's address", () => {
  assert.deepEqual(findRecipients("https://evil.top/auth?u=claire.dupont", ME), []);
  assert.deepEqual(findRecipients("https://evil.top/", []), []);
});

test("replaces the address with a placeholder, keeping the rest of the link", () => {
  assert.equal(
    redactRecipients("https://evil.top/login?email=claire.dupont%40rhone-energie.fr&lang=fr", ME),
    "https://evil.top/login?email=REDACTED&lang=fr",
  );
  const redacted = redactRecipients(`https://evil.top/#${b64("claire.dupont@rhone-energie.fr")}`, ME);
  assert.match(redacted, /^https:\/\/evil\.top\/#.{0,2}REDACTED.{0,4}$/);
  assert.deepEqual(findRecipients(redacted, ME), []);
  assert.equal(redactRecipients("https://evil.top/a", ME), "https://evil.top/a");
});
