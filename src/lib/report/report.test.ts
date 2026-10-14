import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";
import { reportJson } from "./json.ts";
import { reportMarkdown } from "./markdown.ts";

const generatedAt = new Date("2026-10-14T10:00:00Z");
const spoofed = async () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const report = await analyzeEmail(email, { orgDomains: [], parseHtml });
  return { email, report, file: { name: "spoofed-invoice.eml", size: 3790 }, generatedAt };
};

test("writes a defanged Markdown ticket report", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: true });
  assert.match(md, /^# Email analysis — Rappel : votre facture RE-2026-4471 reste impayée$/m);
  assert.match(md, /^\*\*Verdict:\*\* Malicious indicators — score 100\/100$/m);
  assert.match(md, /^\*\*Analysed:\*\* 2026-10-14 10:00:00 UTC with Perspicax, offline$/m);
  assert.match(md, /^1\. \*\*Link text shows another destination\*\* — High, \+20$/m);
  assert.match(md, /`"hxxps:\/\/espace-client\[\.\]rhone-energie\[\.\]fr" → hxxps:\/\/rhone-energie\[\.\]fr\[\.\]secure-login\[\.\]click\/auth\?u=j\.martin`/);
  assert.match(md, /^\| spf \| fail \| smtp\.mailfrom=mta-relay\[\.\]click \|$/m);
  assert.match(md, /^\| 1 \| 07:14:02Z \| — \| mail\[\.\]rhone-energie\[\.\]fr \| 185\[\.\]234\[\.\]72\[\.\]19 \| mx01\[\.\]mta-relay\[\.\]click \|$/m);
  assert.match(md, /^\| Facture_RE-4471\.pdf\.html \| HTML document \| 343 B \| `[0-9a-f]{64}` \| web-page, double-extension, html-smuggling \|$/m);
  assert.match(md, /^- `hxxps:\/\/t\[\.\]mta-relay\[\.\]click\/o\/9f3a2c1e\.gif` — image in HTML body$/m);
  assert.doesNotMatch(md, /https:\/\/rhone-energie\.fr\.secure-login/);
  assert.match(md, /does not replace a qualified human analysis\./);
});

test("can leave indicators live", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: false });
  assert.match(md, /https:\/\/rhone-energie\.fr\.secure-login\.click\/auth\?u=j\.martin/);
  assert.match(md, /Indicators are not defanged\.$/);
});

test("exports JSON for machines, raw and without attachment content", async () => {
  const data = JSON.parse(reportJson(await spoofed()));
  assert.equal(data.generator, "Perspicax");
  assert.deepEqual(data.verdict, {
    score: 100, band: "malicious", label: "Malicious indicators",
    categories: data.verdict.categories,
  });
  assert.equal(data.iocs.length, 16);
  assert.equal(data.links[0].final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal("html" in data.attachments[0], false);
  assert.equal(data.relayChain[0].date, "2026-10-13T07:14:02.000Z");
});
