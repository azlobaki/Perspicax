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
  assert.deepEqual(inspectPdf(pdf()).active, ["JavaScript"]);
});

const doc = (body: string) => strToU8(`%PDF-1.7\n${body}\n%%EOF`);

test("counts an opening action only when it runs script, a program or a link", () => {
  // Opening on a page, or at a zoom level, is what most PDFs do.
  assert.deepEqual(inspectPdf(doc("1 0 obj\n<< /Type /Catalog /OpenAction [3 0 R /Fit] >>\nendobj")).active, []);
  assert.deepEqual(inspectPdf(doc("1 0 obj\n<< /Type /Catalog /OpenAction 3 0 R >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj")).active, []);
  assert.deepEqual(inspectPdf(doc("1 0 obj\n<< /OpenAction << /S /GoTo /D [3 0 R /Fit] >> >>\nendobj")).active, []);

  assert.deepEqual(inspectPdf(doc("1 0 obj\n<< /OpenAction << /S /URI /URI (https://evil.top/) >> >>\nendobj")).active, ["runs an action when opened"]);
  assert.deepEqual(
    inspectPdf(doc("1 0 obj\n<< /Type /Catalog /OpenAction 7 0 R >>\nendobj\n7 0 obj\n<< /S /JavaScript /JS (app.alert\\(1\\)) >>\nendobj")).active,
    ["JavaScript", "runs an action when opened"],
  );
});

test("follows an opening action into a compressed object stream", () => {
  const objects = "<< /S /Launch /F (cmd.exe) >>";
  const header = "7 0 ";
  const packed = zlibSync(strToU8(header + objects));
  const head = strToU8(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 7 0 R >>\nendobj\n" +
    `4 0 obj\n<< /Type /ObjStm /N 1 /First ${header.length} /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`,
  );
  const tail = strToU8("\nendstream\nendobj\n%%EOF\n");
  const out = new Uint8Array(head.length + packed.length + tail.length);
  out.set(head);
  out.set(packed, head.length);
  out.set(tail, head.length + packed.length);
  assert.deepEqual(inspectPdf(out).active, ["runs an action when opened", "launches a program"]);
});

test("is quiet on a plain document", () => {
  assert.deepEqual(inspectPdf(strToU8("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")), { urls: [], active: [] });
});
