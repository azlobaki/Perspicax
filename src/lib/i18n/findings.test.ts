import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { PHRASE_FR } from "../attachments/analyze.ts";
import { PDF_ACTIVE_PHRASES } from "../attachments/pdf.ts";
import { SMUGGLING_PHRASES } from "../attachments/smuggling.ts";
import { HIDDEN_PHRASES } from "../html/style.ts";
import { HIDDEN_FR } from "../links/analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseMsg } from "../msg/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";
import { decodePng } from "../testing/png.ts";
import { LOCALES } from "./text.ts";

const dir = new URL("../../../fixtures/", import.meta.url);
const files = readdirSync(dir).filter((f) => /\.(eml|msg)$/.test(f));

test("every finding of every fixture reads in every language", async () => {
  for (const file of files) {
    const bytes = readFileSync(new URL(file, dir));
    const email = file.endsWith(".msg") ? parseMsg(bytes) : parseEmail(bytes);
    const report = await analyzeEmail(email, {
      orgDomains: ["rhone-energie.fr"],
      vipNames: ["Claire Martin"],
      parseHtml,
      decodeImage: async (data) => decodePng(data),
    });
    for (const finding of report.findings) {
      for (const locale of LOCALES) {
        assert.ok(finding.title[locale]?.trim(), `${file} ${finding.id}: title.${locale}`);
        assert.ok(finding.explanation[locale]?.trim(), `${file} ${finding.id}: explanation.${locale}`);
      }
    }
  }
});

test("French findings read as French", async () => {
  const email = parseEmail(readFileSync(new URL("spoofed-invoice.eml", dir)));
  const report = await analyzeEmail(email, { orgDomains: ["rhone-energie.fr"], parseHtml, decodeImage: async (d) => decodePng(d) });
  const titles = Object.fromEntries(report.findings.map((f) => [f.id, f.title.fr]));
  assert.equal(titles["auth.dmarc-fail"], "Échec d’authentification de l’expéditeur pour votre propre domaine");
  assert.equal(titles["sender.reply-to-mismatch"], "Les réponses partent vers un autre domaine");
  assert.equal(titles["link.deceptive"], "Le texte du lien montre une autre destination");

  const payroll = await analyzeEmail(parseEmail(readFileSync(new URL("vip-payroll.eml", dir))), {
    orgDomains: ["rhone-energie.fr"], vipNames: ["Claire Martin"], parseHtml,
  });
  assert.deepEqual(payroll.findings.map((f) => f.title.fr), [
    "Nom affiché d’une personne protégée\u00a0: Claire Martin",
    "Demande de paiement ou de coordonnées bancaires depuis une adresse de messagerie gratuite",
  ]);
});

const analyseFixture = async (file: string) => {
  const bytes = readFileSync(new URL(file, dir));
  const email = file.endsWith(".msg") ? parseMsg(bytes) : parseEmail(bytes);
  return analyzeEmail(email, {
    orgDomains: ["rhone-energie.fr"],
    vipNames: ["Claire Martin"],
    parseHtml,
    decodeImage: async (data) => decodePng(data),
  });
};

test("every phrase the inspectors can report has a French entry", () => {
  for (const phrase of [...SMUGGLING_PHRASES, ...PDF_ACTIVE_PHRASES]) {
    assert.ok(PHRASE_FR[phrase], `PHRASE_FR lacks "${phrase}"`);
  }
  // The other hidden-element reasons are CSS declarations (display:none…), which read the same.
  for (const phrase of Object.values(HIDDEN_PHRASES)) {
    assert.ok(HIDDEN_FR[phrase], `HIDDEN_FR lacks "${phrase}"`);
  }
});

test("our notations in the evidence read French", async () => {
  for (const file of files) {
    const report = await analyseFixture(file);
    for (const finding of report.findings) {
      for (const line of finding.evidence) {
        if (typeof line === "string") continue;
        assert.notEqual(line.fr, line.en, `${file} ${finding.id}: evidence "${line.en}" has no French`);
      }
    }
  }
  const spoofed = await analyseFixture("spoofed-invoice.eml");
  const vendor = spoofed.findings.find((f) => f.category === "vendor");
  const french = vendor?.evidence.map((e) => (typeof e === "string" ? e : e.fr));
  assert.ok(french?.includes("SCL: 9 (Spam à forte confiance)"), String(french));
  assert.ok(french?.includes("CAT: PHSH (Hameçonnage)"), String(french));
});

test("an Outlook message with an RTF body reads French too", async () => {
  const report = await analyseFixture("exchange-rtf.msg");
  assert.ok(report.findings.length > 0);
  for (const finding of report.findings) assert.ok(finding.title.fr.trim(), `${finding.id}: empty French title`);
  const link = report.findings.find((f) => f.id === "link.deceptive");
  assert.equal(link?.title.fr, "Le texte du lien montre une autre destination");
});
