import assert from "node:assert/strict";
import { test } from "node:test";
import { becFindings } from "./bec.ts";

const check = (text: string, fromDomain: string | null = "gmail.com", options: { orgDomains?: string[]; bulk?: boolean } = {}) =>
  becFindings({ texts: [text], fromDomain, orgDomains: options.orgDomains ?? [], bulk: options.bulk ?? false });

test("flags the gift-card request with pressure, heavier from webmail", () => {
  const [finding] = check("Jean, j'ai besoin que tu achètes 5 cartes cadeaux Apple aujourd'hui. C'est urgent et confidentiel, garde ça entre nous. Je suis en réunion, ne m'appelle pas.");
  assert.equal(finding.id, "content.bec-request");
  assert.deepEqual([finding.severity, finding.weight], ["high", 18]);
  assert.ok(finding.evidence.length >= 2);
  const corporate = check("Please buy 5 Apple gift cards right away and keep this between us.", "partner-co.com");
  assert.deepEqual(corporate.map((f) => [f.severity, f.weight]), [["medium", 12]]);
});

test("flags pressure without a payment: the opener of a CEO fraud", () => {
  const [finding] = check("Are you available? I need a quick favour, I'm in a meeting and can't take calls. Keep this confidential.");
  assert.deepEqual([finding.id, finding.severity, finding.weight], ["content.bec-request", "high", 15]);
  assert.deepEqual(check("Êtes-vous disponible ? Je suis en déplacement et injoignable par téléphone.", "partner-co.com").map((f) => [f.severity, f.weight]), [["medium", 10]]);
});

test("flags crypto payments too", () => {
  const [finding] = check("Send the payment in bitcoin to this wallet address before tonight, it's urgent.");
  assert.equal(finding.id, "content.bec-request");
});

test("stays quiet on urgency alone, on newsletters and on the organisation's own mail", () => {
  assert.deepEqual(check("Urgent: the meeting moved to 3 pm, please reply as soon as possible."), []);
  assert.deepEqual(check("Offrez une carte cadeau à vos proches : -20 % aujourd'hui, c'est urgent !", "boutique.fr", { bulk: true }), []);
  assert.deepEqual(check("Please buy gift cards for the team party, keep it between us!", "rhone-energie.fr", { orgDomains: ["rhone-energie.fr"] }), []);
  assert.deepEqual(check("Our gift cards make great presents."), []);
});

test("a lone gift-card request weighs little", () => {
  assert.deepEqual(check("Could you purchase three Google Play cards for me?", "partner-co.com").map((f) => [f.severity, f.weight]), [["low", 5]]);
});
