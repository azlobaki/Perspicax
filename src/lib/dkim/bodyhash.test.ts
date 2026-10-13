import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail, parseHeadersOnly } from "../mime/parse.ts";
import { canonicalizeBody, checkBodyHash, dkimChecks, dkimFindings, parseDkimSignature, type DkimSignature } from "./bodyhash.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (s: string) => new TextEncoder().encode(s);
const sha256 = (s: string) => createHash("sha256").update(s).digest("base64");
const fixture = () => parseEmail(readFileSync(new URL("../../../fixtures/clean-newsletter.eml", import.meta.url)));

test("parses a folded DKIM-Signature", () => {
  assert.deepEqual(
    parseDkimSignature("v=1; a=rsa-sha256; c=relaxed/simple; d=Example.COM;\r\n s=sel; l=12; bh=ab cd\r\n ef=; b=xyz"),
    { domain: "example.com", selector: "sel", algorithm: "rsa-sha256", headerCanon: "relaxed", bodyCanon: "simple", bodyHash: "abcdef=", length: 12 },
  );
  assert.equal(parseDkimSignature("v=1; a=rsa-sha256; c=relaxed; d=x.com; s=s; bh=aa=; b=bb")?.bodyCanon, "simple");
  assert.equal(parseDkimSignature("v=1; d=x.com"), null);
});

test("canonicalises bodies as RFC 6376 says", () => {
  assert.equal(text(canonicalizeBody(bytes("Hi  there \r\n\r\n\r\n"), "simple")), "Hi  there \r\n");
  assert.equal(text(canonicalizeBody(bytes("Hi  there \r\n\r\n\r\n"), "relaxed")), "Hi there\r\n");
  assert.equal(text(canonicalizeBody(bytes("a\t b\n \n"), "relaxed")), "a b\r\n");
  assert.equal(text(canonicalizeBody(bytes("no final break"), "simple")), "no final break\r\n");
  assert.equal(text(canonicalizeBody(new Uint8Array(0), "simple")), "\r\n");
  assert.equal(canonicalizeBody(new Uint8Array(0), "relaxed").length, 0);
});

const signature = (overrides: Partial<DkimSignature>): DkimSignature => ({
  domain: "x.com", selector: "s", algorithm: "rsa-sha256", headerCanon: "relaxed", bodyCanon: "relaxed",
  bodyHash: "", length: null, ...overrides,
});

test("compares body hashes, honouring l=", async () => {
  assert.equal(await checkBodyHash(signature({ bodyHash: sha256("abc\r\n") }), bytes("abc\n")), "match");
  assert.equal(await checkBodyHash(signature({ bodyHash: sha256("abc\r\n"), length: 5 }), bytes("abc\nextra lines\n")), "match");
  assert.equal(await checkBodyHash(signature({ bodyHash: sha256("abc\r\n") }), bytes("abd\n")), "mismatch");
  assert.equal(await checkBodyHash(signature({ algorithm: "rsa-md5" }), bytes("abc")), "unsupported");
});

test("the clean newsletter's body is the one its sender signed", async () => {
  const checks = await dkimChecks(fixture());
  assert.deepEqual(checks.map((c) => [c.signature.domain, c.result]), [["librairie-exemple.fr", "match"]]);
  assert.deepEqual(dkimFindings(checks), []);
});

test("an edited body no longer matches", async () => {
  const email = fixture();
  const edited = text(email.rawBody ?? new Uint8Array()).replace("Bonjour Claire", "Bonjour Clara");
  const checks = await dkimChecks({ ...email, rawBody: bytes(edited) });
  assert.equal(checks[0].result, "mismatch");
  const [finding] = dkimFindings(checks);
  assert.equal(finding.id, "dkim.body-modified");
  assert.deepEqual(finding.evidence, ["d=librairie-exemple.fr s=s1 c=relaxed/relaxed"]);
});

test("has nothing to check without a body", async () => {
  assert.deepEqual(await dkimChecks(parseHeadersOnly("DKIM-Signature: v=1; a=rsa-sha256; d=x.com; s=s; bh=aa=; b=bb")), []);
});
