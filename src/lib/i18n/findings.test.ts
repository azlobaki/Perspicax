import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
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
    "Nom affiché d’une personne protégée : Claire Martin",
    "Demande de paiement ou de coordonnées bancaires depuis une adresse de messagerie gratuite",
  ]);
});
