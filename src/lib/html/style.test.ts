import assert from "node:assert/strict";
import { test } from "node:test";
import { cssUrls, hiddenReason, normaliseColor, parseStyle, parseStylesheet } from "./style.ts";

const reason = (style: string) => hiddenReason(parseStyle(style));

test("parses declarations, ignoring case and !important", () => {
  assert.deepEqual([...parseStyle("Display: NONE !important; color:#FFF;;bad").entries()], [
    ["display", "none"],
    ["color", "#fff"],
  ]);
});

test("recognises the ways mail hides content", () => {
  assert.equal(reason("display:none"), "display:none");
  assert.equal(reason("visibility:hidden"), "visibility:hidden");
  assert.equal(reason("opacity:0"), "opacity:0");
  assert.equal(reason("font-size:0px"), "font-size:0");
  assert.equal(reason("max-height:0;overflow:hidden"), "zero size");
  assert.equal(reason("position:absolute;left:-9999px"), "off-screen");
  assert.equal(reason("text-indent:-5000px"), "off-screen");
});

test("does not mistake visible styles for hidden ones", () => {
  assert.equal(reason("display:block;opacity:0.5;font-size:14px"), null);
  assert.equal(reason("max-height:0"), null);
  assert.equal(reason("font-size:"), null);
});

test("normalises colours", () => {
  assert.equal(normaliseColor("#FFF"), "#ffffff");
  assert.equal(normaliseColor("white"), "#ffffff");
  assert.equal(normaliseColor("rgb(255, 255, 255)"), "#ffffff");
  assert.equal(normaliseColor("transparent"), null);
  assert.equal(normaliseColor(undefined), null);
});

test("reads hiding rules, except those a media query reverses", () => {
  const rules = parseStylesheet(`
    /* responsive */
    .preheader { display:none; max-height:0; overflow:hidden }
    #trap, td .hide { visibility: hidden }
    .mobile { display:none }
    @media screen and (max-width: 600px) { .mobile { display:block !important } }
  `);
  assert.equal(rules.hidden.get(".preheader"), "display:none");
  assert.equal(rules.hidden.get("#trap"), "visibility:hidden");
  assert.equal(rules.hidden.get(".hide"), "visibility:hidden");
  assert.ok(rules.revealed.has(".mobile"));
});

test("collects url() and @import targets", () => {
  assert.deepEqual(cssUrls(`@import "https://x.example/a.css"; .a { background: url('https://t.example/p.gif') no-repeat }`), [
    "https://t.example/p.gif",
    "https://x.example/a.css",
  ]);
});
