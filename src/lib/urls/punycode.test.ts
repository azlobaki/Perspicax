import assert from "node:assert/strict";
import { test } from "node:test";
import { domainToUnicode } from "node:url";
import { decodePunycode, hostToUnicode } from "./punycode.ts";

test("decodes hosts exactly like Node's IDNA implementation", () => {
  for (const host of ["xn--pypal-4ve.com", "xn--mnchen-3ya.de", "xn--80ak6aa92e.com", "mail.xn--bcher-kva.example", "example.com"]) {
    assert.equal(hostToUnicode(host), domainToUnicode(host), host);
  }
});

test("keeps labels that are not valid Punycode", () => {
  assert.equal(decodePunycode("!!"), null);
  assert.equal(hostToUnicode("xn--!!.com"), "xn--!!.com");
});
