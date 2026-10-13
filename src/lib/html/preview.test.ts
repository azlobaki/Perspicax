import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Attachment } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parse } from "../testing/dom.ts";
import { PREVIEW_CSP, buildPreview } from "./preview.ts";

const preview = (html: string, attachments: Attachment[] = []) => buildPreview(html, parse, attachments);

test("puts the CSP first and keeps nothing that can reach the network", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const out = preview(email.html ?? "");
  assert.match(out, /^<!doctype html>/i);
  const head = parse(out).head;
  assert.equal(head.firstElementChild?.getAttribute("http-equiv"), "Content-Security-Policy");
  assert.equal(head.firstElementChild?.getAttribute("content"), PREVIEW_CSP);
  assert.doesNotMatch(out, /(src|href|background|action)="https?:/i);
  assert.doesNotMatch(out, /mta-relay\.click/);
  assert.match(out, /data:image\/svg\+xml/);
  assert.match(out, /title="Link disabled in preview: https:\/\/eur01\.safelinks/);
});

test("removes scripts, frames, plugins, refreshes, bases and event handlers", () => {
  const out = preview(`<html><head><meta http-equiv="refresh" content="0;url=https://x/"><base href="https://x/">
    <link rel="stylesheet" href="https://x/a.css"><script>alert(1)</script></head>
    <body onload="alert(2)"><iframe src="https://x/"></iframe><object data="https://x/o"></object><embed src="https://x/e">
    <img src="x" onerror="alert(3)"><svg><image href="https://x/i.png"/><use xlink:href="https://x/u.svg#a"/></svg>
    <form action="https://x/post"><input type="image" src="https://x/b.png"></form></body></html>`);
  assert.doesNotMatch(out, /<script|<iframe|<object|<embed|<base|<link|refresh|onload|onerror|https:\/\/x/i);
});

test("neutralises remote CSS but keeps local styling", () => {
  const out = preview(`<style>@import url(https://x/y.css); .a { background: url('https://x/b.png') no-repeat; color: red }</style>
    <div class="a" style="background-image:url(https://x/c.png); padding: 4px">hi</div>`);
  assert.doesNotMatch(out, /https:\/\/x/);
  assert.match(out, /color: red/);
  assert.match(out, /padding: 4px/);
});

test("shows embedded cid: images and inline data: images", () => {
  const logo: Attachment = {
    filename: "logo.png", contentType: "image/png", contentId: "logo@example", inline: true,
    data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  };
  const out = preview(`<img src="cid:logo@example"><img src="data:image/gif;base64,R0lGOD">`, [logo]);
  assert.match(out, /src="data:image\/png;base64,iVBORw=="/);
  assert.match(out, /src="data:image\/gif;base64,R0lGOD"/);
});
