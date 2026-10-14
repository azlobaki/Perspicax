import assert from "node:assert/strict";
import { test } from "node:test";
// Explicit extensions: `node --test` runs these files directly, with no
// bundler to resolve them.
import { DEFAULT_PIVOTS } from "./pivots/pivots.ts";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  THEME_BOOT_SCRIPT,
  isValidTemplate,
  normaliseDomain,
  normaliseVipName,
  parseSettings,
} from "./settings.ts";

test("defaults to the Swiss theme", () => {
  assert.equal(DEFAULT_SETTINGS.theme, "suisse");
});

test("falls back to the defaults on garbage", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("suisse"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ theme: "neon" }), DEFAULT_SETTINGS);
});

test("keeps a known theme", () => {
  assert.equal(parseSettings({ theme: "console" }).theme, "console");
  assert.equal(parseSettings({ theme: "dossier", extra: 1 }).theme, "dossier");
});

function runBootScript(stored: string | null): string | undefined {
  const attributes: Record<string, string> = {};
  const storage = { getItem: (key: string) => (key === SETTINGS_KEY ? stored : null) };
  const doc = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  new Function("localStorage", "document", THEME_BOOT_SCRIPT)(storage, doc);
  return attributes["data-theme"];
}

test("boot script applies a saved theme", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "dossier" })), "dossier");
});

test("boot script ignores unknown, broken or missing values", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "neon" })), undefined);
  assert.equal(runBootScript("{not json"), undefined);
  assert.equal(runBootScript(null), undefined);
});

test("normalises organisation domains however they are typed", () => {
  assert.equal(normaliseDomain(" Rhone-Energie.FR "), "rhone-energie.fr");
  assert.equal(normaliseDomain("https://www.example.com/path?x=1"), "www.example.com");
  assert.equal(normaliseDomain("user@example.org"), "example.org");
  assert.equal(normaliseDomain("*.example.net"), "example.net");
  assert.equal(normaliseDomain("münchen.de"), "xn--mnchen-3ya.de");
  for (const bad of ["not a domain", "localhost", "1.2.3.4", "", "exa mple.com"]) assert.equal(normaliseDomain(bad), null, bad);
});

test("keeps protected names that hold a first and a last name", () => {
  assert.equal(normaliseVipName("  Claire \t Martin "), "Claire Martin");
  assert.equal(normaliseVipName("DUPONT Jean-Pierre"), "DUPONT Jean-Pierre");
  for (const bad of ["Madonna", "", "   ", "A B", "x".repeat(81) + " y"]) assert.equal(normaliseVipName(bad), null, bad);
  assert.deepEqual(parseSettings({}).vipNames, []);
});

test("keeps valid settings and drops the rest", () => {
  const settings = parseSettings({
    theme: "console",
    orgDomains: ["Rhone-Energie.fr", "rhone-energie.fr", "nope", 42],
    vipNames: ["  Claire   Martin ", "claire martin", "Madonna", 7, "Jean-Pierre DUPONT"],
    defang: false,
    pivots: [
      { id: "a", name: "Mine", types: ["domain", "bogus"], template: "https://lookup.example/?q={value}" },
      { id: "b", name: "Broken", types: ["ip"], template: "javascript:alert(1)" },
      { id: "c", name: "", types: ["ip"], template: "https://x.example/{raw}" },
    ],
  });
  assert.deepEqual(settings, {
    theme: "console",
    orgDomains: ["rhone-energie.fr"],
    vipNames: ["Claire Martin", "Jean-Pierre DUPONT"],
    defang: false,
    pivots: [{ id: "a", name: "Mine", types: ["domain"], template: "https://lookup.example/?q={value}" }],
  });
});

test("defaults: defanged, built-in pivots; an emptied pivot list stays empty", () => {
  assert.equal(parseSettings({}).defang, true);
  assert.equal(parseSettings({}).pivots, DEFAULT_PIVOTS);
  assert.deepEqual(parseSettings({ pivots: [] }).pivots, []);
  assert.equal(parseSettings({ pivots: "garbage" }).pivots, DEFAULT_PIVOTS);
});

test("accepts only http(s) templates with a placeholder", () => {
  assert.ok(isValidTemplate("https://x.example/{base64url}"));
  assert.ok(!isValidTemplate("https://x.example/static"));
  assert.ok(!isValidTemplate("ftp://x.example/{value}"));
});
