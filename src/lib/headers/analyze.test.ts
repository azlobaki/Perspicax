import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail, parseHeadersOnly } from "../mime/parse.ts";
import { analyzeHeaders } from "./analyze.ts";

const read = (name: string) => readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url));

test("finds the spoof in the spoofed-invoice fixture, most severe first", () => {
  const report = analyzeHeaders(parseEmail(read("spoofed-invoice.eml")), { orgDomains: ["rhone-energie.fr"] });
  assert.equal(report.subject, "Rappel : votre facture RE-2026-4471 reste impayée");
  assert.equal(report.date?.toISOString(), "2026-10-13T07:14:01.000Z");
  assert.equal(report.hops.length, 4);
  assert.equal(report.auth.recordedBy, "AS8PR04MB8213.eurprd04.prod.outlook.com");
  assert.equal(report.sender.from?.address, "facturation@rhone-energie.fr");
  assert.equal(report.vendors[0].verdict, "phishing");
  assert.deepEqual(report.findings.map((f) => f.id), [
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
  ]);
  assert.match(report.findings[0].title, /your own domain/);
});

test("raises nothing on the clean newsletter", () => {
  const report = analyzeHeaders(parseEmail(read("clean-newsletter.eml")), { orgDomains: [] });
  assert.equal(report.subject, "Nos coups de cœur d'octobre");
  assert.equal(report.auth.recordedBy, "mx.google.com");
  assert.deepEqual(report.findings, []);
});

test("gives the same findings from pasted headers", () => {
  const source = read("spoofed-invoice.eml").toString("utf8");
  const pasted = parseHeadersOnly(source.slice(0, source.indexOf("\n\n")));
  const report = analyzeHeaders(pasted, { orgDomains: [] });
  assert.deepEqual(report.findings.map((f) => f.id), [
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
  ]);
  assert.match(report.findings[0].title, /DMARC failed for rhone-energie\.fr/);
});
