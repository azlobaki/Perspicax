import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDelay, formatSize, formatTime, formatUtc } from "./format.ts";

const DATE = new Date("2026-10-13T07:14:01Z");

test("formats times in UTC whatever the locale", () => {
  assert.equal(formatUtc(DATE), "2026-10-13 07:14:01 UTC");
  assert.equal(formatTime(DATE), "07:14:01Z");
});

test("formats relay delays", () => {
  assert.equal(formatDelay(null), "—");
  assert.equal(formatDelay(0), "+0 s");
  assert.equal(formatDelay(90), "+90 s");
  assert.equal(formatDelay(600), "+10 min");
  assert.equal(formatDelay(-3600), "−60 min");
  assert.equal(formatDelay(86_400), "+24 h");
});

test("formats sizes", () => {
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(49_357), "48.2 KB");
  assert.equal(formatSize(3_500_000), "3.3 MB");
});

test("formats sizes in the reader's language", () => {
  assert.equal(formatSize(6656, "en"), "6.5 KB");
  assert.equal(formatSize(6656, "fr"), "6,5\u00a0Ko");
  assert.equal(formatSize(512, "fr"), "512\u00a0o");
  assert.equal(formatSize(3 * 1024 * 1024, "fr"), "3,0\u00a0Mo");
  assert.equal(formatSize(6656), "6.5 KB");
});
