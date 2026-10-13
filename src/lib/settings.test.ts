import assert from "node:assert/strict";
import { test } from "node:test";
// Explicit extensions: `node --test` runs these files directly, with no
// bundler to resolve them.
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  THEME_BOOT_SCRIPT,
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
