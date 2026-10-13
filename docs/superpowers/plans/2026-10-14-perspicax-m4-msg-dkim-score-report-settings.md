# Perspicax — Milestone 4 Implementation Plan (.msg, DKIM body hash, score, report, settings)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outlook `.msg` files open like `.eml`; DKIM body hashes are checked offline; every email gets an explainable 0–100 score and a verdict band shown in each theme's style; the analysis exports as a Markdown ticket report (defanged by default) or JSON; organisation domains, the defang default and pivot services are editable settings.

**Architecture:** `msg/` maps an OLE compound file (via `cfb`) onto the same `ParsedEmail` as `mime/`; `dkim/` canonicalises the raw body and compares its hash with each signature's `bh=`; `score/` sums finding weights with a cap per category and escalates to "malicious indicators" on decisive findings; `report/` renders an `EmailReport` as Markdown or JSON; `settings.ts` grows `orgDomains`, `defang` and `pivots`, validated on read. The page keeps the parsed email and re-analyses it when the organisation's domains change.

**Tech Stack:** unchanged (Next.js static export, React 19, Tailwind 4, `node:test`, `fflate`, `cfb`, `jsqr`; `linkedom` for tests).

**Spec:** `docs/design/2026-10-13-perspicax-design.md` — milestone 4 of §7 (`msg/`, `dkim/`, `score/`, report export, settings), §3 module table, §4 settings, §8 score block per theme.

## Global Constraints

Everything in milestones 1–3's Global Constraints still applies (stack, no network at runtime, nothing persisted but settings under `perspicax.settings.v1`, `.ts` runtime imports in `src/lib/`, no TS syntax Node cannot strip, ES2017 regexes, tokens-only styling, the engine never builds a DOM, only `fflate`/`cfb`/`jsqr` at runtime, author `azlobaki`, no Claude/Anthropic mention, no `CLAUDE.md`). In addition:

- DKIM: only the body hash is checked; signature verification needs DNS and stays out of scope (spec §3).
- Score bands on 0–100: clean 0–14, suspicious 15–39, likely phishing 40–69, malicious indicators 70–100; any decisive attachment finding (smuggling, program, script, shortcut, macros, hidden program in an archive, disk image, remote template) makes the band "malicious indicators" whatever the score.
- Category caps: auth 30, sender 25, route 10, vendor 25, link 40, html 30, attachment 45.
- The Markdown report is defanged by default (setting); the JSON export is raw, for machines.
- Settings read from `localStorage` are untrusted: every field is re-validated, invalid entries dropped.

## File structure (added or changed in milestone 4)

```
src/lib/email.ts               ParsedEmail.rawBody
src/lib/dkim/bodyhash.ts       DKIM-Signature parsing, body canonicalisation, body-hash check
src/lib/msg/parse.ts           Outlook .msg → ParsedEmail
scripts/make-msg-fixture.mjs   builds fixtures/docusign.msg (reproducible)
src/lib/score/score.ts         score and verdict band
src/lib/ioc/types.ts           IOC_TYPES / IocType / Ioc (light module, shared with settings)
src/lib/settings.ts            orgDomains, defang, pivots
src/lib/report/markdown.ts     ticket report
src/lib/report/json.ts         machine export
src/components/VerdictBlock.tsx, ExportBar.tsx, SettingsPanel.tsx (+ TopBar, ReportView, HeadersTab, IocsTab, CopyButton, EntryPanel, page)
```

---

### Task 1: Raw body and DKIM body hash

**Files:**
- Modify: `src/lib/email.ts`, `src/lib/mime/parse.ts`, `src/lib/links/analyze.test.ts` (helper), `fixtures/clean-newsletter.eml` (add a DKIM-Signature)
- Create: `src/lib/dkim/bodyhash.ts`, `src/lib/dkim/bodyhash.test.ts`

**Interfaces:**
- Produces: `ParsedEmail.rawBody: Uint8Array | null`; `DkimSignature = { domain; selector; algorithm; headerCanon: "simple" | "relaxed"; bodyCanon: "simple" | "relaxed"; bodyHash: string; length: number | null }`, `parseDkimSignature(value: string): DkimSignature | null`, `canonicalizeBody(body: Uint8Array, mode: "simple" | "relaxed"): Uint8Array`, `DkimCheck = { signature: DkimSignature; result: "match" | "mismatch" | "unsupported" }`, `checkBodyHash(signature, body): Promise<DkimCheck["result"]>`, `dkimChecks(email: ParsedEmail): Promise<DkimCheck[]>`, `dkimFindings(checks: readonly DkimCheck[]): Finding[]`.

- [ ] **Step 1: Keep the raw body**

In `src/lib/email.ts`, add to `ParsedEmail`, after `raw: string;`:

```ts
  /** Body bytes exactly as in the file, after the header block: what DKIM signed. Null for .msg and pasted headers. */
  rawBody: Uint8Array | null;
```

In `src/lib/mime/parse.ts`, replace the start of `parseEmail`

```ts
  const warnings: string[] = [];
  const root = parsePart(bytesToBinary(bytes), 0, warnings);
```

with

```ts
  const warnings: string[] = [];
  const binary = bytesToBinary(bytes);
  const root = parsePart(binary, 0, warnings);
```

and in the `email` object literal of `parseEmail`, after `raw: decodeUtf8OrLegacy(bytes),` add `rawBody: binaryToBytes(splitHeaderBody(binary).body),`. In `parseHeadersOnly`'s returned object, after `raw: trimmed,` add `rawBody: null,`.

In `src/lib/links/analyze.test.ts`, in the `htmlEmail` helper object, after `raw: "",` add `rawBody: null,`.

- [ ] **Step 2: Sign the clean newsletter**

In `fixtures/clean-newsletter.eml`, insert these lines immediately before the `From: Librairie Exemple <lettre@librairie-exemple.fr>` line (the body is unchanged, so the body hash below — computed independently with relaxed canonicalisation — is its real one):

```
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=librairie-exemple.fr;
        s=s1; h=from:to:subject:date:message-id:mime-version:content-type;
        bh=S00e+7KhCBp8lX8P5jbJWAv2WT1A0b5fBpAuErQ5WP4=;
        b=Xy12abCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnopqrstuvwx
```

- [ ] **Step 3: Write the failing test**

```ts file=src/lib/dkim/bodyhash.test.ts
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
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `dkim/bodyhash.ts`.

- [ ] **Step 5: Implement**

```ts file=src/lib/dkim/bodyhash.ts
import type { ParsedEmail } from "../email.ts";
import type { Finding } from "../finding.ts";
import { binaryToBytes, bytesToBinary } from "../mime/bytes.ts";
import { getHeaders } from "../mime/headers.ts";

type Canon = "simple" | "relaxed";

export type DkimSignature = {
  domain: string;
  selector: string;
  algorithm: string;
  headerCanon: Canon;
  bodyCanon: Canon;
  /** `bh=`, base64. */
  bodyHash: string;
  /** `l=`: only this many canonical body bytes were signed. */
  length: number | null;
};

const canon = (value: string | undefined): Canon => (value === "relaxed" ? "relaxed" : "simple");

export function parseDkimSignature(value: string): DkimSignature | null {
  const tags = new Map<string, string>();
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).replace(/\s+/g, ""));
  }
  const domain = tags.get("d");
  const bodyHash = tags.get("bh");
  const algorithm = (tags.get("a") ?? "").toLowerCase();
  if (!domain || !bodyHash || !algorithm) return null;
  const [header, body] = (tags.get("c") ?? "simple/simple").toLowerCase().split("/");
  const length = tags.has("l") ? Number(tags.get("l")) : null;
  return {
    domain: domain.toLowerCase(),
    selector: tags.get("s") ?? "",
    algorithm,
    headerCanon: canon(header),
    bodyCanon: canon(body),
    bodyHash,
    length: length !== null && Number.isFinite(length) ? length : null,
  };
}

/**
 * RFC 6376 §3.4.3–3.4.4. Line ends are normalised to CRLF first: a message
 * saved to disk on Unix has lost them, but they are what was signed.
 */
export function canonicalizeBody(body: Uint8Array, mode: Canon): Uint8Array {
  let lines = bytesToBinary(body).split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop(); // the final line break, not an empty line
  if (mode === "relaxed") lines = lines.map((line) => line.replace(/[ \t]+/g, " ").replace(/ $/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return mode === "simple" ? binaryToBytes("\r\n") : new Uint8Array(0);
  return binaryToBytes(lines.map((line) => `${line}\r\n`).join(""));
}

export type DkimCheck = { signature: DkimSignature; result: "match" | "mismatch" | "unsupported" };

const DIGESTS: Record<string, string> = { "rsa-sha256": "SHA-256", "ed25519-sha256": "SHA-256", "rsa-sha1": "SHA-1" };

export async function checkBodyHash(signature: DkimSignature, body: Uint8Array): Promise<DkimCheck["result"]> {
  const digest = DIGESTS[signature.algorithm];
  if (!digest) return "unsupported";
  let canonical = canonicalizeBody(body, signature.bodyCanon);
  if (signature.length !== null) canonical = canonical.subarray(0, signature.length);
  const hash = new Uint8Array(await crypto.subtle.digest(digest, canonical.slice()));
  return btoa(bytesToBinary(hash)) === signature.bodyHash ? "match" : "mismatch";
}

/** Every DKIM-Signature's body hash against this file's body. The signature itself needs DNS and is not verified. */
export async function dkimChecks(email: ParsedEmail): Promise<DkimCheck[]> {
  if (email.rawBody === null) return [];
  const checks: DkimCheck[] = [];
  for (const value of getHeaders(email.headers, "dkim-signature")) {
    const signature = parseDkimSignature(value);
    if (signature) checks.push({ signature, result: await checkBodyHash(signature, email.rawBody) });
  }
  return checks;
}

export function dkimFindings(checks: readonly DkimCheck[]): Finding[] {
  const changed = checks.filter((check) => check.result === "mismatch");
  if (changed.length === 0) return [];
  return [{
    id: "dkim.body-modified", category: "auth", severity: "medium", title: "Body changed after signing",
    explanation:
      "The body hash in the DKIM signature does not match this file's body: the content was altered after the sender signed it — by a gateway adding a banner, by forwarding, or by tampering.",
    evidence: changed.map((c) => `d=${c.signature.domain} s=${c.signature.selector} c=${c.signature.headerCanon}/${c.signature.bodyCanon}`),
    weight: 6,
  }];
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (the milestone 1–3 tests still pass on the newsletter with its new header).

- [ ] **Step 7: Commit**

```bash
git add src/lib/email.ts src/lib/mime/parse.ts src/lib/links/analyze.test.ts src/lib/dkim fixtures/clean-newsletter.eml
git commit -m "Check DKIM body hashes offline

parseEmail now keeps the body bytes exactly as in the file. Each
DKIM-Signature's body is canonicalised (simple or relaxed, CRLF restored,
l= honoured) and hashed, and a hash that no longer matches becomes a
finding: the body was changed after signing. Verifying the signature
itself needs the sender's DNS key and stays out of scope.

The clean newsletter gains a DKIM-Signature whose body hash was computed
independently, so the check is exercised on a real match."
```

---

### Task 2: Outlook .msg files

**Files:**
- Create: `scripts/make-msg-fixture.mjs`, `fixtures/docusign.msg` (generated)
- Create: `src/lib/msg/parse.ts`, `src/lib/msg/parse.test.ts`

**Interfaces:**
- Consumes: `cfb`, `parseHeaderBlock`, `bytesToBinary`, `decodeUtf8OrLegacy`, `decodeText`, `ParsedEmail`.
- Produces: `parseMsg(bytes: Uint8Array): ParsedEmail` (throws on files that are not compound files).

- [ ] **Step 1: Fixture generator**

```js file=scripts/make-msg-fixture.mjs
// Builds fixtures/docusign.msg: a synthetic Outlook message — a DocuSign
// lookalike received through Exchange Online, with an HTML body and a PDF
// attachment that both point to a domain disguised as docusign.net.
// Run `node scripts/make-msg-fixture.mjs`; the output is reproducible byte for byte.
import { writeFileSync } from "node:fs";
import * as CFB from "cfb";

const utf16 = (text) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[2 * i] = text.charCodeAt(i) & 0xff;
    out[2 * i + 1] = text.charCodeAt(i) >> 8;
  }
  return out;
};
const utf8 = (text) => new TextEncoder().encode(text);

const LINK = "https://docusign.net.review-envelope.xyz/e/4471";
const HEADERS = [
  "Received: from AM9PR04MB8456.eurprd04.prod.outlook.com (2603:10a6:20b:40f::7)",
  " by DB9PR04MB8301.eurprd04.prod.outlook.com with HTTPS; Wed, 14 Oct 2026",
  " 08:21:07 +0000",
  "Authentication-Results: spf=pass (sender IP is 193.37.255.61)",
  " smtp.mailfrom=envelope-notice.xyz; dkim=none (message not signed)",
  " header.d=none;dmarc=none action=none header.from=envelope-notice.xyz;compauth=fail",
  " reason=601",
  "Received: from mta.envelope-notice.xyz (193.37.255.61) by",
  " AM9PR04MB8456.mail.protection.outlook.com (10.167.242.18) with Microsoft SMTP",
  " Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.8093.1 via",
  " Frontend Transport; Wed, 14 Oct 2026 08:21:06 +0000",
  "From: DocuSign <dse@envelope-notice.xyz>",
  "To: <j.martin@rhone-energie.fr>",
  "Subject: Contrat 4471 : document en attente de signature",
  "Date: Wed, 14 Oct 2026 08:21:05 +0000",
  "Message-ID: <4471.envelope@envelope-notice.xyz>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="_docusign_4471_"',
  "",
  "",
].join("\r\n");
const TEXT = `Vous avez reçu un document à signer : Contrat 4471.\r\nConsulter le document : ${LINK}\r\n`;
const HTML = `<html><head><meta charset="utf-8"></head><body><p>Vous avez reçu un document à signer : Contrat 4471.</p><p><a href="${LINK}">Consulter le document</a></p></body></html>`;
const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://docusign.net.review-envelope.xyz/pdf/4471) >> >>\nendobj\n%%EOF\n";

const msg = CFB.utils.cfb_new();
const add = (path, data) => CFB.utils.cfb_add(msg, path, data);
add("/__properties_version1.0", new Uint8Array(32));
add("/__substg1.0_007D001F", utf16(HEADERS));
add("/__substg1.0_0037001F", utf16("Contrat 4471 : document en attente de signature"));
add("/__substg1.0_0C1A001F", utf16("DocuSign"));
add("/__substg1.0_0C1F001F", utf16("dse@envelope-notice.xyz"));
add("/__substg1.0_1000001F", utf16(TEXT));
add("/__substg1.0_10130102", utf8(HTML));
add("/__attach_version1.0_#00000000/__properties_version1.0", new Uint8Array(16));
add("/__attach_version1.0_#00000000/__substg1.0_3707001F", utf16("Contrat_4471.pdf"));
add("/__attach_version1.0_#00000000/__substg1.0_370E001F", utf16("application/pdf"));
add("/__attach_version1.0_#00000000/__substg1.0_37010102", utf8(PDF));

writeFileSync(new URL("../fixtures/docusign.msg", import.meta.url), CFB.write(msg, { type: "buffer" }));
```

Run: `node scripts/make-msg-fixture.mjs && node scripts/make-msg-fixture.mjs && git status --short fixtures`
Expected: `?? fixtures/docusign.msg`; running it twice gives the same file (`sha256sum fixtures/docusign.msg` is stable).

- [ ] **Step 2: Write the failing test**

```ts file=src/lib/msg/parse.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as CFB from "cfb";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { parseMsg } from "./parse.ts";

const utf16 = (text: string) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[2 * i] = text.charCodeAt(i) & 0xff;
    out[2 * i + 1] = text.charCodeAt(i) >> 8;
  }
  return out;
};

function build(streams: Record<string, Uint8Array>): Uint8Array {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "/__properties_version1.0", new Uint8Array(32));
  for (const [path, data] of Object.entries(streams)) CFB.utils.cfb_add(container, path, data);
  return new Uint8Array(CFB.write(container, { type: "buffer" }));
}

test("reads the DocuSign .msg fixture into a ParsedEmail", () => {
  const email = parseMsg(readFileSync(new URL("../../../fixtures/docusign.msg", import.meta.url)));
  assert.equal(email.source, "msg");
  assert.equal(decodeEncodedWords(getHeader(email.headers, "subject") ?? ""), "Contrat 4471 : document en attente de signature");
  assert.equal(getHeader(email.headers, "from"), "DocuSign <dse@envelope-notice.xyz>");
  assert.equal(email.headers.filter((h) => h.name === "Received").length, 2);
  assert.match(email.text ?? "", /Vous avez reçu un document/);
  assert.match(email.html ?? "", /<a href="https:\/\/docusign\.net\.review-envelope\.xyz\/e\/4471">/);
  assert.deepEqual(
    email.attachments.map((a) => [a.filename, a.contentType, new TextDecoder().decode(a.data.subarray(0, 5))]),
    [["Contrat_4471.pdf", "application/pdf", "%PDF-"]],
  );
  assert.equal(email.rawBody, null);
  assert.deepEqual(email.warnings, []);
  assert.match(email.raw, /^Received: from AM9PR04MB8456/);
});

test("rebuilds basic headers when there are no transport headers", () => {
  const email = parseMsg(build({
    "/__substg1.0_0037001F": utf16("Brouillon"),
    "/__substg1.0_0C1A001F": utf16("Claire Dupont"),
    "/__substg1.0_0C1F001F": utf16("claire@example.com"),
    "/__substg1.0_0E04001F": utf16("Jean Martin"),
    "/__substg1.0_1000001F": utf16("Texte"),
  }));
  assert.deepEqual(email.headers, [
    { name: "From", value: "Claire Dupont <claire@example.com>" },
    { name: "To", value: "Jean Martin" },
    { name: "Subject", value: "Brouillon" },
  ]);
  assert.match(email.warnings.join(" "), /No transport headers/);
});

test("says what it cannot read", () => {
  const email = parseMsg(build({
    "/__substg1.0_007D001F": utf16("Subject: x\r\n\r\n"),
    "/__substg1.0_10090102": new Uint8Array(16),
    "/__attach_version1.0_#00000000/__substg1.0_3707001F": utf16("forwarded.msg"),
    "/__attach_version1.0_#00000000/__substg1.0_3701000D/__properties_version1.0": new Uint8Array(32),
  }));
  assert.equal(email.html, null);
  assert.match(email.warnings.join(" "), /compressed RTF/);
  assert.match(email.warnings.join(" "), /forwarded\.msg/);
  assert.deepEqual(email.attachments, []);
});

test("refuses files that are not Outlook messages", () => {
  assert.throws(() => parseMsg(new TextEncoder().encode("From: x\n\nnot a msg")), /not an Outlook \.msg/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `msg/parse.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/msg/parse.ts
import * as CFB from "cfb";
import type { Attachment, HeaderField, ParsedEmail } from "../email.ts";
import { bytesToBinary } from "../mime/bytes.ts";
import { decodeText, decodeUtf8OrLegacy } from "../mime/charset.ts";
import { parseHeaderBlock } from "../mime/headers.ts";

// MAPI property types, as they appear at the end of stream names.
const UNICODE = "001F";
const STRING8 = "001E";
const BINARY = "0102";
const EMBEDDED = "000D";

// MAPI property ids used here.
const TRANSPORT_HEADERS = "007D";
const SUBJECT = "0037";
const SENDER_NAME = "0C1A";
const SENDER_EMAIL = "0C1F";
const DISPLAY_TO = "0E04";
const BODY = "1000";
const RTF_COMPRESSED = "1009";
const HTML = "1013";
const ATTACH_DATA = "3701";
const ATTACH_SHORT_NAME = "3704";
const ATTACH_LONG_NAME = "3707";
const ATTACH_MIME = "370E";
const ATTACH_CONTENT_ID = "3712";

const ATTACHMENT_STORAGE = /^(__attach_version1\.0_#[0-9A-Fa-f]{8}\/)/;

/**
 * Reads an Outlook .msg (an OLE compound file of MAPI properties) into the
 * same ParsedEmail as an .eml. Received mail keeps its internet headers in
 * one property; without them, only sender, recipients and subject are known.
 */
export function parseMsg(bytes: Uint8Array): ParsedEmail {
  let container: CFB.CFB$Container;
  try {
    container = CFB.read(bytes, { type: "array" });
  } catch {
    throw new Error("This is not an Outlook .msg file.");
  }
  const streams = new Map<string, Uint8Array>();
  container.FileIndex.forEach((entry, i) => {
    if (entry.type === 2 && entry.content) {
      streams.set(container.FullPaths[i].replace(/^Root Entry\//, ""), new Uint8Array(entry.content as ArrayLike<number>));
    }
  });
  if (![...streams.keys()].some((path) => path.startsWith("__substg1.0_") || path === "__properties_version1.0")) {
    throw new Error("This is not an Outlook .msg file.");
  }

  const text = (prefix: string, id: string): string | null => {
    const unicode = streams.get(`${prefix}__substg1.0_${id}${UNICODE}`);
    if (unicode) return new TextDecoder("utf-16le").decode(unicode).replace(/\0+$/, "");
    const legacy = streams.get(`${prefix}__substg1.0_${id}${STRING8}`);
    return legacy ? decodeUtf8OrLegacy(legacy).replace(/\0+$/, "") : null;
  };
  const binary = (prefix: string, id: string) => streams.get(`${prefix}__substg1.0_${id}${BINARY}`) ?? null;

  const warnings: string[] = [];
  const transport = text("", TRANSPORT_HEADERS);
  let headers: HeaderField[];
  if (transport) {
    headers = parseHeaderBlock(bytesToBinary(new TextEncoder().encode(transport.replace(/(\r?\n)+$/, ""))), warnings);
  } else {
    const name = text("", SENDER_NAME);
    const address = text("", SENDER_EMAIL);
    headers = [];
    if (address) headers.push({ name: "From", value: name ? `${name} <${address}>` : address });
    const to = text("", DISPLAY_TO);
    if (to) headers.push({ name: "To", value: to });
    const subject = text("", SUBJECT);
    if (subject) headers.push({ name: "Subject", value: subject });
    warnings.push("No transport headers: this message was probably never sent over the internet, so only its sender, recipients and subject are known.");
  }

  const htmlBytes = binary("", HTML);
  const charset = htmlBytes ? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytesToBinary(htmlBytes.subarray(0, 2048)))?.[1] : null;
  const html = htmlBytes ? decodeText(htmlBytes, charset) : text("", HTML);
  if (!html && binary("", RTF_COMPRESSED)) {
    warnings.push("The formatted body is only stored as compressed RTF, which is not read here; its links are not analysed.");
  }

  const attachments: Attachment[] = [];
  const prefixes = [...new Set([...streams.keys()].map((path) => ATTACHMENT_STORAGE.exec(path)?.[1]).filter((p): p is string => !!p))].sort();
  for (const prefix of prefixes) {
    const filename = text(prefix, ATTACH_LONG_NAME) ?? text(prefix, ATTACH_SHORT_NAME) ?? `attachment-${attachments.length + 1}`;
    const data = binary(prefix, ATTACH_DATA);
    if (!data) {
      if ([...streams.keys()].some((path) => path.startsWith(`${prefix}__substg1.0_${ATTACH_DATA}${EMBEDDED}/`))) {
        warnings.push(`The attached message “${filename}” is embedded in Outlook's own format and was not analysed.`);
      }
      continue;
    }
    const contentId = text(prefix, ATTACH_CONTENT_ID);
    attachments.push({
      filename,
      contentType: (text(prefix, ATTACH_MIME) ?? "application/octet-stream").toLowerCase(),
      contentId,
      inline: contentId !== null,
      data,
    });
  }

  const body = text("", BODY);
  return {
    source: "msg",
    headers,
    text: body,
    html,
    attachments,
    raw: [transport ?? headers.map((h) => `${h.name}: ${h.value}`).join("\r\n"), body ?? ""].join("\r\n\r\n"),
    rawBody: null,
    warnings,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/make-msg-fixture.mjs fixtures/docusign.msg src/lib/msg
git commit -m "Read Outlook .msg files

parseMsg reads the MAPI properties of an OLE compound file with cfb and
maps them onto the same ParsedEmail as an .eml: the internet headers
received mail keeps, the plain and HTML bodies, and the attachments.
Without transport headers it rebuilds From, To and Subject and says so;
an RTF-only body and embedded Outlook messages are reported rather than
silently skipped.

The DocuSign fixture is generated by a script, so it is reproducible and
its contents are reviewable as text."
```

---

### Task 3: Score and verdict

**Files:**
- Create: `src/lib/score/score.ts`, `src/lib/score/score.test.ts`
- Modify: `src/lib/attachments/analyze.ts` (QR codes weigh more)

**Interfaces:**
- Consumes: `Finding`, `FindingCategory`.
- Produces: `Band = "clean" | "suspicious" | "likely-phishing" | "malicious"`, `BAND_LABEL: Record<Band, string>`, `BAND_FLOORS: { band: Band; from: number }[]`, `CATEGORY_CAPS: Record<FindingCategory, number>`, `CategoryScore = { category: FindingCategory; points: number; cap: number }`, `Score = { score: number; band: Band; categories: CategoryScore[]; decisive: string[] }`, `scoreFindings(findings: readonly Finding[]): Score`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/score/score.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `score.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/score/score.ts
import type { Finding, FindingCategory } from "../finding.ts";

export type Band = "clean" | "suspicious" | "likely-phishing" | "malicious";

export const BAND_LABEL: Record<Band, string> = {
  clean: "Clean",
  suspicious: "Suspicious",
  "likely-phishing": "Likely phishing",
  malicious: "Malicious indicators",
};

/** Lower bound of each band on the 0–100 scale. */
export const BAND_FLOORS: { band: Band; from: number }[] = [
  { band: "clean", from: 0 },
  { band: "suspicious", from: 15 },
  { band: "likely-phishing", from: 40 },
  { band: "malicious", from: 70 },
];

/**
 * Most points a category can contribute, so a pile of related signals —
 * ten flagged links, say — cannot outweigh everything else.
 */
export const CATEGORY_CAPS: Record<FindingCategory, number> = {
  auth: 30,
  sender: 25,
  route: 10,
  vendor: 25,
  link: 40,
  html: 30,
  attachment: 45,
};

// Artefacts that are malicious in themselves, not merely suspicious.
const DECISIVE = new Set([
  "attachment.html-smuggling",
  "attachment.program",
  "attachment.script",
  "attachment.shortcut",
  "attachment.macros",
  "attachment.archive-hides-program",
  "attachment.disk-image",
  "attachment.remote-template",
]);

export type CategoryScore = { category: FindingCategory; points: number; cap: number };

export type Score = {
  /** 0–100. */
  score: number;
  band: Band;
  /** Points per category after capping, for the categories that scored. */
  categories: CategoryScore[];
  /** Ids of the findings that forced the "malicious indicators" band. */
  decisive: string[];
};

export function scoreFindings(findings: readonly Finding[]): Score {
  const totals = new Map<FindingCategory, number>();
  for (const f of findings) totals.set(f.category, (totals.get(f.category) ?? 0) + f.weight);
  const categories = (Object.keys(CATEGORY_CAPS) as FindingCategory[])
    .filter((category) => (totals.get(category) ?? 0) > 0)
    .map((category) => ({ category, points: Math.min(CATEGORY_CAPS[category], totals.get(category) ?? 0), cap: CATEGORY_CAPS[category] }));
  const score = Math.min(100, categories.reduce((sum, c) => sum + c.points, 0));
  const decisive = findings.filter((f) => DECISIVE.has(f.id)).map((f) => f.id);
  let band: Band = "clean";
  for (const floor of BAND_FLOORS) if (score >= floor.from) band = floor.band;
  return { score, band: decisive.length > 0 ? "malicious" : band, categories, decisive };
}
```

In `src/lib/attachments/analyze.ts`, a QR code in a phishing email is the link itself; give it the weight of one. Replace

```ts
  { flag: "qr-code", severity: "medium", weight: 10, title: "QR code in an image",
```

with

```ts
  { flag: "qr-code", severity: "high", weight: 15, title: "QR code in an image",
```

and move that rule up so the `RULES` list stays ordered by weight: put it right after the `rtlo` rule.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS except `src/lib/analyze.test.ts` "follows the QR code of the quishing email", whose expected order changes in Task 4 (the QR finding now ranks above the brand impersonation).

- [ ] **Step 5: Commit**

```bash
git add src/lib/score src/lib/attachments/analyze.ts
git commit -m "Score findings and give a verdict

The score adds finding weights with a cap per category, so related
signals cannot crowd out the rest, and bands it: clean, suspicious,
likely phishing, malicious indicators. Artefacts that are malicious in
themselves — smuggling, programs, scripts, shortcuts, macros, a program
hidden in an archive, disk images, remote templates — force the last
band whatever the score.

A QR code in an image now weighs as much as the link it stands for."
```

---

### Task 4: DKIM and score in the whole-email report

**Files:**
- Modify: `src/lib/analyze.ts`, `src/lib/analyze.test.ts` (full replacement)

**Interfaces:**
- Produces (changed): `EmailReport` gains `dkim: DkimCheck[]` and `score: Score`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/analyze.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { parseEmail, parseHeadersOnly } from "./mime/parse.ts";
import { parseMsg } from "./msg/parse.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";
import { decodePng } from "./testing/png.ts";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
const decodeImage = async (data: Uint8Array) => decodePng(data);
const analyse = (name: string, orgDomains: string[] = []) =>
  analyzeEmail(name.endsWith(".msg") ? parseMsg(read(name)) : parseEmail(read(name)), { orgDomains, parseHtml, decodeImage });
const summary = async (name: string) => {
  const report = await analyse(name);
  return { ids: report.findings.map((f) => f.id), score: report.score.score, band: report.score.band };
};

test("the spoofed invoice: every kind of finding, malicious indicators", async () => {
  assert.deepEqual(await summary("spoofed-invoice.eml"), {
    ids: [
      "link.deceptive",
      "attachment.html-smuggling",
      "auth.dmarc-fail",
      "vendor.microsoft-365",
      "url.disguised-domain",
      "attachment.double-extension",
      "sender.reply-to-mismatch",
      "route.helo-mismatch",
      "html.tracking-pixel",
      "url.abused-tld",
    ],
    score: 100,
    band: "malicious",
  });
});

test("uses the organisation's domains", async () => {
  const report = await analyse("spoofed-invoice.eml", ["rhone-energie.fr"]);
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title ?? "", /your own domain/);
});

test("the clean newsletter: nothing, and its DKIM body hash matches", async () => {
  const report = await analyse("clean-newsletter.eml");
  assert.deepEqual(report.findings, []);
  assert.deepEqual([report.score.score, report.score.band], [0, "clean"]);
  assert.deepEqual(report.dkim.map((c) => c.result), ["match"]);
});

test("the PayPal lookalike: likely phishing", async () => {
  const { ids, score, band } = await summary("lookalike-paypal.eml");
  assert.deepEqual([...ids].sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "sender.brand-impersonation",
    "url.lookalike",
    "url.shortener",
  ]);
  assert.deepEqual([score, band], [60, "likely-phishing"]);
});

test("the quishing email: likely phishing", async () => {
  assert.deepEqual(await summary("quishing-qr.eml"), {
    ids: ["url.disguised-domain", "attachment.qr-code", "sender.brand-impersonation", "url.abused-tld"],
    score: 43,
    band: "likely-phishing",
  });
});

test("the macro document and the reversed archive: malicious whatever the score", async () => {
  assert.deepEqual(await summary("macro-docm.eml"), {
    ids: ["attachment.macros", "attachment.remote-template", "url.abused-tld"],
    score: 36,
    band: "malicious",
  });
  const rtlo = await summary("rtlo-archive.eml");
  assert.deepEqual([[...rtlo.ids].sort(), rtlo.score, rtlo.band], [["attachment.archive-hides-program", "attachment.rtlo"], 30, "malicious"]);
});

test("the DocuSign .msg: suspicious", async () => {
  assert.deepEqual(await summary("docusign.msg"), {
    ids: ["url.disguised-domain", "auth.compauth-fail", "sender.brand-impersonation", "url.abused-tld"],
    score: 38,
    band: "suspicious",
  });
});

test("pasted headers are scored on what they show", async () => {
  const source = read("spoofed-invoice.eml").toString("utf8");
  const report = await analyzeEmail(parseHeadersOnly(source.slice(0, source.indexOf("\n\n"))), { orgDomains: [], parseHtml });
  assert.deepEqual([report.score.score, report.score.band], [45, "likely-phishing"]);
  assert.deepEqual(report.links.links, []);
  assert.deepEqual(report.attachments, []);
  assert.deepEqual(report.dkim, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `report.score` and `report.dkim` are undefined.

- [ ] **Step 3: Implement**

In `src/lib/analyze.ts`:

1. Add imports:

```ts
import { dkimChecks, dkimFindings, type DkimCheck } from "./dkim/bodyhash.ts";
import { scoreFindings, type Score } from "./score/score.ts";
```

2. Add to `EmailReport`, after `iocs: Ioc[];`:

```ts
  /** Body-hash check of each DKIM signature. */
  dkim: DkimCheck[];
```

   and after `findings: Finding[];`:

```ts
  score: Score;
```

3. In `analyzeEmail`, right after `const attachments = await analyzeAttachments(…);` add `const dkim = await dkimChecks(email);`, and replace the returned object with:

```ts
  const findings = sortFindings([...headers.findings, ...dkimFindings(dkim), ...links.findings, ...attachmentFindings(attachments)]);
  return {
    headers,
    links,
    attachments,
    iocs: collectIocs({ email, headers, links: links.links, attachments }),
    dkim,
    findings,
    score: scoreFindings(findings),
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyze.ts src/lib/analyze.test.ts
git commit -m "Score every email and check its DKIM body hashes

analyzeEmail now runs the DKIM body-hash check and scores the merged
findings. On the fixtures: the spoofed invoice, the macro document and
the reversed archive carry malicious indicators; the PayPal lookalike
and the quishing email are likely phishing (60 and 43); the DocuSign
.msg is suspicious (38); the clean newsletter scores 0 and its body is
the one its sender signed."
```

---

### Task 5: Settings

**Files:**
- Create: `src/lib/ioc/types.ts`
- Modify: `src/lib/ioc/collect.ts` (use and re-export `ioc/types.ts`), `src/lib/pivots/pivots.ts` (type import), `src/lib/settings.ts` (full replacement), `src/lib/settings.test.ts` (append)

**Interfaces:**
- Produces: `IOC_TYPES`, `IocType`, `Ioc` from `ioc/types.ts` (still re-exported by `ioc/collect.ts`); `Settings = { theme: Theme; orgDomains: string[]; defang: boolean; pivots: PivotService[] }`, `normaliseDomain(input: string): string | null`, `isValidTemplate(template: string): boolean`, `parsePivots(value: unknown): PivotService[]`, `parseSettings(value: unknown): Settings` (plus the milestone 1 exports, unchanged).

- [ ] **Step 1: A light IOC types module**

```ts file=src/lib/ioc/types.ts
export const IOC_TYPES = ["url", "domain", "ip", "email", "sha256", "sha1", "md5"] as const;

export type IocType = (typeof IOC_TYPES)[number];

export type Ioc = {
  type: IocType;
  value: string;
  /** Where it was seen: "From", "link in HTML body", "attachment x.pdf"… */
  sources: string[];
};
```

In `src/lib/ioc/collect.ts`, delete the `IOC_TYPES`, `IocType` and `Ioc` declarations (with the `sources` comment) and add, after the imports:

```ts
import { IOC_TYPES, type Ioc, type IocType } from "./types.ts";

export { IOC_TYPES };
export type { Ioc, IocType };
```

In `src/lib/pivots/pivots.ts` and `src/lib/ioc/defang.ts`, import the types from `./types.ts` / `../ioc/types.ts` instead of `collect.ts`.

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/settings.test.ts`:

```ts
import { DEFAULT_PIVOTS } from "./pivots/pivots.ts";
import { isValidTemplate, normaliseDomain } from "./settings.ts";

test("normalises organisation domains however they are typed", () => {
  assert.equal(normaliseDomain(" Rhone-Energie.FR "), "rhone-energie.fr");
  assert.equal(normaliseDomain("https://www.example.com/path?x=1"), "www.example.com");
  assert.equal(normaliseDomain("user@example.org"), "example.org");
  assert.equal(normaliseDomain("*.example.net"), "example.net");
  assert.equal(normaliseDomain("münchen.de"), "xn--mnchen-3ya.de");
  for (const bad of ["not a domain", "localhost", "1.2.3.4", "", "exa mple.com"]) assert.equal(normaliseDomain(bad), null, bad);
});

test("keeps valid settings and drops the rest", () => {
  const settings = parseSettings({
    theme: "console",
    orgDomains: ["Rhone-Energie.fr", "rhone-energie.fr", "nope", 42],
    defang: false,
    pivots: [
      { id: "a", name: "Mine", types: ["domain", "bogus"], template: "https://lookup.example/?q={value}" },
      { id: "b", name: "Broken", types: ["ip"], template: "javascript:alert(1)" },
      { id: "c", name: "", types: ["ip"], template: "https://x.example/{raw}" },
    ],
  });
  assert.deepEqual(settings, {
    theme: "console",
    orgDomains: ["rhone-energie.fr"],
    defang: false,
    pivots: [{ id: "a", name: "Mine", types: ["domain"], template: "https://lookup.example/?q={value}" }],
  });
});

test("defaults: defanged, built-in pivots; an emptied pivot list stays empty", () => {
  assert.equal(parseSettings({}).defang, true);
  assert.equal(parseSettings({}).pivots, DEFAULT_PIVOTS);
  assert.deepEqual(parseSettings({ pivots: [] }).pivots, []);
  assert.equal(parseSettings({ pivots: "garbage" }).pivots, DEFAULT_PIVOTS);
});

test("accepts only http(s) templates with a placeholder", () => {
  assert.ok(isValidTemplate("https://x.example/{base64url}"));
  assert.ok(!isValidTemplate("https://x.example/static"));
  assert.ok(!isValidTemplate("ftp://x.example/{value}"));
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `normaliseDomain` and `isValidTemplate` are not exported; `parseSettings` drops the new fields.

- [ ] **Step 4: Implement**

```ts file=src/lib/settings.ts
import { IOC_TYPES, type IocType } from "./ioc/types.ts";
import { isIPv4 } from "./net/ip.ts";
import { DEFAULT_PIVOTS, type PivotService } from "./pivots/pivots.ts";

/** The only key Perspicax writes. It holds settings — never any part of an email. */
export const SETTINGS_KEY = "perspicax.settings.v1";

export const THEMES = ["suisse", "console", "dossier"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "suisse";

export const THEME_LABELS: Record<Theme, string> = {
  suisse: "Suisse",
  console: "Console",
  dossier: "Dossier",
};

export type Settings = {
  theme: Theme;
  /** The analyst's own domains: spoofing them weighs more, lookalikes of them are flagged. */
  orgDomains: string[];
  /** Defang indicators by default when displaying, copying and reporting. */
  defang: boolean;
  pivots: PivotService[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  orgDomains: [],
  defang: true,
  pivots: DEFAULT_PIVOTS,
};

const MAX_DOMAINS = 50;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** `https://www.Example.com/x`, `user@example.com`, `*.example.com` → the bare domain; null if it is not one. */
export function normaliseDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/^.*@/, "")
    .replace(/[/?#:].*$/, "")
    .replace(/\.$/, "");
  if (!value || /\s/.test(value)) return null;
  let host: string;
  try {
    host = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !isIPv4(host) ? host : null;
}

export function isValidTemplate(template: string): boolean {
  return /^https?:\/\/\S+$/i.test(template) && /\{(value|raw|base64url)\}/.test(template);
}

export function parsePivots(value: unknown): PivotService[] {
  if (!Array.isArray(value)) return DEFAULT_PIVOTS;
  const pivots: PivotService[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const types = Array.isArray(p.types)
      ? p.types.filter((t): t is IocType => (IOC_TYPES as readonly unknown[]).includes(t))
      : [];
    if (typeof p.name !== "string" || !p.name.trim()) continue;
    if (typeof p.template !== "string" || !isValidTemplate(p.template) || types.length === 0) continue;
    pivots.push({
      id: typeof p.id === "string" && p.id ? p.id : `custom-${pivots.length + 1}`,
      name: p.name.trim(),
      types,
      template: p.template,
    });
  }
  return pivots;
}

/**
 * Values coming out of localStorage are untrusted (hand-edited, from an older
 * version, or plain corrupted), so every field is re-checked before use.
 */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const raw = value as Record<string, unknown>;
  const domains = Array.isArray(raw.orgDomains)
    ? raw.orgDomains
        .filter((d): d is string => typeof d === "string")
        .map(normaliseDomain)
        .filter((d): d is string => d !== null)
    : [];
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_THEME,
    orgDomains: [...new Set(domains)].slice(0, MAX_DOMAINS),
    defang: typeof raw.defang === "boolean" ? raw.defang : true,
    pivots: "pivots" in raw ? parsePivots(raw.pivots) : DEFAULT_PIVOTS,
  };
}

/**
 * Runs inline in <head>, before first paint, so a saved theme never flashes
 * the default one first. It is a string: no imports, nothing to bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY,
)})||"null");var t=s&&s.theme;if(${JSON.stringify(
  THEMES,
)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/lib/ioc src/lib/pivots
git commit -m "Add organisation domains, defanging and pivots to the settings

Settings now hold the organisation's domains (normalised however they
are typed: URL, address, wildcard, IDN), whether indicators are defanged
by default, and the pivot services. Everything read back from
localStorage is validated again: unknown types, templates that are not
http(s) or lack a placeholder, and malformed domains are dropped.

IOC types move to a small module of their own so settings do not pull
the whole analysis engine into the page's first load."
```

---

### Task 6: Markdown and JSON reports

**Files:**
- Modify: `src/lib/ioc/defang.ts`, `src/lib/ioc/defang.test.ts` (free-text defanging)
- Create: `src/lib/report/markdown.ts`, `src/lib/report/json.ts`, `src/lib/report/report.test.ts`

**Interfaces:**
- Consumes: `EmailReport` (Task 4), `ParsedEmail`, formatters, `entryDetails`, `BAND_LABEL`, `IOC_TYPES`, `isClickable`.
- Produces: `defangText(text: string): string`; `ReportInput = { email: ParsedEmail; report: EmailReport; file: { name: string; size: number }; generatedAt: Date; defang: boolean }`, `reportMarkdown(input: ReportInput): string`, `reportJson(input: Omit<ReportInput, "defang">): string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/ioc/defang.test.ts`:

```ts
import { defangText } from "./defang.ts";

test("defangs URLs, addresses, IPs and domains inside prose", () => {
  assert.equal(
    defangText('"https://espace-client.rhone-energie.fr" → https://rhone-energie.fr.secure-login.click/auth?u=j.martin'),
    '"hxxps://espace-client[.]rhone-energie[.]fr" → hxxps://rhone-energie[.]fr[.]secure-login[.]click/auth?u=j.martin',
  );
  assert.equal(defangText("Reply-To: rhone.energie.paiement@outlook.fr"), "Reply-To: rhone.energie.paiement[@]outlook[.]fr");
  assert.equal(defangText("from 185.234.72.19 (no reverse DNS)"), "from 185[.]234[.]72[.]19 (no reverse DNS)");
  assert.equal(defangText("dmarc=fail header.from=rhone-energie.fr"), "dmarc=fail header.from=rhone-energie[.]fr");
  assert.equal(defangText("Facture_RE-4471.pdf.html — word/vbaProject.bin, id 15.20.8093.1"), "Facture_RE-4471.pdf.html — word/vbaProject.bin, id 15.20.8093.1");
});
```

```ts file=src/lib/report/report.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";
import { reportJson } from "./json.ts";
import { reportMarkdown } from "./markdown.ts";

const generatedAt = new Date("2026-10-14T10:00:00Z");
const spoofed = async () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const report = await analyzeEmail(email, { orgDomains: [], parseHtml });
  return { email, report, file: { name: "spoofed-invoice.eml", size: 3790 }, generatedAt };
};

test("writes a defanged Markdown ticket report", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: true });
  assert.match(md, /^# Email analysis — Rappel : votre facture RE-2026-4471 reste impayée$/m);
  assert.match(md, /^\*\*Verdict:\*\* Malicious indicators — score 100\/100$/m);
  assert.match(md, /^\*\*Analysed:\*\* 2026-10-14 10:00:00 UTC with Perspicax, offline$/m);
  assert.match(md, /^1\. \*\*Link text shows another destination\*\* — High, \+20$/m);
  assert.match(md, /`"hxxps:\/\/espace-client\[\.\]rhone-energie\[\.\]fr" → hxxps:\/\/rhone-energie\[\.\]fr\[\.\]secure-login\[\.\]click\/auth\?u=j\.martin`/);
  assert.match(md, /^\| spf \| fail \| smtp\.mailfrom=mta-relay\[\.\]click \|$/m);
  assert.match(md, /^\| 1 \| 07:14:02Z \| — \| mail\[\.\]rhone-energie\[\.\]fr \| 185\[\.\]234\[\.\]72\[\.\]19 \| mx01\[\.\]mta-relay\[\.\]click \|$/m);
  assert.match(md, /^\| Facture_RE-4471\.pdf\.html \| HTML document \| 343 B \| `[0-9a-f]{64}` \| web-page, double-extension, html-smuggling \|$/m);
  assert.match(md, /^- `hxxps:\/\/t\[\.\]mta-relay\[\.\]click\/o\/9f3a2c1e\.gif` — image in HTML body$/m);
  assert.doesNotMatch(md, /https:\/\/rhone-energie\.fr\.secure-login/);
});

test("can leave indicators live", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: false });
  assert.match(md, /https:\/\/rhone-energie\.fr\.secure-login\.click\/auth\?u=j\.martin/);
  assert.match(md, /Indicators are not defanged\.$/);
});

test("exports JSON for machines, raw and without attachment content", async () => {
  const data = JSON.parse(reportJson(await spoofed()));
  assert.equal(data.generator, "Perspicax");
  assert.deepEqual(data.verdict, {
    score: 100, band: "malicious", label: "Malicious indicators",
    categories: data.verdict.categories,
  });
  assert.equal(data.iocs.length, 16);
  assert.equal(data.links[0].final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal("html" in data.attachments[0], false);
  assert.equal(data.relayChain[0].date, "2026-10-13T07:14:02.000Z");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `defangText` is not exported; cannot find `report/markdown.ts`, `report/json.ts`.

- [ ] **Step 3: Implement**

Append to `src/lib/ioc/defang.ts`:

```ts
// Top-level domains common enough in mail to recognise a bare domain in prose.
const PROSE_TLDS =
  "com|net|org|info|biz|fr|de|uk|io|co|eu|be|ch|es|it|nl|us|ru|cn|me|app|dev|online|site|shop|live|ly|click|top|xyz|cfd|sbs|icu|tk|ml|ga|cf|gq|zip|mov";
const PROSE_DOMAIN = new RegExp(`\\b((?:[a-z0-9-]+\\.)+(?:${PROSE_TLDS}))\\b`, "gi");

/** Defangs every URL, email address, IPv4 address and recognisable domain in free text. */
export function defangText(text: string): string {
  return text
    .replace(/\b(https?|ftp):\/\/([^\s/?#"'<>`)\]]+)/gi, (_m, scheme: string, host: string) =>
      `${scheme.replace(/^http/i, "hxxp")}://${host.replace(/\./g, "[.]")}`)
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g, (_m, local: string, domain: string) =>
      `${local}[@]${domain.replace(/\./g, "[.]")}`)
    .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, "$1[.]$2[.]$3[.]$4")
    .replace(PROSE_DOMAIN, (domain: string) => domain.replace(/\./g, "[.]"));
}
```

```ts file=src/lib/report/markdown.ts
import type { EmailReport } from "../analyze.ts";
import type { ParsedEmail } from "../email.ts";
import { formatDelay, formatSize, formatTime, formatUtc } from "../format.ts";
import { entryDetails } from "../headers/auth.ts";
import { defang, defangText } from "../ioc/defang.ts";
import { IOC_TYPES, type IocType } from "../ioc/types.ts";
import { isClickable } from "../links/analyze.ts";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { BAND_LABEL } from "../score/score.ts";

export type ReportInput = {
  email: ParsedEmail;
  report: EmailReport;
  file: { name: string; size: number };
  generatedAt: Date;
  /** Defang URLs, addresses, IPs and domains (default: yes, so the ticket holds no live link). */
  defang: boolean;
};

const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low", info: "Info" } as const;
const IOC_HEADING: Record<IocType, string> = {
  url: "URLs", domain: "Domains", ip: "IP addresses", email: "Email addresses", sha256: "SHA-256", sha1: "SHA-1", md5: "MD5",
};
const MAX_LINKS = 30;

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (text: string) => (text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``);

/** A ticket-ready Markdown report of the analysis. */
export function reportMarkdown(input: ReportInput): string {
  const { email, report, file, generatedAt } = input;
  const safe = (text: string) => (input.defang ? defangText(text) : text);
  const headers = report.headers;
  const from = headers.sender.from;
  const out: string[] = [];

  out.push(`# Email analysis — ${headers.subject || "(no subject)"}`, "");
  out.push(`**Verdict:** ${BAND_LABEL[report.score.band]} — score ${report.score.score}/100`);
  out.push(`**Analysed:** ${formatUtc(generatedAt)} with Perspicax, offline`);
  out.push(`**File:** ${file.name} (${formatSize(file.size)})`, "");
  out.push("| Field | Value |", "|---|---|");
  out.push(`| From | ${cell(safe(from ? `${from.name ? `${from.name} ` : ""}<${from.address}>` : "—"))} |`);
  out.push(`| To | ${cell(safe(decodeEncodedWords(getHeader(email.headers, "to") ?? "—")))} |`);
  out.push(`| Date | ${headers.date ? formatUtc(headers.date) : "—"} |`);
  out.push(`| Subject | ${cell(headers.subject || "—")} |`, "");

  out.push(`## Findings (${report.findings.length})`, "");
  if (report.findings.length === 0) out.push("No finding.");
  report.findings.forEach((finding, i) => {
    out.push(`${i + 1}. **${finding.title}** — ${SEVERITY_LABEL[finding.severity]}, +${finding.weight}`);
    out.push(`   ${finding.explanation}`);
    for (const line of finding.evidence) out.push(`   - ${code(safe(line))}`);
  });
  out.push("");
  if (report.score.categories.length > 0) {
    out.push(`Score by category: ${report.score.categories.map((c) => `${c.category} ${c.points}/${c.cap}`).join(", ")}.`, "");
  }

  out.push("## Authentication", "");
  if (headers.auth.entries.length === 0) {
    out.push("No authentication results.");
  } else {
    out.push(`Recorded by ${code(safe(headers.auth.recordedBy ?? "unknown"))}.`, "");
    out.push("| Method | Result | Details |", "|---|---|---|");
    for (const entry of headers.auth.entries) out.push(`| ${entry.method} | ${entry.result} | ${cell(safe(entryDetails(entry)))} |`);
  }
  for (const check of report.dkim) {
    const verdict = check.result === "match" ? "matches the body" : check.result === "mismatch" ? "does not match: the body changed after signing" : "not checked (unsupported algorithm)";
    out.push("", `DKIM body hash for d=${safe(check.signature.domain)}: ${verdict}.`);
  }
  out.push("");

  out.push("## Relay chain (oldest first)", "");
  if (headers.hops.length === 0) {
    out.push("No Received headers.");
  } else {
    out.push("| # | Time (UTC) | Δ | From | IP | By |", "|---|---|---|---|---|---|");
    for (const hop of headers.hops) {
      out.push(
        `| ${hop.index} | ${hop.date ? formatTime(hop.date) : "—"} | ${formatDelay(hop.delay)} | ${cell(safe(hop.helo ?? hop.rdns ?? "—"))} | ${cell(safe(hop.ip ?? "—"))} | ${cell(safe(hop.by ?? "—"))} |`,
      );
    }
  }
  out.push("");

  const clickable = report.links.links.filter(isClickable);
  const flagged = clickable.filter((l) => l.url.flags.length > 0 || l.shownHost || l.hidden);
  out.push(`## Links (${clickable.length}, ${flagged.length} flagged)`, "");
  if (flagged.length === 0) out.push("No flagged link.");
  for (const link of flagged.slice(0, MAX_LINKS)) {
    const notes = [
      link.shownHost ? `shows ${safe(link.shownHost)}` : null,
      ...link.url.flags.map((f) => (f === "lookalike" ? `lookalike of ${safe(link.url.lookalikeOf ?? "")}` : f)),
      link.hidden ? `hidden (${link.hidden})` : null,
      link.attachment ? `in ${link.attachment}` : null,
    ].filter(Boolean);
    out.push(`- ${code(safe(link.url.final ?? link.url.raw))} — ${notes.join(", ")}`);
  }
  out.push("");

  if (report.attachments.length > 0) {
    out.push("## Attachments", "", "| Name | Detected type | Size | SHA-256 | Flags |", "|---|---|---|---|---|");
    for (const a of report.attachments) {
      out.push(`| ${cell(a.visibleName)} | ${a.detected.label} | ${formatSize(a.size)} | ${code(a.hashes.sha256)} | ${a.flags.join(", ") || "—"} |`);
    }
    out.push("");
  }

  out.push(`## Indicators (${report.iocs.length})`, "");
  for (const type of IOC_TYPES) {
    const list = report.iocs.filter((ioc) => ioc.type === type);
    if (list.length === 0) continue;
    out.push(`### ${IOC_HEADING[type]}`, "");
    for (const ioc of list) out.push(`- ${code(input.defang ? defang(ioc.type, ioc.value) : ioc.value)} — ${ioc.sources.join(", ")}`);
    out.push("");
  }

  out.push("---", "", `Generated by Perspicax. Indicators are ${input.defang ? "" : "not "}defanged.`);
  return out.join("\n");
}
```

```ts file=src/lib/report/json.ts
import type { ReportInput } from "./markdown.ts";
import { BAND_LABEL } from "../score/score.ts";

/** The full analysis as JSON, raw (not defanged), without attachment contents. */
export function reportJson(input: Omit<ReportInput, "defang">): string {
  const { email, report, file, generatedAt } = input;
  return JSON.stringify(
    {
      generator: "Perspicax",
      generatedAt: generatedAt.toISOString(),
      file,
      source: email.source,
      subject: report.headers.subject,
      from: report.headers.sender.from,
      date: report.headers.date,
      verdict: {
        score: report.score.score,
        band: report.score.band,
        label: BAND_LABEL[report.score.band],
        categories: report.score.categories,
      },
      findings: report.findings,
      authentication: report.headers.auth,
      dkim: report.dkim.map((check) => ({ ...check.signature, result: check.result })),
      relayChain: report.headers.hops,
      sender: report.headers.sender.rows,
      vendors: report.headers.vendors,
      links: report.links.links.map((link) => ({
        source: link.source,
        attachment: link.attachment,
        origin: link.origin,
        text: link.text,
        hidden: link.hidden,
        shownHost: link.shownHost,
        tracking: link.tracking,
        ...link.url,
      })),
      forms: report.links.forms,
      attachments: report.attachments.map((a) => ({
        filename: a.filename,
        visibleName: a.visibleName,
        declaredType: a.declaredType,
        inline: a.inline,
        size: a.size,
        detected: a.detected,
        hashes: a.hashes,
        flags: a.flags,
        details: a.details,
        entries: a.entries,
        urls: a.urls,
        qr: a.qr,
      })),
      iocs: report.iocs,
      warnings: email.warnings,
    },
    null,
    2,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ioc src/lib/report
git commit -m "Export the analysis as a ticket report or JSON

The Markdown report carries the verdict and score, the message's
identity, every finding with its evidence, authentication results and
DKIM body-hash checks, the relay chain, flagged links, attachments with
their hashes, and the indicators grouped by type. It is defanged by
default — URLs, addresses, IPs and domains, prose included — so pasting
it into a ticket creates no live link. The JSON export is the raw
analysis for tooling, without attachment contents."
```

---

### Task 7: Verdict block, export, settings panel, .msg in the page

**Files:**
- Create: `src/components/VerdictBlock.tsx`, `src/components/ExportBar.tsx`, `src/components/SettingsPanel.tsx`
- Modify: `src/components/CopyButton.tsx`, `src/components/TopBar.tsx`, `src/components/ReportView.tsx`, `src/components/HeadersTab.tsx`, `src/components/IocsTab.tsx`, `src/components/EntryPanel.tsx`, `src/app/page.tsx` (full replacement)

**Interfaces:**
- Consumes: `Score`, `BAND_LABEL`, `BAND_FLOORS` (Task 3), `DkimCheck` (Task 1), `parseMsg` (Task 2), `Settings`, `normaliseDomain`, `isValidTemplate`, `DEFAULT_SETTINGS` (Task 5), `reportMarkdown`, `reportJson` (Task 6).

- [ ] **Step 1: Copy button accepts computed text**

In `src/components/CopyButton.tsx`, change the props type to `{ text: string | (() => string); label?: string }` and replace `await navigator.clipboard.writeText(text);` with `await navigator.clipboard.writeText(typeof text === "function" ? text() : text);`.

- [ ] **Step 2: Verdict block**

```tsx file=src/components/VerdictBlock.tsx
import { BAND_FLOORS, BAND_LABEL, type Band, type Score } from "@/lib/score/score";
import { LABEL } from "./ui";

const TONE: Record<Band, string> = {
  clean: "text-muted",
  suspicious: "text-ink console:text-signal-fg",
  "likely-phishing": "text-signal-fg",
  malicious: "text-signal-fg",
};

const strong = (band: Band) => band === "likely-phishing" || band === "malicious";

/**
 * Swiss: a very large numeral over a 0–100 scale marked at the band
 * floors. Console: the numeral in the signal colour, an inverted band
 * label and a segmented gauge. Hidden in the dossier theme, which shows
 * the stamp instead.
 */
export function VerdictBlock({ score }: { score: Score }) {
  const label = BAND_LABEL[score.band];
  return (
    <section aria-label={`Verdict: ${label}, risk score ${score.score} out of 100`} className="dossier:hidden">
      <p className={`${LABEL} console:hidden`}>Risk score</p>
      <p className="mt-1 flex items-baseline gap-2 console:mt-0">
        <span className="font-display text-[7.5rem] leading-[0.82] font-extrabold tracking-[-0.045em] tabular-nums [font-stretch:88%] console:text-6xl console:leading-none console:font-medium console:tracking-tight console:text-signal-fg">
          {score.score}
        </span>
        <span className="text-sm text-muted">/100</span>
      </p>
      <p
        className={`mt-2 inline-block text-xl font-bold tracking-tight ${TONE[score.band]} console:text-sm console:font-semibold console:tracking-normal ${
          strong(score.band) ? "console:bg-signal console:px-1.5 console:text-on-signal" : ""
        }`}
      >
        {label}
      </p>
      <div aria-hidden className="relative mt-3 h-6 max-w-sm border-t border-rule console:hidden">
        {[...BAND_FLOORS.map((f) => f.from), 100].map((from) => (
          <span key={from} className="absolute top-0 h-1.5 border-l border-rule" style={{ left: from === 100 ? "calc(100% - 1px)" : `${from}%` }}>
            <span className="absolute top-2 -translate-x-1/2 text-[9.5px] text-muted">{from}</span>
          </span>
        ))}
        <span className="absolute -top-[5px] h-[13px] w-[3px] bg-signal" style={{ left: `calc(${score.score}% - 1px)` }} />
      </div>
      <div
        aria-hidden
        className="relative mt-3 hidden h-2 max-w-[11rem] bg-[repeating-linear-gradient(90deg,var(--px-hairline)_0_4px,transparent_4px_6px)] console:block"
      >
        <div
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,var(--px-signal)_0_4px,transparent_4px_6px)]"
          style={{ width: `${score.score}%` }}
        />
      </div>
    </section>
  );
}

/** Dossier only: the verdict as a rubber stamp on the report. */
export function VerdictStamp({ score }: { score: Score }) {
  const red = score.band !== "clean";
  return (
    <div
      className={`pointer-events-none absolute top-6 right-0 hidden -rotate-[5deg] border-[3px] border-double px-3 pt-1.5 pb-1 text-center font-data font-bold mix-blend-multiply dossier:block ${
        red ? "border-signal text-signal-fg" : "border-ink text-ink"
      }`}
    >
      <span className="block text-xl leading-tight tracking-[0.12em] uppercase">{BAND_LABEL[score.band]}</span>
      <span className="text-xs tracking-[0.08em]">score {score.score} / 100</span>
    </div>
  );
}
```

- [ ] **Step 3: Export bar**

```tsx file=src/components/ExportBar.tsx
"use client";

import type { EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { reportJson } from "@/lib/report/json";
import { reportMarkdown } from "@/lib/report/markdown";
import CopyButton from "./CopyButton";
import { LABEL, SMALL_BUTTON } from "./ui";

/** Saves text through a local Blob URL: nothing is uploaded, nothing fetched. */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportBar({ email, report, file, defang }: {
  email: ParsedEmail;
  report: EmailReport;
  file: { name: string; size: number };
  defang: boolean;
}) {
  const markdown = () => reportMarkdown({ email, report, file, generatedAt: new Date(), defang });
  const base = file.name.replace(/\.[^.]+$/, "") || "email";
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span className={LABEL}>Report</span>
      <CopyButton text={markdown} label="Copy Markdown" />
      <button type="button" className={SMALL_BUTTON} onClick={() => download(`${base}.perspicax.md`, markdown(), "text/markdown")}>
        Download .md
      </button>
      <button
        type="button"
        className={SMALL_BUTTON}
        onClick={() => download(`${base}.perspicax.json`, reportJson({ email, report, file, generatedAt: new Date() }), "application/json")}
      >
        Download .json
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Settings panel**

```tsx file=src/components/SettingsPanel.tsx
"use client";

import { useState } from "react";
import { IOC_TYPES } from "@/lib/ioc/types";
import { DEFAULT_PIVOTS, type PivotService } from "@/lib/pivots/pivots";
import { DEFAULT_SETTINGS, SETTINGS_KEY, isValidTemplate, normaliseDomain, type Settings } from "@/lib/settings";
import { BUTTON, BUTTON_PRIMARY, DATA, FLAG, SECTION_TITLE, SMALL_BUTTON } from "./ui";

const FIELD = "border border-hairline bg-paper px-2 py-1 focus-visible:outline-2 focus-visible:outline-signal console:bg-panel";

export default function SettingsPanel({ settings, onChange, onClose }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [domains, setDomains] = useState(settings.orgDomains.join("\n"));
  const [pivots, setPivots] = useState<PivotService[]>(settings.pivots);

  const entered = domains.split(/[\s,;]+/).filter(Boolean);
  const invalid = entered.filter((d) => normaliseDomain(d) === null);
  const valid = [...new Set(entered.map(normaliseDomain).filter((d): d is string => d !== null))];
  const brokenPivots = pivots.filter((p) => !p.name.trim() || p.types.length === 0 || !isValidTemplate(p.template));
  const update = (index: number, patch: Partial<PivotService>) =>
    setPivots((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 console:py-4">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b-[3px] border-rule pb-4 console:border-b console:border-hairline dossier:border-b-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight console:text-lg console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
          Settings
        </h1>
        <button type="button" className={BUTTON} onClick={onClose}>
          Done
        </button>
      </div>

      <div className="grid gap-12 lg:grid-cols-12 console:gap-6">
        <div className="grid content-start gap-10 lg:col-span-5 console:gap-6">
          <section aria-labelledby="org-title">
            <h2 id="org-title" className={SECTION_TITLE}>
              Organisation domains
            </h2>
            <p className="mb-2 text-sm text-muted">
              Your own domains, one per line. A spoofed sender in one of them weighs more, and domains that imitate them are
              flagged.
            </p>
            <textarea
              aria-label="Organisation domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="example.com"
              className={`${DATA} ${FIELD} w-full`}
            />
            {invalid.length > 0 && <p className={`${FLAG} text-sm`}>Not a domain: {invalid.join(", ")}</p>}
            <button
              type="button"
              className={`${BUTTON_PRIMARY} mt-2`}
              disabled={valid.join("\n") === settings.orgDomains.join("\n")}
              onClick={() => onChange({ ...settings, orgDomains: valid })}
            >
              Save domains
            </button>
          </section>

          <section aria-labelledby="ioc-settings-title">
            <h2 id="ioc-settings-title" className={SECTION_TITLE}>
              Indicators
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-signal"
                checked={settings.defang}
                onChange={(e) => onChange({ ...settings, defang: e.target.checked })}
              />
              Defang by default — in the IOCs tab, when copying, and in the Markdown report
            </label>
          </section>

          <section aria-labelledby="storage-title">
            <h2 id="storage-title" className={SECTION_TITLE}>
              Storage
            </h2>
            <p className="text-sm text-muted">
              These settings are the only thing Perspicax keeps, in this browser, under{" "}
              <span className={DATA}>{SETTINGS_KEY}</span>. Emails are never stored.
            </p>
            <button
              type="button"
              className={`${BUTTON} mt-2`}
              onClick={() => {
                setDomains("");
                setPivots(DEFAULT_PIVOTS);
                onChange({ ...DEFAULT_SETTINGS, theme: settings.theme });
              }}
            >
              Reset settings
            </button>
          </section>
        </div>

        <section aria-labelledby="pivot-title" className="lg:col-span-7">
          <h2 id="pivot-title" className={SECTION_TITLE}>
            Pivot services
          </h2>
          <p className="mb-3 text-sm text-muted">
            URL templates: <span className={DATA}>{"{value}"}</span> is the indicator URL-encoded,{" "}
            <span className={DATA}>{"{raw}"}</span> as is, <span className={DATA}>{"{base64url}"}</span> in VirusTotal&apos;s URL form.
            A pivot opens only when you click it.
          </p>
          <ul className="border-t border-rule console:border-hairline">
            {pivots.map((pivot, i) => (
              <li key={pivot.id} className="grid gap-1.5 border-b border-hairline py-2.5">
                <div className="flex flex-wrap gap-2">
                  <input
                    aria-label="Service name"
                    value={pivot.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className={`${FIELD} w-36 text-sm`}
                  />
                  <input
                    aria-label="URL template"
                    value={pivot.template}
                    onChange={(e) => update(i, { template: e.target.value })}
                    spellCheck={false}
                    className={`${DATA} ${FIELD} min-w-0 flex-1 ${isValidTemplate(pivot.template) ? "" : "border-signal"}`}
                  />
                  <button type="button" className={SMALL_BUTTON} onClick={() => setPivots((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
                <fieldset className="flex flex-wrap gap-x-4 text-xs">
                  <legend className="sr-only">Indicator types for {pivot.name || "this service"}</legend>
                  {IOC_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-signal"
                        checked={pivot.types.includes(type)}
                        onChange={(e) =>
                          update(i, { types: e.target.checked ? [...pivot.types, type] : pivot.types.filter((t) => t !== type) })
                        }
                      />
                      {type}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() =>
                setPivots((list) => [...list, { id: `custom-${Date.now().toString(36)}`, name: "", types: ["domain"], template: "https://" }])
              }
            >
              Add a service
            </button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setPivots(DEFAULT_PIVOTS)}>
              Restore defaults
            </button>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={brokenPivots.length > 0}
              onClick={() => onChange({ ...settings, pivots })}
            >
              Save services
            </button>
          </div>
          {brokenPivots.length > 0 && (
            <p className={`${FLAG} mt-2 text-sm`}>
              Every service needs a name, at least one type, and an http(s) template containing {"{value}"}, {"{raw}"} or{" "}
              {"{base64url}"}.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Top bar, entry text, headers tab, IOCs tab, report view**

In `src/components/TopBar.tsx`:
- add `settingsOpen: boolean;` and `onSettings: () => void;` to the props type and destructuring;
- right before `<ThemeSwitch theme={theme} onChange={onTheme} />`, add:

```tsx
        <button
          id="open-settings"
          type="button"
          aria-pressed={settingsOpen}
          className={`${BUTTON} aria-pressed:bg-ink aria-pressed:text-paper`}
          onClick={onSettings}
        >
          Settings
        </button>
```

In `src/components/EntryPanel.tsx`, replace `A <span className={DATA}>.eml</span> file from any mail client, or the raw headers of a message.` with `A <span className={DATA}>.eml</span> or Outlook <span className={DATA}>.msg</span> file, or the raw headers of a message.`

In `src/components/HeadersTab.tsx`:
- add `import type { DkimCheck } from "@/lib/dkim/bodyhash";`
- change the component signature to `export default function HeadersTab({ report, headers, dkim }: { report: HeaderReport; headers: HeaderField[]; dkim: DkimCheck[] })` and render `<Authentication auth={report.auth} dkim={dkim} />`;
- change `function Authentication({ auth }: { auth: AuthSummary })` to `function Authentication({ auth, dkim }: { auth: AuthSummary; dkim: DkimCheck[] })` and, just before that section's closing `</section>`, add:

```tsx
      {dkim.length > 0 && (
        <ul className="mt-3 grid gap-0.5 text-sm console:text-xs">
          {dkim.map((check, i) => (
            <li key={i}>
              <span className={LABEL}>DKIM body hash</span>{" "}
              <span className={DATA}>
                d={check.signature.domain} s={check.signature.selector}
              </span>{" "}
              —{" "}
              <span className={check.result === "mismatch" ? FLAG : "text-muted"}>
                {check.result === "match" ? "matches the body" : check.result === "mismatch" ? "body changed after signing" : "algorithm not supported"}
              </span>
            </li>
          ))}
        </ul>
      )}
```

In `src/components/IocsTab.tsx`:
- import `type PivotService` from `@/lib/pivots/pivots` (keep `pivotsFor`, drop `DEFAULT_PIVOTS`);
- change the signature to `export default function IocsTab({ iocs, pivots, defangDefault }: { iocs: Ioc[]; pivots: PivotService[]; defangDefault: boolean })` and `useState(true)` to `useState(defangDefault)`;
- pass `pivots={pivots}` to `IocRow`, add `pivots: PivotService[]` to its props, and use `pivotsFor(ioc, pivots)`.

In `src/components/ReportView.tsx`:
- add imports `import ExportBar from "./ExportBar";`, `import { VerdictBlock, VerdictStamp } from "./VerdictBlock";`, `import type { PivotService } from "@/lib/pivots/pivots";`;
- change the props to `{ email, report, file, defang, pivots }: { email: ParsedEmail; report: EmailReport; file: { name: string; size: number }; defang: boolean; pivots: PivotService[] }`;
- give the header grid `relative` (prepend `relative ` to its `className`) and make `<VerdictStamp score={report.score} />` its first child;
- at the top of the left column, before `<p className={LABEL}>Subject</p>`, add `<VerdictBlock score={report.score} />`, and change that subject label to `<p className={`${LABEL} mt-6 console:mt-3 dossier:mt-0`}>Subject</p>`;
- add `dossier:pr-56` to the subject `<h1>` className so the stamp never covers it;
- after the warnings `<details>` block (still inside the left column), add `<ExportBar email={email} report={report} file={file} defang={defang} />`;
- pass the new props down: `<HeadersTab report={headers} headers={email.headers} dkim={report.dkim} />` and `<IocsTab iocs={report.iocs} pivots={pivots} defangDefault={defang} />`.

- [ ] **Step 6: Page**

```tsx file=src/app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImage } from "@/components/decodeImage";
import EntryPanel from "@/components/EntryPanel";
import Footer from "@/components/Footer";
import { parseHtml } from "@/components/parseHtml";
import ReportView from "@/components/ReportView";
import SettingsPanel from "@/components/SettingsPanel";
import TopBar, { type FileMeta } from "@/components/TopBar";
import { useSettings } from "@/hooks/useSettings";
import { analyzeEmail, type EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { parseEmail, parseHeadersOnly } from "@/lib/mime/parse";
import { parseMsg } from "@/lib/msg/parse";

/** The current email. It lives here, in memory, and nowhere else. */
type Loaded = { id: number; email: ParsedEmail; file: FileMeta };

// OLE compound files (.msg) start with this signature, whatever their name.
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export default function Home() {
  const { settings, setSettings, loaded: settingsLoaded } = useSettings();
  const [current, setCurrent] = useState<Loaded | null>(null);
  const [result, setResult] = useState<{ id: number; report: EmailReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const nextId = useRef(0);
  const orgDomains = settings.orgDomains.join("\n");

  const load = useCallback((parse: () => ParsedEmail, name: string, size: number) => {
    try {
      const start = performance.now();
      const email = parse();
      setCurrent({ id: ++nextId.current, email, file: { name, size, parseMs: Math.round(performance.now() - start) } });
      setError(null);
      setShowSettings(false);
    } catch (err) {
      setError(`Could not read this email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Analyses the email in memory, and again whenever the organisation's domains change.
  useEffect(() => {
    if (!current || !settingsLoaded) return;
    let cancelled = false;
    analyzeEmail(current.email, { orgDomains: orgDomains ? orgDomains.split("\n") : [], parseHtml, decodeImage })
      .then((report) => {
        if (!cancelled) setResult({ id: current.id, report });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [current, orgDomains, settingsLoaded]);

  const openFile = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isMsg = /\.msg$/i.test(file.name) || OLE_SIGNATURE.every((byte, i) => bytes[i] === byte);
      load(() => (isMsg ? parseMsg(bytes) : parseEmail(bytes)), file.name, bytes.length);
    },
    [load],
  );

  // A file dropped anywhere on the page is opened, replacing the current one.
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openFile]);

  const report = current && result?.id === current.id ? result.report : null;

  let main: React.ReactNode;
  if (showSettings) {
    main = <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />;
  } else if (current && report) {
    main = (
      <ReportView
        key={current.id}
        email={current.email}
        report={report}
        file={current.file}
        defang={settings.defang}
        pivots={settings.pivots}
      />
    );
  } else if (current) {
    main = (
      <main className="flex-1 px-4 py-8 sm:px-6">
        <p role={error ? "alert" : "status"} className={error ? "font-semibold text-signal-fg" : "text-muted"}>
          {error ?? "Analysing…"}
        </p>
      </main>
    );
  } else {
    main = (
      <EntryPanel
        dragging={dragging}
        error={error}
        onFile={(file) => void openFile(file)}
        onHeaders={(text) => load(() => parseHeadersOnly(text), "Pasted headers", new TextEncoder().encode(text).length)}
      />
    );
  }

  return (
    <>
      <TopBar
        file={current?.file ?? null}
        theme={settingsLoaded ? settings.theme : null}
        onTheme={(theme) => setSettings((s) => ({ ...s, theme }))}
        onClose={() => {
          setCurrent(null);
          setResult(null);
        }}
        settingsOpen={showSettings}
        onSettings={() => setShowSettings((open) => !open)}
      />
      {main}
      <Footer />
    </>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "Show the verdict, export the report, edit settings, open .msg

The report opens with the score in each theme's form: a very large
numeral over the 0–100 scale (Swiss), an inverted label and segmented
gauge (console), a rubber stamp (dossier). Under it, the report can be
copied as Markdown or downloaded as Markdown or JSON, through a local
Blob URL.

A Settings view edits the organisation's domains, the defang default and
the pivot services; changing the domains re-analyses the email already in
memory. Outlook .msg files are recognised by name or by their OLE
signature, and the Headers tab shows each DKIM body-hash check."
```

---

### Task 8: Smoke test with .msg and settings

**Files:**
- Modify: `scripts/smoke.mjs`, `fixtures/smoke.json`

- [ ] **Step 1: Per-fixture settings and a settings screenshot**

In `scripts/smoke.mjs`:

1. Right after `await screenshot(`${theme}-empty.png`);` add:

```js
    await evaluate(`document.getElementById("open-settings").click()`);
    await evaluate("new Promise((ok) => setTimeout(ok, 300))");
    await screenshot(`${theme}-settings.png`);
```

2. Replace the first two lines of the fixture loop body

```js
      await load(base);
      const before = external.length;
```

with

```js
      // A fixture may run under settings of its own (organisation domains…).
      await load(base);
      await evaluate(`localStorage.setItem("perspicax.settings.v1", ${JSON.stringify(JSON.stringify({ theme, ...fixture.settings }))})`);
      await load(base);
      const before = external.length;
```

3. Replace

```js
      const name = `${theme}-${fixture.file.replace(/\W+/g, "-")}`;
```

with

```js
      const name = `${theme}-${fixture.file.replace(/\W+/g, "-")}${fixture.settings ? "-with-settings" : ""}`;
```

- [ ] **Step 2: Expectations**

```json file=fixtures/smoke.json
[
  {
    "file": "spoofed-invoice.eml",
    "expect": [
      "Malicious indicators",
      "Link text shows another destination",
      "HTML smuggling",
      "DMARC failed for rhone-energie.fr",
      "Microsoft 365 classified it as phishing",
      "Replies go to a different domain",
      "rhone-energie.fr.secure-login.click",
      "CAT: PHSH"
    ]
  },
  {
    "file": "spoofed-invoice.eml",
    "settings": { "orgDomains": ["rhone-energie.fr"] },
    "expect": ["Sender authentication failed for your own domain", "Malicious indicators"]
  },
  {
    "file": "clean-newsletter.eml",
    "expect": ["Nos coups de cœur d'octobre", "No finding", "matches the body"]
  },
  {
    "file": "lookalike-paypal.eml",
    "expect": [
      "Likely phishing",
      "Password form inside the email",
      "Lookalike domain",
      "pаypal.com (xn--pypal-4ve.com) imitates paypal.com",
      "Display name invokes PayPal"
    ]
  },
  {
    "file": "quishing-qr.eml",
    "expect": ["Likely phishing", "QR code in an image", "login-micros0ft365.com.verify-mfa.top", "Display name invokes Microsoft"]
  },
  {
    "file": "macro-docm.eml",
    "expect": ["Malicious indicators", "Office document with macros", "Office document loads a remote template", "cdn-office365.top"]
  },
  {
    "file": "rtlo-archive.eml",
    "expect": ["Malicious indicators", "File name uses a direction override", "Archive hides a program", "Commande_4471.pdf.exe"]
  },
  {
    "file": "docusign.msg",
    "expect": [
      "Suspicious",
      "Domain disguised as a subdomain",
      "Display name invokes DocuSign",
      "Microsoft composite authentication failed",
      "Contrat_4471.pdf"
    ]
  }
]
```

- [ ] **Step 3: Run**

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed: 3 themes × 8 fixtures.` Review `.smoke/*-settings.png` and the report headers in each theme: the large Swiss numeral and scale, the console gauge, the dossier stamp clear of the subject.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs fixtures/smoke.json
git commit -m "Smoke-test the .msg fixture, verdicts and settings

The smoke test checks each fixture's verdict band, opens the DocuSign
.msg through the file input, runs the spoofed invoice once more with the
organisation's domain configured, and screenshots the settings view in
every theme."
```

---

## Milestone 4 exit criteria

- `npm test`, `npm run lint`, `npm run build`, `npm run smoke` all pass.
- Verdicts: spoofed invoice, macro document, reversed archive — malicious indicators; PayPal lookalike (60), quishing (43) — likely phishing; DocuSign .msg (38) — suspicious; clean newsletter (0) — clean, DKIM body hash matching.
- The Markdown report holds no live URL, address, IP or domain when defanging is on.
- Settings survive a reload, are the only stored key, and survive hand-edited garbage.
