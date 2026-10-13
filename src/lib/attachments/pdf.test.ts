import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zlibSync } from "fflate";
import { inspectPdf } from "./pdf.ts";

function pdf(): Uint8Array {
  const plain =
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 3 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://evil.example/plain\\(1\\)) >> >>\nendobj\n" +
    "5 0 obj\n<< /A << /S /URI /URI <68747470733a2f2f6865782e6578616d706c652f> >> >>\nendobj\n";
  const packed = zlibSync(strToU8("<< /A << /S /URI /URI (https://evil.example/packed) >> >> << /S /JavaScript /JS (app.alert\\(1\\)) >>"));
  const head = strToU8(`${plain}4 0 obj\n<< /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`);
  const tail = strToU8("\nendstream\nendobj\n%%EOF\n");
  const out = new Uint8Array(head.length + packed.length + tail.length);
  out.set(head);
  out.set(packed, head.length);
  out.set(tail, head.length + packed.length);
  return out;
}

test("collects links from plain, hex and compressed objects", () => {
  assert.deepEqual(inspectPdf(pdf()).urls, [
    "https://evil.example/plain(1)",
    "https://hex.example/",
    "https://evil.example/packed",
  ]);
});

test("names active content", () => {
  assert.deepEqual(inspectPdf(pdf()).active, ["JavaScript", "runs an action when opened"]);
});

test("is quiet on a plain document", () => {
  assert.deepEqual(inspectPdf(strToU8("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")), { urls: [], active: [] });
});
