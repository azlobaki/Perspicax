import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { senderFindings, senderInfo } from "./sender.ts";

const headers = (lines: Record<string, string>): HeaderField[] =>
  Object.entries(lines).map(([name, value]) => ({ name, value }));

const SPOOF = headers({
  "Return-Path": "bounce-7f3a@mta-relay.click",
  From: "=?utf-8?Q?Rh=C3=B4ne_=C3=89nergie?= <facturation@rhone-energie.fr>",
  "Reply-To": "<rhone.energie.paiement@outlook.fr>",
  "Message-ID": "<20261013071401.4471@mta-relay.click>",
});

test("lists every sender-related header against the From domain", () => {
  const info = senderInfo(SPOOF);
  assert.equal(info.from?.name, "Rhône Énergie");
  assert.deepEqual(
    info.rows.map((r) => [r.header, r.domain, r.matchesFrom, r.freeMail]),
    [
      ["From", "rhone-energie.fr", null, false],
      ["Reply-To", "outlook.fr", false, true],
      ["Return-Path", "mta-relay.click", false, false],
      ["Message-ID", "mta-relay.click", false, false],
    ],
  );
});

test("treats subdomains of the From organisation as consistent", () => {
  const info = senderInfo(headers({ From: "lettre@librairie-exemple.fr", "Return-Path": "<bounce+1@em.librairie-exemple.fr>" }));
  assert.equal(info.rows[1].matchesFrom, true);
});

test("shows a null Return-Path as is", () => {
  const info = senderInfo(headers({ From: "a@b.com", "Return-Path": "<>" }));
  assert.deepEqual(info.rows[1], { header: "Return-Path", value: "<>", domain: null, matchesFrom: null, freeMail: false });
});

test("flags replies diverted to another domain, mentioning free mail", () => {
  const findings = senderFindings(senderInfo(SPOOF), []);
  assert.deepEqual(findings.map((f) => f.id), ["sender.reply-to-mismatch"]);
  assert.match(findings[0].explanation, /outlook\.fr/);
  assert.match(findings[0].explanation, /free webmail/);
});

test("flags a display name that shows another address", () => {
  const findings = senderFindings(senderInfo(headers({ From: '"ceo@rhone-energie.fr" <boss@evil.top>' })), []);
  assert.deepEqual(findings.map((f) => [f.id, f.severity]), [["sender.display-name-address", "high"]]);
});

test("flags brand impersonation, not the brand itself", () => {
  const fake = senderFindings(senderInfo(headers({ From: '"Microsoft 365 Security" <alert@m365-secure.top>' })), []);
  assert.deepEqual(fake.map((f) => f.id), ["sender.brand-impersonation"]);
  assert.match(fake[0].title, /Microsoft/);
  const real = senderFindings(senderInfo(headers({ From: "Microsoft <no-reply@email.microsoft.com>" })), []);
  assert.deepEqual(real, []);
});

test("flags a display name imitating the organisation", () => {
  const info = senderInfo(headers({ From: '"Rhône Énergie Facturation" <billing@rhone-energie-paiement.com>' }));
  assert.deepEqual(senderFindings(info, ["rhone-energie.fr"]).map((f) => f.id), ["sender.lookalike-domain", "sender.org-impersonation"]);
  assert.deepEqual(senderFindings(info, []), []);
});

test("flags missing or multiple From addresses", () => {
  assert.deepEqual(senderFindings(senderInfo(headers({ Subject: "x" })), []).map((f) => f.id), ["sender.no-from"]);
  assert.deepEqual(senderFindings(senderInfo(headers({ From: "a@x.com, b@y.com" })), []).map((f) => f.id), ["sender.multiple-from"]);
});

test("flags a sender domain that imitates the organisation's or a brand's", () => {
  const bec = senderInfo(headers({
    From: '"pdg@rhone-energie.fr" <pdg@rhone-energie-direction.com>',
    "Return-Path": "<pdg@rhone-energie-direction.com>",
  }));
  const own = senderFindings(bec, ["rhone-energie.fr"]).find((f) => f.id === "sender.lookalike-domain");
  assert.equal(own?.title, "Sender domain imitates rhone-energie.fr");
  assert.equal(own?.severity, "high");
  assert.deepEqual(own?.evidence, ["From: pdg@rhone-energie-direction.com", "Return-Path: pdg@rhone-energie-direction.com"]);
  // Without the organisation's domain configured there is nothing to compare with.
  assert.equal(senderFindings(bec, []).find((f) => f.id === "sender.lookalike-domain"), undefined);

  const paypal = senderFindings(senderInfo(headers({ From: "PayPal <service@xn--pypal-4ve.com>" })), []);
  assert.deepEqual(paypal.find((f) => f.id === "sender.lookalike-domain")?.evidence, ["From: service@xn--pypal-4ve.com (reads as pаypal.com)"]);
});

test("leaves real brand domains, the organisation itself and free mail alone", () => {
  for (const from of ["Microsoft <no-reply@email.microsoft.com>", "Facturation <facturation@rhone-energie.fr>", "Claire <claire@outlook.fr>"]) {
    const findings = senderFindings(senderInfo(headers({ From: from })), ["rhone-energie.fr"]);
    assert.equal(findings.find((f) => f.id === "sender.lookalike-domain"), undefined, from);
  }
});
