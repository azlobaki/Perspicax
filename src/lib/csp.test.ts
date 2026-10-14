import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HEADER_CSP, PAGE_CSP } from "./csp.ts";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const served = Object.fromEntries(
  vercel.headers.find((rule) => rule.source === "/(.*)")?.headers.map((h) => [h.key, h.value]) ?? [],
);

test("the served CSP is the page's, plus what only a header can say", () => {
  assert.equal(HEADER_CSP, `${PAGE_CSP}; frame-ancestors 'none'`);
  assert.equal(served["Content-Security-Policy"], HEADER_CSP);
  assert.match(PAGE_CSP, /connect-src 'none'/);
});

test("every page is served with the other security headers", () => {
  assert.equal(served["X-Content-Type-Options"], "nosniff");
  assert.equal(served["Referrer-Policy"], "no-referrer");
  assert.equal(served["X-Frame-Options"], "DENY");
  assert.equal(served["Cross-Origin-Opener-Policy"], "same-origin");
  assert.match(served["Permissions-Policy"] ?? "", /camera=\(\)/);
});
