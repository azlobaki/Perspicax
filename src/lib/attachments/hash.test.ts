import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashes, md5 } from "./hash.ts";

const node = (algo: string, data: Uint8Array) => createHash(algo).update(data).digest("hex");

test("computes MD5 on the RFC 1321 test vectors", () => {
  assert.equal(md5(new Uint8Array(0)), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5(new TextEncoder().encode("abc")), "900150983cd24fb0d6963f7d28e17f72");
});

test("matches Node's MD5 around block boundaries and on large inputs", () => {
  for (const size of [55, 56, 63, 64, 65, 119, 120, 1_000_003]) {
    const data = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 7) & 0xff);
    assert.equal(md5(data), node("md5", data), `size ${size}`);
  }
});

test("computes all three hashes", async () => {
  const data = new TextEncoder().encode("Perspicax");
  assert.deepEqual(await hashes(data), {
    md5: node("md5", data),
    sha1: node("sha1", data),
    sha256: node("sha256", data),
  });
});
