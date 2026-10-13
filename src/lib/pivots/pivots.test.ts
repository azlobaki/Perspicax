import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PIVOTS, pivotUrl, pivotsFor } from "./pivots.ts";

test("fills templates with an encoded, raw or base64url value", () => {
  assert.equal(pivotUrl("https://x.example/?q={value}", "a b&c"), "https://x.example/?q=a%20b%26c");
  assert.equal(pivotUrl("https://x.example/{raw}", "a/b"), "https://x.example/a/b");
  assert.equal(
    pivotUrl("https://www.virustotal.com/gui/url/{base64url}", "https://evil.example/"),
    "https://www.virustotal.com/gui/url/aHR0cHM6Ly9ldmlsLmV4YW1wbGUv",
  );
});

test("offers the services that fit each indicator type", () => {
  const names = (type: "ip" | "domain" | "url" | "sha256" | "email", value: string) =>
    pivotsFor({ type, value, sources: [] }, DEFAULT_PIVOTS).map((p) => p.name);
  assert.deepEqual(names("ip", "185.234.72.19"), ["VirusTotal", "urlscan", "URLhaus", "WHOIS", "MXToolbox", "AbuseIPDB", "Talos", "Shodan"]);
  assert.deepEqual(names("domain", "mta-relay.click"), ["VirusTotal", "urlscan", "URLhaus", "WHOIS", "MXToolbox", "Talos"]);
  assert.deepEqual(names("url", "https://evil.example/"), ["VirusTotal", "URLhaus"]);
  assert.deepEqual(names("sha256", "ab"), ["VirusTotal"]);
  assert.deepEqual(names("email", "a@b.example"), []);
});

test("builds working URLs", () => {
  const [vt] = pivotsFor({ type: "ip", value: "185.234.72.19", sources: [] }, DEFAULT_PIVOTS);
  assert.equal(vt.url, "https://www.virustotal.com/gui/ip-address/185.234.72.19");
});
