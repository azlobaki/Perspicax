import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { parseEmail, parseHeadersOnly } from "./mime/parse.ts";
import { parseMsg } from "./msg/parse.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";
import { decodePng } from "./testing/png.ts";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
const decodeImage = async (data: Uint8Array) => decodePng(data);
const analyse = (name: string, orgDomains: string[] = [], vipNames: string[] = []) =>
  analyzeEmail(name.endsWith(".msg") ? parseMsg(read(name)) : parseEmail(read(name)), { orgDomains, vipNames, parseHtml, decodeImage });
const summary = async (name: string) => {
  const report = await analyse(name);
  return { ids: report.findings.map((f) => f.id), score: report.score.score, band: report.score.band };
};

test("the spoofed invoice: every kind of finding, malicious indicators", async () => {
  assert.deepEqual(await summary("spoofed-invoice.eml"), {
    ids: [
      "link.deceptive",
      "attachment.html-smuggling",
      "auth.dmarc-fail",
      "vendor.microsoft-365",
      "url.disguised-domain",
      "attachment.double-extension",
      "sender.reply-to-mismatch",
      "route.helo-mismatch",
      "html.tracking-pixel",
      "url.abused-tld",
    ],
    score: 100,
    band: "malicious",
  });
});

test("uses the organisation's domains", async () => {
  const report = await analyse("spoofed-invoice.eml", ["rhone-energie.fr"]);
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title.en ?? "", /your own domain/);
});

test("the clean newsletter: nothing, and its DKIM body hash matches", async () => {
  const report = await analyse("clean-newsletter.eml");
  assert.deepEqual(report.findings, []);
  assert.deepEqual([report.score.score, report.score.band], [0, "clean"]);
  assert.deepEqual(report.dkim.map((c) => c.result), ["match"]);
});

test("the PayPal lookalike: malicious indicators by score", async () => {
  const { ids, score, band } = await summary("lookalike-paypal.eml");
  assert.deepEqual([...ids].sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "sender.brand-impersonation",
    "sender.lookalike-domain",
    "url.lookalike",
    "url.shortener",
  ]);
  assert.deepEqual([score, band], [75, "malicious"]);
});

test("the quishing email: likely phishing", async () => {
  assert.deepEqual(await summary("quishing-qr.eml"), {
    ids: ["url.disguised-domain", "attachment.qr-code", "sender.brand-impersonation", "url.abused-tld"],
    score: 43,
    band: "likely-phishing",
  });
});

test("the macro document and the reversed archive: malicious whatever the score", async () => {
  assert.deepEqual(await summary("macro-docm.eml"), {
    ids: ["attachment.macros", "attachment.remote-template", "url.abused-tld"],
    score: 36,
    band: "malicious",
  });
  const rtlo = await summary("rtlo-archive.eml");
  assert.deepEqual([[...rtlo.ids].sort(), rtlo.score, rtlo.band], [["attachment.archive-hides-program", "attachment.rtlo"], 30, "malicious"]);
});

test("the DocuSign .msg: suspicious", async () => {
  assert.deepEqual(await summary("docusign.msg"), {
    ids: ["url.disguised-domain", "auth.compauth-fail", "sender.brand-impersonation", "url.abused-tld"],
    score: 38,
    band: "suspicious",
  });
});

test("pasted headers are scored on what they show", async () => {
  const source = read("spoofed-invoice.eml").toString("utf8");
  const report = await analyzeEmail(parseHeadersOnly(source.slice(0, source.indexOf("\n\n"))), { orgDomains: [], parseHtml });
  assert.deepEqual([report.score.score, report.score.band], [45, "likely-phishing"]);
  assert.deepEqual(report.links.links, []);
  assert.deepEqual(report.attachments, []);
  assert.deepEqual(report.dkim, []);
});

test("the CEO-fraud email: a display name that shows another address and a transfer request, likely phishing", async () => {
  assert.deepEqual(await summary("bec-display-name.eml"), {
    ids: ["auth.dmarc-fail", "sender.display-name-address", "content.payment-details", "sender.reply-to-mismatch", "route.helo-mismatch"],
    score: 55,
    band: "likely-phishing",
  });
  const own = await analyse("bec-display-name.eml", ["rhone-energie.fr"]);
  assert.ok(own.findings.some((f) => f.id === "sender.org-impersonation"));
  assert.equal(own.findings.find((f) => f.id === "sender.lookalike-domain")?.title.en, "Sender domain imitates rhone-energie.fr");
});

test("the payroll diversion: a payment request from webmail, worse in a protected person's name", async () => {
  assert.deepEqual(await summary("vip-payroll.eml"), { ids: ["content.payment-details"], score: 20, band: "suspicious" });
  const report = await analyse("vip-payroll.eml", ["rhone-energie.fr"], ["Claire Martin"]);
  assert.deepEqual(report.findings.map((f) => f.id), ["sender.vip-impersonation", "content.payment-details"]);
  assert.equal(report.score.score, 40);
  assert.equal(report.score.band, "likely-phishing");
});

test("the Exchange .msg: links read from the HTML inside compressed RTF, ARC and Hornetsecurity verdicts", async () => {
  assert.deepEqual(await summary("exchange-rtf.msg"), {
    ids: ["link.deceptive", "auth.dmarc-fail", "sender.brand-impersonation", "vendor.hornetsecurity", "url.abused-tld"],
    score: 57,
    band: "likely-phishing",
  });
  const report = await analyse("exchange-rtf.msg");
  assert.equal(report.headers.auth.source, "ARC-Authentication-Results");
  assert.equal(report.headers.auth.recordedBy, "mx-gate12-hz1.hornetsecurity.com");
});
