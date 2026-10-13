import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding, FindingCategory } from "../finding.ts";
import { scoreFindings } from "./score.ts";

const finding = (id: string, category: FindingCategory, weight: number): Finding => ({
  id, category, severity: "medium", title: id, explanation: "", evidence: [], weight,
});

test("caps each category, then the total", () => {
  const score = scoreFindings([
    finding("a", "link", 30),
    finding("b", "link", 30),
    finding("c", "auth", 18),
    finding("d", "route", 25),
  ]);
  assert.deepEqual(score.categories, [
    { category: "auth", points: 18, cap: 30 },
    { category: "route", points: 10, cap: 10 },
    { category: "link", points: 40, cap: 40 },
  ]);
  assert.equal(score.score, 68);
  assert.equal(scoreFindings([finding("a", "attachment", 60), finding("b", "link", 60), finding("c", "auth", 60)]).score, 100);
});

test("maps scores to bands", () => {
  const band = (weight: number) => scoreFindings(weight ? [finding("x", "link", weight)] : []).band;
  assert.equal(band(0), "clean");
  assert.equal(band(14), "clean");
  assert.equal(band(15), "suspicious");
  assert.equal(band(39), "suspicious");
  assert.equal(band(40), "likely-phishing");
  assert.equal(scoreFindings([finding("x", "link", 40), finding("y", "auth", 29)]).band, "likely-phishing");
  assert.equal(scoreFindings([finding("x", "link", 40), finding("y", "auth", 30)]).band, "malicious");
});

test("decisive findings mean malicious indicators whatever the score", () => {
  const score = scoreFindings([finding("attachment.macros", "attachment", 18)]);
  assert.equal(score.score, 18);
  assert.equal(score.band, "malicious");
  assert.deepEqual(score.decisive, ["attachment.macros"]);
});
