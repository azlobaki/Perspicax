import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTestHtml as parse } from "../testing/dom.ts";
import { extractHtml } from "./extract.ts";

const extract = (html: string) => extractHtml(parse(html));

test("collects links with their visible text, in document order", () => {
  const { links } = extract(`<base href="https://x.example/a/">
    <p><a href="https://example.com/x">  Example
      site </a><map><area href="https://map.example/" alt="Map"></map></p>
    <a href="#top">top</a>`);
  assert.deepEqual(
    links.map((l) => [l.origin, l.raw, l.text]),
    [["a", "https://example.com/x", "Example site"], ["area", "https://map.example/", "Map"], ["a", "#top", "top"]],
  );
});

test("reads the document base", () => {
  assert.equal(extract(`<html><head><base href="https://x.example/a/"></head><body><a href="p">p</a></body></html>`).base, "https://x.example/a/");
});

test("collects every remote resource", () => {
  const { links } = extract(`<html><head>
      <link rel="stylesheet" href="https://cdn.example/a.css">
      <meta http-equiv="refresh" content="0; url=https://next.example/">
      <style>.a { background: url(https://t.example/bg.png) }</style>
    </head><body background="https://t.example/body.jpg">
      <img src="https://t.example/o.gif" width="1" height="1">
      <div style="background-image:url('https://t.example/div.png')"></div>
      <iframe src="https://frame.example/"></iframe>
      <video src="https://media.example/v.mp4"></video>
      <input type="image" src="https://t.example/btn.png">
    </body></html>`);
  assert.deepEqual(links.map((l) => [l.origin, l.raw]).sort(), [
    ["css", "https://t.example/bg.png"],
    ["css", "https://t.example/div.png"],
    ["frame", "https://frame.example/"],
    ["img", "https://t.example/body.jpg"],
    ["img", "https://t.example/btn.png"],
    ["img", "https://t.example/o.gif"],
    ["link", "https://cdn.example/a.css"],
    ["media", "https://media.example/v.mp4"],
    ["meta-refresh", "https://next.example/"],
  ]);
  const pixel = links.find((l) => l.raw.endsWith("o.gif"));
  assert.equal(pixel?.width, 1);
  assert.equal(pixel?.height, 1);
});

test("explains why a link is hidden, through its ancestors and stylesheets", () => {
  const { links } = extract(`<style>
      .trap { display:none }
      .mobile { display:none }
      @media (max-width:600px) { .mobile { display:block !important } }
    </style>
    <div style="display:none"><span><a href="https://a.example/">a</a></span></div>
    <p class="trap"><a href="https://b.example/">b</a></p>
    <div class="mobile" style="display:none"><a href="https://c.example/">c</a></div>
    <p hidden><a href="https://d.example/">d</a></p>
    <table bgcolor="#ffffff"><tr><td><a href="https://e.example/" style="color:#fff">e</a></td></tr></table>
    <a href="https://f.example/">f</a>`);
  assert.deepEqual(
    links.map((l) => [l.raw, l.hidden]),
    [
      ["https://a.example/", "display:none"],
      ["https://b.example/", "display:none"],
      ["https://c.example/", null],
      ["https://d.example/", "hidden attribute"],
      ["https://e.example/", "same colour as background"],
      ["https://f.example/", null],
    ],
  );
});

test("describes forms", () => {
  const { forms, links } = extract(`<form action="https://evil.example/login" method="POST">
      <input type="email" name="email"><input type="password" name="pass"><input type="hidden" name="t">
    </form><form><input name="q"></form>`);
  assert.deepEqual(forms, [
    { action: "https://evil.example/login", method: "post", fields: ["email", "pass", "t"], hasPassword: true },
    { action: "", method: "get", fields: ["q"], hasPassword: false },
  ]);
  assert.deepEqual(links.map((l) => [l.origin, l.raw]), [["form", "https://evil.example/login"]]);
});

test("finds words broken by invisible characters and direction overrides in visible text only", () => {
  const result = extract(`<p>Vé​rifiez votre com​pte, ‮fdp.exe</p>
    <div style="display:none">pre​header pa​dding</div>
    <p>café ‍ emoji</p>`);
  assert.deepEqual(result.brokenWords, ["Vé·rifiez", "com·pte"]);
  assert.equal(result.bidiOverrides, 1);
});

test("joins text a parser split at entities before looking for broken words", () => {
  assert.deepEqual(extract(`<p>V&#233;&#8203;rifiez votre com&#8203;pte</p><p>a</p><p>b</p>`).brokenWords, ["Vé·rifiez", "com·pte"]);
});
