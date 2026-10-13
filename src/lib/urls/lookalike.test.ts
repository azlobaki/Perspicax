import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import { editDistance, isHomoglyph, lookalikeOf, skeleton, type Reference } from "./lookalike.ts";

const brands: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const own: Reference[] = [{ domain: "rhone-energie.fr", own: true }];

test("reduces look-alike spellings to one skeleton", () => {
  assert.equal(skeleton("paypa1"), skeleton("paypal"));
  assert.equal(skeleton("pаypal"), skeleton("paypal"));
  assert.equal(skeleton("rnicrosoft"), skeleton("microsoft"));
  assert.notEqual(skeleton("paypal"), skeleton("paypa"));
});

test("detects mixed-script and whole-script homoglyph labels", () => {
  assert.ok(isHomoglyph("pаypal.com"));
  assert.ok(isHomoglyph("аррӏе.com"));
  assert.ok(!isHomoglyph("münchen.de"));
  assert.ok(!isHomoglyph("почта.рф"));
  assert.ok(!isHomoglyph("example.com"));
});

test("measures edit distance with transpositions", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("ab", "ba"), 1);
  assert.equal(editDistance("same", "same"), 0);
});

test("finds the brand a domain imitates", () => {
  assert.equal(lookalikeOf("paypa1.com", brands), "paypal.com");
  assert.equal(lookalikeOf("pаypal.com", brands), "paypal.com");
  assert.equal(lookalikeOf("rnicrosoft.com", brands), "microsoft.com");
});

test("leaves brands, their other TLDs and unrelated domains alone", () => {
  for (const host of ["paypal.com", "www.paypal.com", "paypal.fr", "outlook.fr", "googleusercontent.com", "secure-login.click", "amazonaws.com"]) {
    assert.equal(lookalikeOf(host, brands), null, host);
  }
});

test("is stricter about the organisation's own domains", () => {
  assert.equal(lookalikeOf("rhone-energie.com", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhoneenergie.fr", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhone-energie-paiement.com", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhone-energle.fr", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("espace-client.rhone-energie.fr", own), null);
});
