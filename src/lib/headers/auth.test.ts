import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { authFindings, authSummary, isFailing, parseAuthResults, parseReceivedSpf, type AuthSummary } from "./auth.ts";
import { relayChain } from "./received.ts";

const MICROSOFT =
  "spf=fail (sender IP is 185.234.72.19) smtp.mailfrom=mta-relay.click; dkim=none (message not signed) header.d=none;dmarc=fail action=quarantine header.from=rhone-energie.fr;compauth=fail reason=000";
const GMAIL =
  'mx.google.com; dkim=pass header.i=@librairie-exemple.fr header.s=s1 header.b=Xy12abCd; spf=pass (google.com: domain of bounce+4471@em.librairie-exemple.fr designates 149.72.120.130 as permitted sender) smtp.mailfrom="bounce+4471@em.librairie-exemple.fr"; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=librairie-exemple.fr';

test("parses Microsoft's results, which have no authserv-id", () => {
  const { authservId, entries } = parseAuthResults(MICROSOFT);
  assert.equal(authservId, null);
  assert.deepEqual(entries.map((e) => [e.method, e.result]), [
    ["spf", "fail"], ["dkim", "none"], ["dmarc", "fail"], ["compauth", "fail"],
  ]);
  assert.equal(entries[0].comment, "sender IP is 185.234.72.19");
  assert.deepEqual(entries[2].props, { action: "quarantine", "header.from": "rhone-energie.fr" });
  assert.equal(entries[3].reason, "000");
});

test("parses Gmail's results with an authserv-id and quoted values", () => {
  const { authservId, entries } = parseAuthResults(GMAIL);
  assert.equal(authservId, "mx.google.com");
  assert.equal(entries[1].props["smtp.mailfrom"], "bounce+4471@em.librairie-exemple.fr");
  assert.equal(entries[2].comment, "p=QUARANTINE sp=QUARANTINE dis=NONE");
});

test("handles ARC instances, 'none' and quoted reasons", () => {
  assert.equal(parseAuthResults("i=1; mx.google.com; dkim=pass header.d=a.com").authservId, "mx.google.com");
  assert.deepEqual(parseAuthResults("mx.example.com; none").entries, []);
  const [entry] = parseAuthResults('mx.example.com; dkim=fail reason="signature verification failed" header.d=example.com').entries;
  assert.equal(entry.reason, "signature verification failed");
});

test("parses Received-SPF", () => {
  const entry = parseReceivedSpf(
    "Fail (protection.outlook.com: domain of mta-relay.click does not designate 185.234.72.19 as permitted sender) receiver=protection.outlook.com; client-ip=185.234.72.19; helo=mx01.mta-relay.click;",
  );
  assert.equal(entry.method, "spf");
  assert.equal(entry.result, "fail");
  assert.equal(entry.props["client-ip"], "185.234.72.19");
});

test("summarises the topmost Authentication-Results, recorded by the last hop", () => {
  const headers: HeaderField[] = [
    { name: "Received", value: "from x by mbx.contoso.com; Tue, 13 Oct 2026 07:14:04 +0000" },
    { name: "Authentication-Results", value: MICROSOFT },
    { name: "Authentication-Results", value: "forged.example; dmarc=pass header.from=rhone-energie.fr" },
  ];
  const summary = authSummary(headers, relayChain(headers));
  assert.equal(summary.source, "Authentication-Results");
  assert.equal(summary.recordedBy, "mbx.contoso.com");
  assert.equal(summary.entries.find((e) => e.method === "dmarc")?.result, "fail");
});

test("falls back to Received-SPF, then to nothing", () => {
  const spfOnly = authSummary([{ name: "Received-SPF", value: "Pass (x) client-ip=1.2.3.4;" }], []);
  assert.equal(spfOnly.source, "Received-SPF");
  assert.equal(authSummary([], []).entries.length, 0);
});

test("knows which results count as failures", () => {
  const entry = (method: string, result: string) => ({ method, result, reason: null, comment: null, props: {} });
  assert.ok(isFailing(entry("dkim", "none")));
  assert.ok(isFailing(entry("spf", "softfail")));
  assert.ok(!isFailing(entry("spf", "pass")));
  assert.ok(!isFailing(entry("spf", "temperror")));
});

const summaryOf = (value: string): AuthSummary => ({
  recordedBy: null, source: "Authentication-Results", entries: parseAuthResults(value).entries,
});

test("reports a DMARC failure once, heavier on the organisation's own domain", () => {
  const own = authFindings(summaryOf(MICROSOFT), "rhone-energie.fr", ["rhone-energie.fr"]);
  assert.deepEqual(own.map((f) => [f.id, f.severity, f.weight]), [["auth.dmarc-fail", "high", 25]]);
  assert.match(own[0].title, /your own domain/);
  assert.ok(own[0].evidence.includes("dmarc=fail action=quarantine header.from=rhone-energie.fr"));
  const other = authFindings(summaryOf(MICROSOFT), "rhone-energie.fr", []);
  assert.equal(other[0].weight, 18);
});

test("reports SPF, DKIM and compauth failures when DMARC did not fail", () => {
  assert.deepEqual(authFindings(summaryOf("mx; spf=softfail smtp.mailfrom=a.com"), null, []).map((f) => f.id), ["auth.spf-softfail"]);
  assert.deepEqual(
    authFindings(summaryOf("mx; spf=fail smtp.mailfrom=a.com; dkim=fail header.d=a.com; compauth=fail reason=001"), null, []).map((f) => f.id),
    ["auth.spf-fail", "auth.dkim-fail", "auth.compauth-fail"],
  );
});

test("is silent when everything passes and informative when nothing was recorded", () => {
  assert.deepEqual(authFindings(summaryOf(GMAIL), "librairie-exemple.fr", []), []);
  assert.deepEqual(authFindings({ recordedBy: null, source: null, entries: [] }, null, []).map((f) => f.id), ["auth.missing"]);
});
