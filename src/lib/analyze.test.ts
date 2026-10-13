import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { parseEmail, parseHeadersOnly } from "./mime/parse.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
const ids = (name: string, orgDomains: string[] = []) =>
  analyzeEmail(parseEmail(read(name)), { orgDomains, parseHtml }).findings.map((f) => f.id);

test("merges header and link findings, most severe first", () => {
  assert.deepEqual(ids("spoofed-invoice.eml"), [
    "link.deceptive",
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "url.disguised-domain",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
    "html.tracking-pixel",
    "url.abused-tld",
  ]);
});

test("uses the organisation's domains for both header and link checks", () => {
  const report = analyzeEmail(parseEmail(read("spoofed-invoice.eml")), { orgDomains: ["rhone-energie.fr"], parseHtml });
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title ?? "", /your own domain/);
});

test("finds nothing on the clean newsletter", () => {
  assert.deepEqual(ids("clean-newsletter.eml"), []);
});

test("combines the lookalike's sender and link findings", () => {
  assert.deepEqual(ids("lookalike-paypal.eml").sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "sender.brand-impersonation",
    "url.lookalike",
    "url.shortener",
  ]);
});

test("handles pasted headers, which have no body", () => {
  const report = analyzeEmail(parseHeadersOnly("From: a@b.com\nSubject: x"), { orgDomains: [], parseHtml });
  assert.deepEqual(report.links.links, []);
});
