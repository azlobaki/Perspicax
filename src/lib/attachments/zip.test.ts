import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { listZip, readZipEntry } from "./zip.ts";

const archive = () =>
  zipSync({
    "docs/readme.txt": strToU8("hello zip"),
    "été.pdf": [new Uint8Array(4096).fill(65), { level: 0 }],
  });

test("lists entries from the central directory", () => {
  const entries = listZip(archive());
  assert.deepEqual(entries?.map((e) => [e.name, e.size, e.encrypted]), [
    ["docs/readme.txt", 9, false],
    ["été.pdf", 4096, false],
  ]);
});

test("reads stored and deflated entries", () => {
  const data = archive();
  const entries = listZip(data) ?? [];
  assert.equal(new TextDecoder().decode(readZipEntry(data, entries[0]) ?? new Uint8Array()), "hello zip");
  assert.equal(readZipEntry(data, entries[1])?.length, 4096);
});

test("notices encrypted entries and does not read them", () => {
  const data = archive();
  const central = data.findIndex((_, i) => data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 1 && data[i + 3] === 2);
  data[central + 8] |= 1; // general-purpose flag bit 0: encrypted
  const [first] = listZip(data) ?? [];
  assert.equal(first.encrypted, true);
  assert.equal(readZipEntry(data, first), null);
});

test("returns null for data that is not a ZIP", () => {
  assert.equal(listZip(new TextEncoder().encode("not a zip at all")), null);
});
