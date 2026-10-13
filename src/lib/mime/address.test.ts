import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAddressList } from "./address.ts";

test("parses a display name and address, lowercasing the domain only", () => {
  assert.deepEqual(parseAddressList('"Rhône Énergie" <Facturation@Rhone-Energie.FR>'), [
    { name: "Rhône Énergie", address: "Facturation@rhone-energie.fr", domain: "rhone-energie.fr" },
  ]);
});

test("decodes RFC 2047 display names", () => {
  const [from] = parseAddressList(
    "=?utf-8?Q?Rh=C3=B4ne_=C3=89nergie_=E2=80=93_Service_Facturation?= <facturation@rhone-energie.fr>",
  );
  assert.equal(from.name, "Rhône Énergie – Service Facturation");
});

test("splits lists on commas outside quotes", () => {
  const list = parseAddressList('a@x.com, "Doe, John" <j@y.com>');
  assert.deepEqual(list.map((a) => a.address), ["a@x.com", "j@y.com"]);
  assert.equal(list[1].name, "Doe, John");
});

test("handles bare addresses, angle-only addresses and comments", () => {
  assert.deepEqual(parseAddressList("<x@y.com>")[0], { name: "", address: "x@y.com", domain: "y.com" });
  assert.equal(parseAddressList("user@example.com (Comment)")[0].address, "user@example.com");
});

test("keeps an address-looking display name as the name", () => {
  const [from] = parseAddressList('"ceo@rhone-energie.fr" <boss@evil.top>');
  assert.equal(from.name, "ceo@rhone-energie.fr");
  assert.equal(from.address, "boss@evil.top");
});

test("returns nothing for empty groups and garbage", () => {
  assert.deepEqual(parseAddressList("Undisclosed recipients:;"), []);
  assert.deepEqual(parseAddressList("not an address"), []);
  assert.deepEqual(parseAddressList("<>"), []);
});
