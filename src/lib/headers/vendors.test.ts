import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { evidenceIn } from "../finding.ts";
import { vendorFindings, vendorVerdicts } from "./vendors.ts";

const headers = (lines: Record<string, string>): HeaderField[] =>
  Object.entries(lines).map(([name, value]) => ({ name, value }));

const FOREFRONT =
  "CIP:185.234.72.19;CTRY:NL;LANG:fr;SCL:9;SRV:;IPV:NLI;SFV:SPM;H:mx01.mta-relay.click;PTR:InfoNoRecords;CAT:PHSH;SFS:(13230040)(4636009)(376014);DIR:INB;";

test("decodes Microsoft's anti-spam report", () => {
  const [ms] = vendorVerdicts(headers({
    "X-Forefront-Antispam-Report": FOREFRONT,
    "X-Microsoft-Antispam": "BCL:0;ARA:13230040|4636009|376014;",
  }));
  assert.equal(ms.vendor, "Microsoft 365");
  assert.equal(ms.verdict, "phishing");
  const field = (key: string) => ms.fields.find((f) => f.key === key);
  assert.deepEqual(field("CAT"), { key: "CAT", value: "PHSH", meaning: { en: "Phishing", fr: "Hameçonnage" }, flagged: true });
  assert.deepEqual(field("SFV"), { key: "SFV", value: "SPM", meaning: { en: "Spam", fr: "Spam" }, flagged: true });
  assert.equal(field("SCL")?.flagged, true);
  assert.equal(field("BCL")?.flagged, false);
  assert.equal(field("PTR")?.meaning?.en, "No reverse DNS");
  assert.equal(field("PTR")?.meaning?.fr, "Pas de DNS inverse");
  assert.equal(field("CTRY")?.value, "NL");
  assert.equal(field("SRV"), undefined);
});

test("reads a clean Microsoft verdict and stays silent about it", () => {
  const verdicts = vendorVerdicts(headers({ "X-Forefront-Antispam-Report": "SFV:NSPM;CAT:NONE;SCL:1;" }));
  assert.equal(verdicts[0].verdict, "clean");
  assert.deepEqual(vendorFindings(verdicts), []);
});

test("decodes Proofpoint", () => {
  const clean = vendorVerdicts(headers({ "X-Proofpoint-Spam-Details": "rule=notspam policy=default score=0 phishscore=0 malwarescore=0 spamscore=0 bulkscore=0" }));
  assert.equal(clean[0].verdict, "clean");
  const phish = vendorVerdicts(headers({ "X-Proofpoint-Spam-Details": "rule=phish policy=default score=97 phishscore=97" }));
  assert.equal(phish[0].verdict, "phishing");
  assert.ok(phish[0].fields.find((f) => f.key === "phishscore")?.flagged);
});

test("decodes Mimecast impersonation protection", () => {
  const [mc] = vendorVerdicts(headers({
    "X-Mimecast-Impersonation-Protect": "Policy=CLT - Impersonation Protection Definition;Similar Internal Domain=true;Newly Observed Domain=false;Reply-to Address Mismatch=true",
  }));
  assert.equal(mc.verdict, "phishing");
  assert.deepEqual(mc.fields.filter((f) => f.flagged).map((f) => f.key), ["Similar Internal Domain", "Reply-to Address Mismatch"]);
});

test("decodes Gmail and SpamAssassin markers", () => {
  assert.equal(vendorVerdicts(headers({ "X-Gm-Phishy": "1", "X-Gm-Spam": "0" }))[0].verdict, "phishing");
  const [sa] = vendorVerdicts(headers({ "X-Spam-Status": "Yes, score=7.2 required=5.0 tests=BAYES_99,URIBL_BLACK" }));
  assert.equal(sa.vendor, "SpamAssassin");
  assert.equal(sa.verdict, "spam");
  assert.equal(sa.fields.find((f) => f.key === "score")?.value, "7.2");
});

test("decodes Hornetsecurity", () => {
  const [clean] = vendorVerdicts(headers({
    "X-antispameurope-Spamstatus": "CLEAN",
    "X-antispameurope-REASON": "Score-b:-9.293697",
    "X-antispameurope-Virusscan": "CLEAN",
  }));
  assert.equal(clean.vendor, "Hornetsecurity");
  assert.equal(clean.verdict, "clean");
  assert.deepEqual(clean.fields.map((f) => [f.key, f.value, f.flagged]), [
    ["Spamstatus", "CLEAN", false],
    ["Reason", "Score-b:-9.293697", false],
    ["Virusscan", "CLEAN", false],
  ]);
  const verdict = (status: string, virus = "CLEAN") =>
    vendorVerdicts(headers({ "X-Antispameurope-Spamstatus": status, "X-Antispameurope-Virusscan": virus }))[0].verdict;
  assert.equal(verdict("INFOMAIL"), "bulk");
  assert.equal(verdict("SPAM"), "spam");
  assert.equal(verdict("PHISHING"), "phishing");
  assert.equal(verdict("CLEAN", "INFECTED"), "malware");
  assert.equal(verdict("SOMETHING-NEW"), null);
});

test("returns nothing when no gateway left a verdict", () => {
  assert.deepEqual(vendorVerdicts(headers({ Subject: "x" })), []);
});

test("turns verdicts into findings", () => {
  const findings = vendorFindings(vendorVerdicts(headers({ "X-Forefront-Antispam-Report": FOREFRONT })));
  assert.deepEqual(findings.map((f) => [f.id, f.severity, f.weight]), [["vendor.microsoft-365", "high", 15]]);
  assert.ok(findings[0].evidence.map((e) => evidenceIn(e, "en")).includes("CAT: PHSH (Phishing)"));
  const bulk = vendorFindings(vendorVerdicts(headers({ "X-Forefront-Antispam-Report": "SFV:NSPM;CAT:BULK;" })));
  assert.equal(bulk[0].severity, "info");
});
