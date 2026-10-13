import assert from "node:assert/strict";
import { test } from "node:test";
import { isFreeMail } from "../data/freemail.ts";
import { isSubdomainOf, orgDomain, sameOrg } from "./domain.ts";

test("finds the registrable domain", () => {
  assert.equal(orgDomain("mail.rhone-energie.fr"), "rhone-energie.fr");
  assert.equal(orgDomain("Rhone-Energie.FR."), "rhone-energie.fr");
  assert.equal(orgDomain("rhone-energie.fr.secure-login.click"), "secure-login.click");
  assert.equal(orgDomain("a.b.example.co.uk"), "example.co.uk");
  assert.equal(orgDomain("dgfip.finances.gouv.fr"), "finances.gouv.fr");
  assert.equal(orgDomain("evil.github.io"), "evil.github.io");
  assert.equal(orgDomain("localhost"), "localhost");
  assert.equal(orgDomain("185.234.72.19"), "185.234.72.19");
});

test("compares organisations and subdomains", () => {
  assert.ok(sameOrg("em.librairie-exemple.fr", "librairie-exemple.fr"));
  assert.ok(!sameOrg("rhone-energie.fr", "rhone-energie.fr.secure-login.click"));
  assert.ok(isSubdomainOf("espace-client.rhone-energie.fr", "rhone-energie.fr"));
  assert.ok(!isSubdomainOf("evilrhone-energie.fr", "rhone-energie.fr"));
});

test("knows free webmail domains", () => {
  assert.ok(isFreeMail("Outlook.FR"));
  assert.ok(isFreeMail("gmail.com"));
  assert.ok(!isFreeMail("rhone-energie.fr"));
});
