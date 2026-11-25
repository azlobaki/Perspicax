import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { carriedMessages } from "./messages.ts";
import { getHeader } from "./mime/headers.ts";
import { parseEmail } from "./mime/parse.ts";
import { reportMarkdown } from "./report/markdown.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";

const fixture = (name: string) => parseEmail(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url)));

test("opens the phish a colleague reported as an attachment", async () => {
  const wrapper = fixture("reported-phish.eml");
  const [carried] = carriedMessages(wrapper);
  assert.equal(carried.name, "Votre colis est en attente.eml");
  const inner = carried.open();
  assert.equal(getHeader(inner.headers, "from"), "La Poste <suivi@colis-laposte.top>");

  const outer = await analyzeEmail(wrapper, { orgDomains: ["rhone-energie.fr"], parseHtml });
  const notice = outer.findings.find((f) => f.id === "attachment.message");
  assert.equal(notice?.severity, "info");
  assert.equal(notice?.weight, 0);
  assert.deepEqual(notice?.evidence, ["Votre colis est en attente.eml"]);
  assert.deepEqual(outer.attachments[0].flags, ["message"]);

  const suspect = await analyzeEmail(inner, { orgDomains: ["rhone-energie.fr"], parseHtml });
  assert.ok(suspect.score.score > outer.score.score);
  assert.ok(suspect.findings.some((f) => f.id === "sender.brand-impersonation"));

  // The victim's address, base64 in the link, appears in no evidence and no report.
  const encoded = Buffer.from("claire.dupont@rhone-energie.fr").toString("base64");
  const evidence = suspect.findings.flatMap((f) => f.evidence).map((e) => (typeof e === "string" ? e : e.en));
  assert.ok(evidence.length > 0 && evidence.every((e) => !e.includes(encoded)));
  const md = reportMarkdown({ email: inner, report: suspect, file: { name: "x.eml", size: 1 }, generatedAt: new Date(), defang: false });
  assert.ok(!md.includes(encoded));
  assert.match(md, /colis-laposte\.top\/suivi#REDACTED/);
});

test("carries nothing when nothing is attached", () => {
  assert.deepEqual(carriedMessages(fixture("clean-newsletter.eml")), []);
});
