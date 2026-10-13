import assert from "node:assert/strict";
import { test } from "node:test";
import { dateFindings, parseMailDate } from "./date.ts";
import type { Hop } from "./received.ts";

const iso = (value: string) => parseMailDate(value)?.toISOString() ?? null;

test("parses RFC 5322 dates with numeric zones and comments", () => {
  assert.equal(iso("Tue, 13 Oct 2026 09:14:02 +0200 (CEST)"), "2026-10-13T07:14:02.000Z");
  assert.equal(iso("Tue, 13 Oct 2026 06:02:09.000 +0000 (UTC)"), "2026-10-13T06:02:09.000Z");
});

test("parses obsolete forms: two-digit years, no seconds, named zones", () => {
  assert.equal(iso("13 Oct 26 07:14 GMT"), "2026-10-13T07:14:00.000Z");
  assert.equal(iso("Mon, 12 Oct 2026 23:02:11 PDT"), "2026-10-13T06:02:11.000Z");
});

test("parses ISO-style stamps some relays write", () => {
  assert.equal(iso("2026-10-13 06:02:09.123456789 +0000 UTC m=+1234.5"), "2026-10-13T06:02:09.000Z");
});

test("returns null instead of guessing", () => {
  assert.equal(parseMailDate("yesterday"), null);
  assert.equal(parseMailDate("32 Oct 2026 10:00:00 +0000"), null);
});

function hopAt(index: number, isoDate: string): Hop {
  return {
    index, helo: null, rdns: null, ip: null, ipScope: null, by: null, protocol: null, tls: false,
    date: new Date(isoDate), delay: null, heloMismatch: false, raw: "",
  };
}

test("flags a missing or unreadable Date header", () => {
  assert.deepEqual(dateFindings(null, []).map((f) => f.id), ["route.date-missing"]);
  assert.deepEqual(dateFindings("soon", []).map((f) => f.id), ["route.date-unreadable"]);
});

test("flags dates in the future of delivery and long before relaying", () => {
  const hops = [hopAt(1, "2026-10-13T07:14:02Z"), hopAt(2, "2026-10-13T07:14:04Z")];
  assert.deepEqual(dateFindings("Tue, 13 Oct 2026 07:14:01 +0000", hops), []);
  assert.deepEqual(dateFindings("Tue, 13 Oct 2026 12:00:00 +0000", hops).map((f) => f.id), ["route.date-future"]);
  assert.deepEqual(dateFindings("Thu, 1 Oct 2026 07:00:00 +0000", hops).map((f) => f.id), ["route.date-old"]);
});
