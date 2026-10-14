import assert from "node:assert/strict";
import { test } from "node:test";
import { browserLanguages, detectLocale, isLocale } from "./text.ts";

test("French for any French browser, English otherwise", () => {
  assert.equal(detectLocale(["fr-FR", "en-US"]), "fr");
  assert.equal(detectLocale(["fr"]), "fr");
  assert.equal(detectLocale(["FR-ca"]), "fr");
  assert.equal(detectLocale(["de-DE", "fr-FR"]), "fr");
  assert.equal(detectLocale(["en-GB"]), "en");
  assert.equal(detectLocale(["es"]), "en");
  assert.equal(detectLocale([]), "en");
});

test("knows its locales", () => {
  assert.equal(isLocale("fr"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(null), false);
});

test("falls back to navigator.language when navigator.languages is empty", () => {
  assert.deepEqual(browserLanguages({ languages: ["fr-FR", "en"], language: "de" }), ["fr-FR", "en"]);
  assert.deepEqual(browserLanguages({ languages: [], language: "fr-FR" }), ["fr-FR"]);
  assert.deepEqual(browserLanguages({ language: "fr" }), ["fr"]);
  assert.deepEqual(browserLanguages({}), [""]);
  assert.equal(detectLocale(browserLanguages({ languages: [], language: "fr-CA" })), "fr");
});
