import assert from "node:assert/strict";
import { test } from "node:test";
import { findUrlsInText } from "./text.ts";

test("finds URLs in plain text without their trailing punctuation", () => {
  assert.deepEqual(
    findUrlsInText("Voir https://example.com/a. Et (www.example.org/x) puis https://en.wikipedia.org/wiki/Foo_(bar)."),
    ["https://example.com/a", "http://www.example.org/x", "https://en.wikipedia.org/wiki/Foo_(bar)"],
  );
});

test("returns nothing for text without links", () => {
  assert.deepEqual(findUrlsInText("Bonjour, rien ici."), []);
});
