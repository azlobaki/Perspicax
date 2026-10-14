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
const analyse = (name: string, orgDomains: string[] = []) =>
  analyzeEmail(name.endsWith(".msg") ? parseMsg(read(name)) : parseEmail(read(name)), { orgDomains, parseHtml, decodeImage });
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
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title ?? "", /your own domain/);
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

test("the CEO-fraud email: a display name that shows another address, likely phishing", async () => {
  assert.deepEqual(await summary("bec-display-name.eml"), {
    ids: ["auth.dmarc-fail", "sender.display-name-address", "sender.reply-to-mismatch", "route.helo-mismatch"],
    score: 45,
    band: "likely-phishing",
  });
  const own = await analyse("bec-display-name.eml", ["rhone-energie.fr"]);
  assert.ok(own.findings.some((f) => f.id === "sender.org-impersonation"));
  assert.equal(own.findings.find((f) => f.id === "sender.lookalike-domain")?.title, "Sender domain imitates rhone-energie.fr");
});
