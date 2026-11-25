import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";

const fixture = async (name: string) => {
  const email = parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
  return { email, report: await analyzeEmail(email, { orgDomains: [], parseHtml }) };
};

test("collects the spoofed invoice's indicators with their provenance", async () => {
  const { email, report } = await fixture("spoofed-invoice.eml");
  const of = (type: string) => report.iocs.filter((i) => i.type === type).map((i) => i.value);
  assert.deepEqual(of("url"), [
    "https://rhone-energie.fr.secure-login.click/auth?u=j.martin",
    "https://t.mta-relay.click/o/9f3a2c1e.gif",
    "https://espace-client.rhone-energie.fr/",
  ]);
  assert.deepEqual(of("domain"), [
    "rhone-energie.fr",
    "mta-relay.click",
    "mx01.mta-relay.click",
    "rhone-energie.fr.secure-login.click",
    "t.mta-relay.click",
    "espace-client.rhone-energie.fr",
  ]);
  assert.deepEqual(of("ip"), ["185.234.72.19"]);
  assert.deepEqual(of("email"), ["facturation@rhone-energie.fr", "rhone.energie.paiement@outlook.fr", "bounce-7f3a@mta-relay.click"]);
  assert.deepEqual(of("sha256"), [createHash("sha256").update(email.attachments[0].data).digest("hex")]);
  assert.deepEqual(report.iocs.find((i) => i.type === "url")?.sources.map((s) => s.en), ["link in HTML body"]);
  assert.deepEqual(report.iocs.find((i) => i.type === "ip")?.sources.map((s) => s.en), ["Received (origin)"]);
});

test("leaves recipients and mailing-service trackers out", async () => {
  const { report } = await fixture("clean-newsletter.eml");
  const values = report.iocs.map((i) => i.value);
  assert.ok(!values.includes("claire.dupont@gmail.com"));
  assert.ok(!values.some((v) => v.includes("sendgrid.net")));
  assert.ok(values.includes("https://lettre.librairie-exemple.fr/selection-octobre"));
});

test("never hands the recipient's address to a pivot", async () => {
  const encoded = Buffer.from("claire.dupont@rhone-energie.fr").toString("base64");
  const raw = [
    "From: IT <it@helpdesk-rhone.top>",
    "To: Claire Dupont <claire.dupont@rhone-energie.fr>",
    "Subject: Password expiry",
    "Content-Type: text/html; charset=utf-8",
    "",
    `<a href="https://evil.top/sso#${encoded}">Keep my password</a>`,
    `<a href="https://evil.top/login?email=claire.dupont%40rhone-energie.fr">Sign in</a>`,
    "",
  ].join("\r\n");
  const report = await analyzeEmail(parseEmail(new TextEncoder().encode(raw)), { orgDomains: [], parseHtml });
  assert.deepEqual(report.iocs.filter((i) => i.type === "url").map((i) => i.value), [
    "https://evil.top/sso#REDACTED",
    "https://evil.top/login?email=REDACTED",
  ]);
  assert.ok(report.findings.some((f) => f.id === "link.recipient-in-url"));
});

test("reads a consent link: the finding names the app, the indicators its redirect_uri", async () => {
  const consent =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=4f2b8c1e&redirect_uri=https%3A%2F%2Fdocs-review.top%2Fcb&scope=offline_access%20Mail.ReadWrite&response_type=code";
  const raw = ["From: Docs <share@docs-review.top>", "Content-Type: text/html", "", `<a href="${consent.replace(/&/g, "&amp;")}">Open the shared file</a>`, ""].join("\r\n");
  const report = await analyzeEmail(parseEmail(new TextEncoder().encode(raw)), { orgDomains: [], parseHtml });
  const finding = report.findings.find((f) => f.id === "url.oauth-consent");
  assert.deepEqual(finding?.evidence.map((e) => (typeof e === "string" ? e : e.en)), [
    "Microsoft — client_id 4f2b8c1e — scope Mail.ReadWrite — redirect_uri https://docs-review.top/cb",
  ]);
  const domains = report.iocs.filter((i) => i.type === "domain");
  assert.deepEqual(domains.find((i) => i.value === "docs-review.top")?.sources.map((s) => s.en), ["From", "redirect_uri of a link"]);
  assert.ok(domains.some((i) => i.value === "login.microsoftonline.com"));
});
