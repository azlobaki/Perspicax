import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStructured } from "./params.ts";

test("reads the value and quoted parameters", () => {
  assert.deepEqual(parseStructured('multipart/mixed; boundary="----=_Part_17_2026"'), {
    value: "multipart/mixed",
    params: { boundary: "----=_Part_17_2026" },
  });
  assert.deepEqual(parseStructured('text/plain; charset="UTF-8"; format=flowed').params, {
    charset: "UTF-8",
    format: "flowed",
  });
});

test("lowercases the value and parameter names", () => {
  assert.deepEqual(parseStructured("Text/HTML;Charset=iso-8859-1"), {
    value: "text/html",
    params: { charset: "iso-8859-1" },
  });
});

test("keeps semicolons inside quotes", () => {
  assert.equal(parseStructured('attachment; filename="a;b.txt"').params.filename, "a;b.txt");
});

test("decodes RFC 2231 extended values", () => {
  assert.equal(
    parseStructured("attachment; filename*=UTF-8''Facture%20%E2%82%AC.pdf").params.filename,
    "Facture €.pdf",
  );
});

test("joins RFC 2231 continuations, encoded or not", () => {
  assert.equal(
    parseStructured('attachment; filename*0="Facture_RE-4471"; filename*1=".pdf.html"').params.filename,
    "Facture_RE-4471.pdf.html",
  );
  assert.equal(
    parseStructured("attachment; filename*0*=utf-8''%C3%A9t; filename*1*=%C3%A9.txt").params.filename,
    "été.txt",
  );
});

test("prefers the RFC 2231 value over the plain one", () => {
  assert.equal(
    parseStructured("attachment; filename=\"old.pdf\"; filename*=utf-8''new.pdf").params.filename,
    "new.pdf",
  );
});

test("decodes RFC 2047 words in quoted names but never in the boundary", () => {
  assert.equal(parseStructured('attachment; filename="=?utf-8?B?w6l0w6kucGRm?="').params.filename, "été.pdf");
  assert.equal(parseStructured('multipart/mixed; boundary="=?x?Q?y?="').params.boundary, "=?x?Q?y?=");
});
