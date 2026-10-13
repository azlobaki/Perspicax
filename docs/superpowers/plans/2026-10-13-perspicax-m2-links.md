# Perspicax — Milestone 2 Implementation Plan (HTML, URLs, Links tab, safe preview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every link and remote resource of an email is listed with its real (unwrapped) destination and flags; deceptive, hidden, lookalike and tracking links become findings; the email can be read in a sandboxed preview that never touches the network.

**Architecture:** `urls/` inspects one URL (unwrapping, punycode, look-alikes, shorteners…); `html/` extracts links, forms and hidden content from a `Document` and builds the sanitised preview; `links/` joins both into `Link[]` + findings; `analyze.ts` combines header and link analysis into one `EmailReport`. The engine never creates a DOM itself: callers pass a `Document` (the browser's inert `DOMParser` in the app, `linkedom` in tests).

**Tech Stack:** as milestone 1, plus `linkedom` as a **dev** dependency (tests only; never bundled).

**Spec:** `docs/design/2026-10-13-perspicax-design.md` — milestone 2 of §7 (`html/`, `urls/`, Links tab, safe preview), §4 safe preview rules, §6 fixtures.

## Global Constraints

Everything in milestone 1's Global Constraints still applies (stack, no network, nothing persisted, `.ts` runtime imports in `src/lib/`, no TS syntax Node cannot strip, ES2017 regexes — so no lookbehind, no `\p{…}`, no `s` flag; tokens-only styling; author `azlobaki`, no Claude/Anthropic mention, no `CLAUDE.md`). In addition:

- The engine receives HTML as a `Document`; `src/lib/` never references `DOMParser` or `window`.
- Safe preview: `<iframe sandbox="">` (no `allow-*`), `srcdoc`, a CSP `default-src 'none'` meta inside it, remote images replaced by placeholders, links and forms disabled. Opening an email must never fire its tracking pixels.
- Production build adds a page CSP with `connect-src 'none'` so the browser itself refuses any connection.
- Organisation domains still come from settings in milestone 4; until then the app passes `orgDomains: []`.

## File structure (added in milestone 2)

```
src/lib/urls/punycode.ts     RFC 3492 decoding, host → Unicode
src/lib/urls/lookalike.ts    confusables skeleton, homoglyphs, lookalike of a reference domain
src/lib/urls/unwrap.ts       Safe Links, Proofpoint v2/v3, Google, Barracuda, Cisco, Sophos, Mimecast, generic ?url=
src/lib/urls/inspect.ts      one URL → InspectedUrl with flags
src/lib/urls/text.ts         URLs in plain text
src/lib/data/shorteners.ts, data/tlds.ts, data/trackers.ts
src/lib/html/style.ts        inline styles, stylesheets, colours, css url()
src/lib/html/extract.ts      links, images, forms, hidden elements, invisible characters
src/lib/html/preview.ts      sanitised srcdoc for the safe preview
src/lib/links/analyze.ts     Link[] + link findings
src/lib/analyze.ts           analyzeEmail → EmailReport (headers + links, findings merged)
src/components/parseHtml.ts, LinksTab.tsx, PreviewTab.tsx (+ ReportView, page, layout, Breakable, FindingsPanel updates)
fixtures/lookalike-paypal.eml
```

---

### Task 1: Punycode and look-alike domains

**Files:**
- Create: `src/lib/urls/punycode.ts`, `src/lib/urls/punycode.test.ts`, `src/lib/urls/lookalike.ts`, `src/lib/urls/lookalike.test.ts`

**Interfaces:**
- Consumes: `orgDomain` (`net/domain.ts`), `BRANDS` (`data/brands.ts`, tests only).
- Produces: `decodePunycode(label: string): string | null`, `hostToUnicode(host: string): string`; `skeleton(text: string): string`, `isHomoglyph(unicodeHost: string): boolean`, `editDistance(a: string, b: string): number`, `Reference = { domain: string; own: boolean }`, `lookalikeOf(unicodeHost: string, references: readonly Reference[]): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/urls/punycode.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { domainToUnicode } from "node:url";
import { decodePunycode, hostToUnicode } from "./punycode.ts";

test("decodes hosts exactly like Node's IDNA implementation", () => {
  for (const host of ["xn--pypal-4ve.com", "xn--mnchen-3ya.de", "xn--80ak6aa92e.com", "mail.xn--bcher-kva.example", "example.com"]) {
    assert.equal(hostToUnicode(host), domainToUnicode(host), host);
  }
});

test("keeps labels that are not valid Punycode", () => {
  assert.equal(decodePunycode("!!"), null);
  assert.equal(hostToUnicode("xn--!!.com"), "xn--!!.com");
});
```

```ts file=src/lib/urls/lookalike.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import { editDistance, isHomoglyph, lookalikeOf, skeleton, type Reference } from "./lookalike.ts";

const brands: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const own: Reference[] = [{ domain: "rhone-energie.fr", own: true }];

test("reduces look-alike spellings to one skeleton", () => {
  assert.equal(skeleton("paypa1"), skeleton("paypal"));
  assert.equal(skeleton("pаypal"), skeleton("paypal"));
  assert.equal(skeleton("rnicrosoft"), skeleton("microsoft"));
  assert.notEqual(skeleton("paypal"), skeleton("paypa"));
});

test("detects mixed-script and whole-script homoglyph labels", () => {
  assert.ok(isHomoglyph("pаypal.com"));
  assert.ok(isHomoglyph("аррӏе.com"));
  assert.ok(!isHomoglyph("münchen.de"));
  assert.ok(!isHomoglyph("почта.рф"));
  assert.ok(!isHomoglyph("example.com"));
});

test("measures edit distance with transpositions", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("ab", "ba"), 1);
  assert.equal(editDistance("same", "same"), 0);
});

test("finds the brand a domain imitates", () => {
  assert.equal(lookalikeOf("paypa1.com", brands), "paypal.com");
  assert.equal(lookalikeOf("pаypal.com", brands), "paypal.com");
  assert.equal(lookalikeOf("rnicrosoft.com", brands), "microsoft.com");
});

test("leaves brands, their other TLDs and unrelated domains alone", () => {
  for (const host of ["paypal.com", "www.paypal.com", "paypal.fr", "outlook.fr", "googleusercontent.com", "secure-login.click", "amazonaws.com"]) {
    assert.equal(lookalikeOf(host, brands), null, host);
  }
});

test("is stricter about the organisation's own domains", () => {
  assert.equal(lookalikeOf("rhone-energie.com", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhoneenergie.fr", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhone-energie-paiement.com", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("rhone-energle.fr", own), "rhone-energie.fr");
  assert.equal(lookalikeOf("espace-client.rhone-energie.fr", own), null);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `punycode.ts`, `lookalike.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/urls/punycode.ts
// RFC 3492 constants.
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}

function digitOf(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 22;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;
  return BASE;
}

/** Decodes the part of a label after `xn--`. Null when it is not valid Punycode. */
export function decodePunycode(input: string): string | null {
  const output: number[] = [];
  const delimiter = input.lastIndexOf("-");
  for (let j = 0; j < delimiter; j++) {
    const code = input.charCodeAt(j);
    if (code >= 0x80) return null;
    output.push(code);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = delimiter >= 0 ? delimiter + 1 : 0; index < input.length; ) {
    const oldI = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitOf(input.charCodeAt(index++));
      if (digit >= BASE) return null;
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
      if (w > 0x7fffffff) return null;
    }
    const length = output.length + 1;
    bias = adapt(i - oldI, length, oldI === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** `xn--pypal-4ve.com` → `pаypal.com`. Labels that fail to decode stay as they are. */
export function hostToUnicode(host: string): string {
  return host
    .split(".")
    .map((label) => (label.toLowerCase().startsWith("xn--") ? (decodePunycode(label.slice(4)) ?? label) : label))
    .join(".");
}
```

```ts file=src/lib/urls/lookalike.ts
import { orgDomain } from "../net/domain.ts";

/**
 * Letters from other scripts that render like Latin ones — a subset of
 * Unicode's confusables.txt, enough for the spoofs seen in mail.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  "а": "a", "в": "b", "е": "e", "ё": "e", "і": "i", "ї": "i", "ј": "j", "к": "k", "м": "m", "о": "o",
  "п": "n", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ь": "b", "ѕ": "s", "һ": "h", "ӏ": "l",
  "ԁ": "d", "ԛ": "q", "ԝ": "w",
  // Greek
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t",
  "υ": "u", "χ": "x", "ϲ": "c",
  // Latin letters that pass for plainer ones
  "ı": "i", "ɩ": "i", "ɑ": "a", "ɡ": "g", "ʀ": "r", "ȷ": "j", "ƚ": "l", "þ": "p",
};

/**
 * What a label looks like at a glance: confusable letters mapped to Latin,
 * then the ASCII tricks (`rn`→`m`, `vv`→`w`, `0`→`o`, `1`/`i`/`|`→`l`).
 */
export function skeleton(text: string): string {
  return [...text.toLowerCase()]
    .map((ch) => CONFUSABLES[ch] ?? ch)
    .join("")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/[1i|]/g, "l");
}

function scriptOf(ch: string): "latin" | "cyrillic" | "greek" | "common" | "other" {
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f)) return "latin";
  if ((code >= 0x30 && code <= 0x39) || ch === "-") return "common";
  if (code >= 0x370 && code <= 0x3ff) return "greek";
  if (code >= 0x400 && code <= 0x52f) return "cyrillic";
  return "other";
}

/**
 * A label mixing Latin with Cyrillic or Greek, or written entirely in
 * letters that all pass for Latin under an ASCII top-level domain.
 */
export function isHomoglyph(unicodeHost: string): boolean {
  const labels = unicodeHost.toLowerCase().split(".");
  const asciiTld = /^[a-z0-9-]+$/.test(labels[labels.length - 1] ?? "");
  return labels.some((label) => {
    if (/^[\x00-\x7f]*$/.test(label)) return false;
    const scripts = new Set([...label].map(scriptOf));
    if (scripts.has("latin") && (scripts.has("cyrillic") || scripts.has("greek"))) return true;
    return asciiTld && /^[a-z0-9-]+$/.test([...label].map((ch) => CONFUSABLES[ch] ?? ch).join(""));
  });
}

/** Optimal string alignment distance: insertions, deletions, substitutions, adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * A domain worth comparing against. `own` marks the organisation's domains:
 * for those, the same name under another TLD and names that merely contain
 * it count too — for brands they are too common to flag.
 */
export type Reference = { domain: string; own: boolean };

/** The reference domain `unicodeHost` imitates, or null. */
export function lookalikeOf(unicodeHost: string, references: readonly Reference[]): string | null {
  const org = orgDomain(unicodeHost);
  const label = org.split(".")[0];
  const shape = skeleton(label);
  for (const reference of references) {
    const refOrg = orgDomain(reference.domain);
    if (org === refOrg) return null;
  }
  for (const reference of references) {
    const refOrg = orgDomain(reference.domain);
    const refLabel = refOrg.split(".")[0];
    if (refLabel.length < 3) continue;
    if (label === refLabel) {
      if (reference.own) return refOrg;
      continue;
    }
    if (skeleton(refLabel) === shape) return refOrg;
    if (
      reference.own &&
      refLabel.length >= 5 &&
      (label.replace(/-/g, "") === refLabel.replace(/-/g, "") || label.includes(refLabel))
    ) {
      return refOrg;
    }
    if (refLabel.length >= 5 && editDistance(label, refLabel) <= (refLabel.length >= 9 ? 2 : 1)) return refOrg;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/urls
git commit -m "Spot internationalised and look-alike domains

Punycode is decoded in-house (RFC 3492) and checked against Node's IDNA
implementation. A domain is a homoglyph when a label mixes Latin with
Cyrillic or Greek, or is written entirely in letters that pass for Latin.
lookalikeOf compares a domain with reference domains by visual skeleton
and edit distance; the organisation's own domains are also matched under
other TLDs and inside longer names, which would be too noisy for brands."
```

---

### Task 2: Unwrapping rewritten links

**Files:**
- Create: `src/lib/urls/unwrap.ts`, `src/lib/urls/unwrap.test.ts`

**Interfaces:**
- Consumes: `decodeBase64` (`mime/bytes.ts`).
- Produces: `Wrapper = { service: string; url: string }`, `Unwrapped = { final: string; wrappers: Wrapper[]; opaque: string | null }`, `unwrapUrl(href: string): Unwrapped`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/urls/unwrap.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { unwrapUrl } from "./unwrap.ts";

const finalOf = (href: string) => unwrapUrl(href).final;

test("unwraps Microsoft Safe Links", () => {
  const href =
    "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Frhone-energie.fr.secure-login.click%2Fauth%3Fu%3Dj.martin&data=05%7C02&reserved=0";
  const { final, wrappers, opaque } = unwrapUrl(href);
  assert.equal(final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.deepEqual(wrappers, [{ service: "Microsoft Safe Links", url: href }]);
  assert.equal(opaque, null);
});

test("unwraps Proofpoint URL Defense v2 and v3", () => {
  assert.equal(
    finalOf("https://urldefense.proofpoint.com/v2/url?u=https-3A__xn-2D-2Dpypal-2D4ve.com_signin&d=DwMF&c=abc"),
    "https://xn--pypal-4ve.com/signin",
  );
  assert.equal(
    finalOf("https://urldefense.com/v3/__https://paypa1.com/resolution?case=4471*ref=mail__;Jg!!ORG!a1b2$"),
    "https://paypa1.com/resolution?case=4471&ref=mail",
  );
  assert.equal(finalOf("https://urldefense.com/v3/__https://e.com/a**Bb__;JiYm!!x"), "https://e.com/a&&&b");
});

test("unwraps Google, Barracuda, Cisco and Sophos redirects", () => {
  assert.equal(finalOf("https://www.google.com/url?q=https://example.com/x&sa=D"), "https://example.com/x");
  assert.equal(finalOf("https://linkprotect.cudasvc.com/url?a=https%3a%2f%2fevil.example%2f&c=E,1,abc&typo=1"), "https://evil.example/");
  assert.equal(finalOf("https://secure-web.cisco.com/1AbCdEf/https%3A%2F%2Fevil.example%2Flogin"), "https://evil.example/login");
  assert.equal(
    finalOf("https://eu-central-1.protection.sophos.com?d=example.com&u=aHR0cHM6Ly9ldmlsLmV4YW1wbGUvbG9naW4=&i=x"),
    "https://evil.example/login",
  );
});

test("follows generic redirect parameters and nested wrappers", () => {
  assert.equal(finalOf("https://click.example.net/track?id=1&url=https%3A%2F%2Fevil.example%2F"), "https://evil.example/");
  const nested = unwrapUrl(
    "https://eur01.safelinks.protection.outlook.com/?url=" +
      encodeURIComponent("https://www.google.com/url?q=https://evil.example/x"),
  );
  assert.equal(nested.final, "https://evil.example/x");
  assert.deepEqual(nested.wrappers.map((w) => w.service), ["Microsoft Safe Links", "Google redirect"]);
});

test("names gateways whose destination cannot be recovered offline", () => {
  const { final, wrappers, opaque } = unwrapUrl("https://protect-eu.mimecast.com/s/AbCdEf?domain=example.com");
  assert.equal(final, "https://protect-eu.mimecast.com/s/AbCdEf?domain=example.com");
  assert.deepEqual(wrappers, []);
  assert.equal(opaque, "Mimecast URL Protect");
});

test("leaves ordinary links alone", () => {
  assert.deepEqual(unwrapUrl("https://example.com/?u=notaurl"), { final: "https://example.com/?u=notaurl", wrappers: [], opaque: null });
  assert.deepEqual(unwrapUrl("not a url"), { final: "not a url", wrappers: [], opaque: null });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `unwrap.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/urls/unwrap.ts
import { decodeBase64 } from "../mime/bytes.ts";

export type Wrapper = { service: string; url: string };

export type Unwrapped = {
  /** Destination once every recognised wrapper is removed. */
  final: string;
  /** Each layer removed, outermost first, with the URL as it was at that layer. */
  wrappers: Wrapper[];
  /** A gateway that rewrote the link irreversibly (its destination is only known server-side). */
  opaque: string | null;
};

const MAX_LAYERS = 5;

// Parameters that commonly carry a redirect target; only absolute http(s) values count.
const REDIRECT_KEYS = ["url", "u", "target", "redirect", "redirect_url", "redirect_uri", "dest", "destination", "link", "goto", "next", "r"];

// Proofpoint v3 run-length alphabet: "**A" means two replaced characters, "**B" three…
const V3_RUNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const V3 = /^https?:\/\/urldefense(?:\.proofpoint)?\.com\/v3\/__(.+?)__;([^!]*)!/i;

function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function isAbsoluteHttp(value: string | null): value is string {
  return value !== null && /^https?:\/\//i.test(value);
}

function decodeProofpointV3(embedded: string, encoded: string): string {
  const replacement = [...new TextDecoder().decode(decodeBase64(encoded))];
  let next = 0;
  return embedded.replace(/\*(\*.)?/g, (_match, run: string | undefined) => {
    const length = run ? V3_RUNS.indexOf(run[1]) + 2 : 1;
    const chunk = replacement.slice(next, next + length).join("");
    next += length;
    return chunk;
  });
}

function unwrapOnce(href: string): Wrapper | { opaque: string } | null {
  const v3 = V3.exec(href);
  if (v3) return { service: "Proofpoint URL Defense", url: decodeProofpointV3(v3[1], v3[2]) };

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const param = (key: string) => url.searchParams.get(key);

  if (host.endsWith(".safelinks.protection.outlook.com") && isAbsoluteHttp(param("url"))) {
    return { service: "Microsoft Safe Links", url: param("url") as string };
  }
  if (host === "urldefense.proofpoint.com" && url.pathname.startsWith("/v2/url") && param("u")) {
    return { service: "Proofpoint URL Defense", url: decodeSafely((param("u") as string).replace(/-/g, "%").replace(/_/g, "/")) };
  }
  if (host === "urldefense.proofpoint.com" && url.pathname.startsWith("/v1/url") && isAbsoluteHttp(param("u"))) {
    return { service: "Proofpoint URL Defense", url: param("u") as string };
  }
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname === "/url") {
    const target = param("q") ?? param("url");
    if (isAbsoluteHttp(target)) return { service: "Google redirect", url: target };
  }
  if (host === "linkprotect.cudasvc.com" && isAbsoluteHttp(param("a"))) {
    return { service: "Barracuda Link Protection", url: param("a") as string };
  }
  if (host === "secure-web.cisco.com") {
    const last = decodeSafely(url.pathname.split("/").pop() ?? "");
    if (isAbsoluteHttp(last)) return { service: "Cisco Secure Email", url: last };
  }
  if (host.endsWith("protection.sophos.com") && param("u")) {
    const target = new TextDecoder().decode(decodeBase64(param("u") as string));
    if (isAbsoluteHttp(target)) return { service: "Sophos Time-of-Click", url: target };
  }
  if (/(^|\.)mimecast\.com$/.test(host) && url.pathname.startsWith("/s/")) return { opaque: "Mimecast URL Protect" };

  for (const key of REDIRECT_KEYS) {
    const target = param(key);
    if (isAbsoluteHttp(target)) return { service: "Redirect parameter", url: target };
  }
  return null;
}

/** Removes URL-rewriting layers (security gateways, redirectors) to reveal the real destination. */
export function unwrapUrl(href: string): Unwrapped {
  let current = href;
  const wrappers: Wrapper[] = [];
  for (let i = 0; i < MAX_LAYERS; i++) {
    const next = unwrapOnce(current);
    if (next === null) break;
    if ("opaque" in next) return { final: current, wrappers, opaque: next.opaque };
    wrappers.push({ service: next.service, url: current });
    current = next.url;
  }
  return { final: current, wrappers, opaque: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/urls
git commit -m "Unwrap links rewritten by mail gateways

Microsoft Safe Links, Proofpoint URL Defense v1/v2/v3 (including v3's
run-length replacement bytes), Google redirects, Barracuda, Cisco Secure
Email and Sophos are decoded offline, layer by layer, up to five deep,
with generic redirect parameters as a last resort. Mimecast's rewrites
cannot be reversed without its servers, so they are named rather than
guessed."
```

---

### Task 3: URL inspection

**Files:**
- Create: `src/lib/data/shorteners.ts`, `src/lib/data/tlds.ts`, `src/lib/data/trackers.ts`
- Create: `src/lib/urls/inspect.ts`, `src/lib/urls/inspect.test.ts`, `src/lib/urls/text.ts`, `src/lib/urls/text.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2, `orgDomain`, `normaliseHost` (`net/domain.ts`), `isIPv4` (`net/ip.ts`).
- Produces: `isShortener(host)`, `isAbusedTld(host)`, `isKnownTracker(host)`; `UrlFlag`, `InspectedUrl`, `inspectUrl(raw: string, options: { base?: string | null; references: readonly Reference[] }): InspectedUrl`; `findUrlsInText(text: string): string[]`.

- [ ] **Step 1: Reference lists**

```ts file=src/lib/data/shorteners.ts
import { normaliseHost, orgDomain } from "../net/domain.ts";

/** URL shorteners: the real destination is one more hop away. */
const SHORTENERS = new Set([
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "v.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "tiny.cc", "lnkd.in", "s.id",
  "shorte.st", "sh.st", "adf.ly", "bl.ink", "qrco.de", "x.co", "trib.al", "soo.gd", "clck.ru",
  "u.to", "urlz.fr", "lc.cx", "short.gy", "tinyurl.is", "shorturl.gg",
]);

export function isShortener(host: string): boolean {
  const h = normaliseHost(host);
  return SHORTENERS.has(h) || SHORTENERS.has(orgDomain(h));
}
```

```ts file=src/lib/data/tlds.ts
/**
 * Top-level domains that abuse reports keep pointing at: cheap or free to
 * register, rarely used by the organisations people deal with. A weak
 * signal on its own.
 */
const ABUSED_TLDS = new Set([
  "zip", "mov", "click", "top", "xyz", "cfd", "sbs", "rest", "quest", "cyou", "icu", "tk", "ml", "ga",
  "cf", "gq", "lol", "buzz", "monster", "cam", "beauty", "hair", "skin", "makeup", "bond", "autos",
  "boats", "yachts", "mom", "loan", "work", "fit", "gdn", "bid", "win", "review", "country", "kim",
  "stream", "download", "racing", "accountant", "date", "faith", "party", "science", "trade",
  "webcam", "men", "su",
]);

export function isAbusedTld(host: string): boolean {
  const tld = host.toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  return ABUSED_TLDS.has(tld);
}
```

```ts file=src/lib/data/trackers.ts
import { orgDomain } from "../net/domain.ts";

/**
 * Open- and click-tracking hosts of mailing services and analytics. A pixel
 * from one of these is ordinary marketing; one from anywhere else deserves
 * a look.
 */
const TRACKERS = new Set([
  "list-manage.com", "mailchimp.com", "mcsv.net", "sendgrid.net", "mailgun.org", "mailgun.net",
  "mandrillapp.com", "exacttarget.com", "exct.net", "hubspotemail.net", "hs-analytics.net",
  "sparkpostmail.com", "awstrack.me", "mjt.lu", "mailjet.com", "sendinblue.com", "brevo.com",
  "sendibt3.com", "sibautomation.com", "klaviyomail.com", "klclick.com", "klclick1.com",
  "createsend.com", "cmail19.com", "cmail20.com", "rs6.net", "constantcontact.com", "mktoresp.com",
  "pardot.com", "en25.com", "eloqua.com", "google-analytics.com", "doubleclick.net", "mailerlite.com",
  "mlsend.com", "getresponse.com", "acems1.com", "activehosted.com", "convertkit-mail.com",
  "emltrk.com", "sailthru.com", "pstmrk.it", "msgfocus.com", "emsecure.net", "neolane.net", "bnc.lt",
]);

export function isKnownTracker(host: string): boolean {
  return TRACKERS.has(orgDomain(host));
}
```

- [ ] **Step 2: Write the failing tests**

```ts file=src/lib/urls/inspect.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import { inspectUrl } from "./inspect.ts";
import type { Reference } from "./lookalike.ts";

const references: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const inspect = (raw: string, base?: string) => inspectUrl(raw, { base, references });

test("flags script and embedded-document links, not inline images", () => {
  assert.deepEqual(inspect("javascript:alert(1)").flags, ["javascript-url"]);
  assert.deepEqual(inspect("data:text/html;base64,PGgxPmhpPC9oMT4=").flags, ["data-url"]);
  assert.deepEqual(inspect("data:image/png;base64,iVBORw0KGgo=").flags, []);
});

test("unwraps, then inspects the real destination", () => {
  const url = inspect(
    "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Frhone-energie.fr.secure-login.click%2Fauth%3Fu%3Dj.martin&data=05%7C02",
  );
  assert.equal(url.final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal(url.host, "rhone-energie.fr.secure-login.click");
  assert.equal(url.wrappers.length, 1);
  assert.deepEqual(url.flags, ["disguised-domain", "abused-tld"]);
});

test("flags user-name tricks and bare IP addresses", () => {
  const userinfo = inspect("https://www.paypal.com@evil.example/x");
  assert.deepEqual(userinfo.flags, ["userinfo"]);
  assert.equal(userinfo.host, "evil.example");
  const ip = inspect("http://3232235777/login");
  assert.equal(ip.host, "192.168.1.1");
  assert.deepEqual(ip.flags, ["ip-host"]);
});

test("flags lookalike, homoglyph and plain internationalised domains", () => {
  const idn = inspect("https://xn--pypal-4ve.com/signin");
  assert.equal(idn.displayHost, "pаypal.com");
  assert.equal(idn.lookalikeOf, "paypal.com");
  assert.deepEqual(idn.flags, ["lookalike"]);
  assert.deepEqual(inspect("https://paypa1.com/x").flags, ["lookalike"]);
  assert.deepEqual(inspect("https://\u0435x\u0430mple.net/").flags, ["homoglyph"]);
  assert.deepEqual(inspect("https://xn--mnchen-3ya.de/").flags, ["punycode"]);
});

test("flags shorteners and opaque gateway rewrites", () => {
  assert.deepEqual(inspect("https://bit.ly/3xYz").flags, ["shortener"]);
  assert.deepEqual(inspect("https://protect-eu.mimecast.com/s/AbCdEf").flags, ["opaque-wrapper"]);
});

test("resolves relative links against the document base", () => {
  assert.equal(inspect("/path?a=1", "https://x.example/a/").href, "https://x.example/path?a=1");
});

test("reports unreadable links and passes other schemes through", () => {
  assert.deepEqual(inspect("not a url").flags, ["unparseable"]);
  const mail = inspect("mailto:a@b.com");
  assert.equal(mail.scheme, "mailto");
  assert.deepEqual(mail.flags, []);
});
```

```ts file=src/lib/urls/text.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { findUrlsInText } from "./text.ts";

test("finds URLs in plain text without their trailing punctuation", () => {
  assert.deepEqual(
    findUrlsInText("Voir https://example.com/a. Et (www.example.org/x) puis https://en.wikipedia.org/wiki/Foo_(bar)."),
    ["https://example.com/a", "http://www.example.org/x", "https://en.wikipedia.org/wiki/Foo_(bar)"],
  );
});

test("returns nothing for text without links", () => {
  assert.deepEqual(findUrlsInText("Bonjour, rien ici."), []);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `inspect.ts`, `text.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/urls/inspect.ts
import { isAbusedTld } from "../data/tlds.ts";
import { isShortener } from "../data/shorteners.ts";
import { orgDomain } from "../net/domain.ts";
import { isIPv4 } from "../net/ip.ts";
import { isHomoglyph, lookalikeOf, type Reference } from "./lookalike.ts";
import { hostToUnicode } from "./punycode.ts";
import { unwrapUrl, type Wrapper } from "./unwrap.ts";

export type UrlFlag =
  | "javascript-url"
  | "data-url"
  | "userinfo"
  | "lookalike"
  | "homoglyph"
  | "disguised-domain"
  | "ip-host"
  | "shortener"
  | "abused-tld"
  | "punycode"
  | "opaque-wrapper"
  | "unparseable";

export type InspectedUrl = {
  /** As written in the email. */
  raw: string;
  /** Absolute and normalised; null when it cannot be parsed. */
  href: string | null;
  /** Destination after unwrapping. */
  final: string | null;
  wrappers: Wrapper[];
  opaque: string | null;
  scheme: string | null;
  /** Host of `final`, ASCII (Punycode) form. */
  host: string | null;
  /** Host of `final` as a reader would see it (Unicode). */
  displayHost: string | null;
  lookalikeOf: string | null;
  flags: UrlFlag[];
};

// The part of a host before its registrable domain, when that part itself
// ends like a domain: `rhone-energie.fr` in `rhone-energie.fr.secure-login.click`.
const DOMAIN_LIKE = /(^|\.)[a-z0-9-]+\.(com|net|org|info|biz|fr|de|uk|co|io|eu|be|ch|es|it|nl|gov|edu)$/;

export function inspectUrl(raw: string, options: { base?: string | null; references: readonly Reference[] }): InspectedUrl {
  // Browsers drop tabs and line breaks inside URLs; senders use that to split them.
  const cleaned = raw.trim().replace(/[\t\n\r]/g, "");
  const result: InspectedUrl = {
    raw, href: null, final: null, wrappers: [], opaque: null, scheme: null,
    host: null, displayHost: null, lookalikeOf: null, flags: [],
  };

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1].toLowerCase() ?? null;
  if (scheme === "javascript" || scheme === "data") {
    result.scheme = scheme;
    result.href = cleaned;
    result.final = cleaned;
    if (scheme === "javascript") result.flags.push("javascript-url");
    else if (!/^data:image\//i.test(cleaned)) result.flags.push("data-url");
    return result;
  }

  let url: URL;
  try {
    url = options.base ? new URL(cleaned, options.base) : new URL(cleaned);
  } catch {
    result.flags.push("unparseable");
    return result;
  }
  result.href = url.href;
  result.scheme = url.protocol.slice(0, -1);
  if (result.scheme !== "http" && result.scheme !== "https") {
    result.final = url.href;
    return result;
  }
  if (url.username || url.password) result.flags.push("userinfo");

  const unwrapped = unwrapUrl(url.href);
  result.final = unwrapped.final;
  result.wrappers = unwrapped.wrappers;
  result.opaque = unwrapped.opaque;
  if (unwrapped.opaque) result.flags.push("opaque-wrapper");

  let final: URL;
  try {
    final = new URL(unwrapped.final);
  } catch {
    result.flags.push("unparseable");
    return result;
  }
  if ((final.username || final.password) && !result.flags.includes("userinfo")) result.flags.push("userinfo");

  const host = final.hostname.toLowerCase();
  result.host = host;
  result.displayHost = hostToUnicode(host);
  if (isIPv4(host) || host.startsWith("[")) {
    result.flags.push("ip-host");
    return result;
  }

  const imitated = lookalikeOf(result.displayHost, options.references);
  if (imitated) {
    result.lookalikeOf = imitated;
    result.flags.push("lookalike");
  } else if (isHomoglyph(result.displayHost)) {
    result.flags.push("homoglyph");
  } else if (host.split(".").some((label) => label.startsWith("xn--"))) {
    result.flags.push("punycode");
  }
  const org = orgDomain(host);
  const subdomain = host.length > org.length ? host.slice(0, -org.length - 1) : "";
  if (DOMAIN_LIKE.test(subdomain)) result.flags.push("disguised-domain");
  if (isShortener(host)) result.flags.push("shortener");
  if (isAbusedTld(host)) result.flags.push("abused-tld");
  return result;
}
```

```ts file=src/lib/urls/text.ts
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^[\]]+/gi;

const count = (text: string, ch: string) => text.split(ch).length - 1;

/** Drops punctuation that ends a sentence rather than the URL; keeps balanced parentheses. */
function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (last !== undefined && ".,;:!?'\"»".includes(last)) {
      out = out.slice(0, -1);
    } else if (last === ")" && count(out, "(") < count(out, ")")) {
      out = out.slice(0, -1);
    } else {
      return out;
    }
  }
}

/** Links written out in a plain-text body. `www.` addresses get an `http://` scheme. */
export function findUrlsInText(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimTrailing(match[0]);
    urls.push(/^www\./i.test(url) ? `http://${url}` : url);
  }
  return urls;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/urls src/lib/data
git commit -m "Inspect each link's real destination

inspectUrl resolves a link against the document base, unwraps it, and
flags what matters about where it really goes: script and data: URLs,
user-name tricks, bare IPs, lookalike and homoglyph domains, a domain
disguised as a subdomain, shorteners, abused TLDs and opaque gateway
rewrites. Plain-text bodies get their URLs extracted too."
```

---

### Task 4: Styles, stylesheets and colours

**Files:**
- Create: `src/lib/html/style.ts`, `src/lib/html/style.test.ts`

**Interfaces:**
- Produces: `parseStyle(style: string): Map<string, string>`, `hiddenReason(style: Map<string, string>): string | null`, `normaliseColor(value: string | null | undefined): string | null`, `StyleRules = { hidden: Map<string, string>; revealed: Set<string> }`, `parseStylesheet(css: string): StyleRules`, `cssUrls(css: string): string[]`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/html/style.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `style.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/html/style.ts
/** Inline declarations, lowercased, `!important` dropped. Later declarations win. */
export function parseStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).replace(/!important/gi, "").trim().toLowerCase();
    map.set(name, value);
  }
  return map;
}

const ZERO = /^-?0*\.?0*(px|pt|em|rem|ex|ch|vw|vh|%)?$/;

function isZero(value: string | undefined): boolean {
  return value !== undefined && value !== "" && ZERO.test(value);
}

function isFarOff(value: string | undefined): boolean {
  const n = parseFloat(value ?? "");
  return !Number.isNaN(n) && n <= -500;
}

/** Why these declarations make an element invisible to the reader, or null. */
export function hiddenReason(style: Map<string, string>): string | null {
  const get = (name: string) => style.get(name);
  if (get("display") === "none") return "display:none";
  if (get("visibility") === "hidden" || get("visibility") === "collapse") return "visibility:hidden";
  if (isZero(get("opacity"))) return "opacity:0";
  if (isZero(get("font-size"))) return "font-size:0";
  if (
    get("overflow") === "hidden" &&
    (isZero(get("max-height")) || isZero(get("height")) || isZero(get("max-width")) || isZero(get("width")))
  ) {
    return "zero size";
  }
  const positioned = get("position") === "absolute" || get("position") === "fixed";
  if ((positioned && (isFarOff(get("left")) || isFarOff(get("top")))) || isFarOff(get("text-indent"))) return "off-screen";
  return null;
}

const NAMED_COLORS: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", yellow: "#ffff00", navy: "#000080",
};

/** `#rrggbb`, or null for anything that is not a plain colour (transparent, gradients…). */
export function normaliseColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  const short = /^#([0-9a-f]{3})$/.exec(v);
  if (short) return `#${[...short[1]].map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

export type StyleRules = {
  /** `.class` / `#id` → why rules outside media queries hide it. */
  hidden: Map<string, string>;
  /** `.class` / `#id` that a media query shows again (responsive mail). */
  revealed: Set<string>;
};

const MEDIA_BLOCK = /@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g;

function rules(css: string): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** The class or id each selector finally targets: `td .hide` → `.hide`. */
function targets(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim().split(/\s+/).pop() ?? "")
    .map((compound) => /([.#][\w-]+)$/.exec(compound)?.[1] ?? "")
    .filter(Boolean);
}

export function parseStylesheet(css: string): StyleRules {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const revealed = new Set<string>();
  for (const block of text.matchAll(MEDIA_BLOCK)) {
    for (const [selector, declarations] of rules(block[1])) {
      const style = parseStyle(declarations);
      const display = style.get("display");
      const height = style.get("max-height");
      if ((display !== undefined && display !== "none") || (height !== undefined && !isZero(height))) {
        for (const key of targets(selector)) revealed.add(key);
      }
    }
  }
  const hidden = new Map<string, string>();
  for (const [selector, declarations] of rules(text.replace(MEDIA_BLOCK, ""))) {
    const reason = hiddenReason(parseStyle(declarations));
    if (reason) for (const key of targets(selector)) hidden.set(key, reason);
  }
  return { hidden, revealed };
}

/** Every resource a stylesheet or style attribute would fetch. */
export function cssUrls(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map((m) => m[2].trim());
  const imports = [...css.matchAll(/@import\s+(['"])(.*?)\1/gi)].map((m) => m[2].trim());
  return [...urls, ...imports];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/html
git commit -m "Read the styles mail uses to hide content

Inline styles and simple stylesheet rules are checked for the usual
hiding tricks: display, visibility, opacity, zero font size, zero-size
boxes and off-screen positioning. Rules inside media queries that show an
element again are recorded, so responsive newsletters that hide their
mobile variant are not mistaken for phishing."
```

---

### Task 5: HTML extraction

**Files:**
- Modify: `package.json` (dev dependency `linkedom`)
- Create: `src/lib/testing/dom.ts` (test-only DOM helper)
- Create: `src/lib/html/extract.ts`, `src/lib/html/extract.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces (tests only): `parseTestHtml(html: string): Document` from `src/lib/testing/dom.ts`.
- Produces: `HtmlOrigin = "a" | "area" | "form" | "img" | "css" | "link" | "meta-refresh" | "frame" | "media"`, `HtmlLink = { origin; raw: string; text: string | null; hidden: string | null; width: number | null; height: number | null }`, `HtmlForm = { action: string; method: string; fields: string[]; hasPassword: boolean }`, `HtmlExtract = { base: string | null; links: HtmlLink[]; forms: HtmlForm[]; brokenWords: string[]; bidiOverrides: number }`, `extractHtml(doc: Document): HtmlExtract`.

- [ ] **Step 1: Install the test DOM**

```bash
npm install --save-dev linkedom@^0.18.13
```

Expected: `package.json` gains `"linkedom": "^0.18.13"` under `devDependencies`.

Browsers' `DOMParser` wraps a fragment in `<html><head><body>`; linkedom makes the first element the root instead (and loses text), so tests go through one helper that wraps fragments first:

```ts file=src/lib/testing/dom.ts
import { DOMParser } from "linkedom";

/**
 * A Document for tests, built by linkedom. Browsers wrap an HTML fragment in
 * <html><head><body>; linkedom does not, so fragments are wrapped here to
 * behave like the app's DOMParser. Never imported by the app.
 */
export function parseTestHtml(html: string): Document {
  const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
  return new DOMParser().parseFromString(full, "text/html") as unknown as Document;
}
```

- [ ] **Step 2: Write the failing test**

```ts file=src/lib/html/extract.test.ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `extract.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/html/extract.ts
import { cssUrls, hiddenReason, normaliseColor, parseStyle, parseStylesheet, type StyleRules } from "./style.ts";

export type HtmlOrigin = "a" | "area" | "form" | "img" | "css" | "link" | "meta-refresh" | "frame" | "media";

export type HtmlLink = {
  origin: HtmlOrigin;
  /** Attribute value as written. */
  raw: string;
  /** Visible text of a link, alt text of an image or map area. */
  text: string | null;
  /** Why the reader cannot see it, or null. */
  hidden: string | null;
  /** Declared size, for images. */
  width: number | null;
  height: number | null;
};

export type HtmlForm = { action: string; method: string; fields: string[]; hasPassword: boolean };

export type HtmlExtract = {
  base: string | null;
  links: HtmlLink[];
  forms: HtmlForm[];
  /** Visible words with invisible characters inside, shown with `·`. */
  brokenWords: string[];
  /** Unicode direction overrides in visible text. */
  bidiOverrides: number;
};

const SKIP_TEXT = new Set(["script", "style", "head", "title", "noscript", "template"]);
const INVISIBLE = /[​‌⁠﻿­]/g;
const BROKEN_WORD = /[A-Za-zÀ-ɏ]+(?:[​‌⁠﻿­]+[A-Za-zÀ-ɏ]+)+/g;
const BIDI_OVERRIDE = /[‪-‮⁦-⁩]/g;
const SHOW_TEXT = 4;

function cleanText(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t || null;
}

function dimension(el: Element, name: "width" | "height"): number | null {
  const attr = el.getAttribute(name);
  const fromStyle = parseStyle(el.getAttribute("style") ?? "").get(name);
  const value = attr ?? (fromStyle && /^\d+(\.\d+)?(px)?$/.test(fromStyle) ? fromStyle : null);
  if (value === null) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Text colour and background colour in effect for an element, from inline styles and legacy attributes. */
function effectiveColors(el: Element): { color: string | null; background: string | null } {
  let color: string | null = null;
  let background: string | null = null;
  for (let node: Element | null = el; node && (color === null || background === null); node = node.parentElement) {
    const style = parseStyle(node.getAttribute("style") ?? "");
    color ??= normaliseColor(style.get("color")) ?? normaliseColor(node.tagName.toLowerCase() === "font" ? node.getAttribute("color") : null);
    background ??=
      normaliseColor(style.get("background-color")) ??
      (style.get("background") ?? "").split(/\s+/).map(normaliseColor).find((c) => c !== null) ??
      normaliseColor(node.getAttribute("bgcolor"));
  }
  return { color, background };
}

export function extractHtml(doc: Document): HtmlExtract {
  const sheets = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  const rules: StyleRules = parseStylesheet(sheets);
  const cache = new Map<Element, string | null>();

  const ownHidden = (el: Element): string | null => {
    if (el.hasAttribute("hidden")) return "hidden attribute";
    const id = el.getAttribute("id");
    const keys = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).map((c) => `.${c}`);
    if (id) keys.push(`#${id}`);
    // Responsive mail hides a variant inline and shows it again in a media query.
    if (keys.some((key) => rules.revealed.has(key))) return null;
    const inline = hiddenReason(parseStyle(el.getAttribute("style") ?? ""));
    if (inline) return inline;
    for (const key of keys) {
      const reason = rules.hidden.get(key);
      if (reason) return reason;
    }
    return null;
  };

  const hiddenOf = (el: Element | null): string | null => {
    if (el === null) return null;
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    const reason = ownHidden(el) ?? hiddenOf(el.parentElement);
    cache.set(el, reason);
    return reason;
  };

  const links: HtmlLink[] = [];
  const forms: HtmlForm[] = [];
  const add = (origin: HtmlOrigin, raw: string | null, el: Element | null, text: string | null = null) => {
    if (raw && raw.trim()) {
      links.push({ origin, raw: raw.trim(), text, hidden: el ? hiddenOf(el) : null, width: null, height: null });
    }
  };
  const addImage = (raw: string | null, el: Element) => {
    if (raw && raw.trim()) {
      links.push({
        origin: "img", raw: raw.trim(), text: cleanText(el.getAttribute("alt")), hidden: hiddenOf(el),
        width: dimension(el, "width"), height: dimension(el, "height"),
      });
    }
  };

  for (const el of doc.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "a": {
        const href = el.getAttribute("href");
        if (href && href.trim()) {
          const { color, background } = effectiveColors(el);
          const sameColour = color !== null && color === background ? "same colour as background" : null;
          links.push({
            origin: "a", raw: href.trim(), text: cleanText(el.textContent),
            hidden: hiddenOf(el) ?? sameColour, width: null, height: null,
          });
        }
        break;
      }
      case "area":
        add("area", el.getAttribute("href"), el, cleanText(el.getAttribute("alt")));
        break;
      case "form": {
        const fields = [...el.querySelectorAll("input, select, textarea")];
        forms.push({
          action: (el.getAttribute("action") ?? "").trim(),
          method: (el.getAttribute("method") ?? "get").toLowerCase(),
          fields: fields.map((f) => f.getAttribute("name") ?? f.getAttribute("type") ?? f.tagName.toLowerCase()),
          hasPassword: fields.some((f) => (f.getAttribute("type") ?? "").toLowerCase() === "password"),
        });
        add("form", el.getAttribute("action"), el);
        break;
      }
      case "img":
        addImage(el.getAttribute("src"), el);
        break;
      case "input":
        if ((el.getAttribute("type") ?? "").toLowerCase() === "image") addImage(el.getAttribute("src"), el);
        break;
      case "link":
        add("link", el.getAttribute("href"), el);
        break;
      case "meta":
        if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") {
          add("meta-refresh", /url\s*=\s*['"]?([^'"]+)/i.exec(el.getAttribute("content") ?? "")?.[1] ?? null, el);
        }
        break;
      case "iframe":
      case "frame":
      case "embed":
        add("frame", el.getAttribute("src"), el);
        break;
      case "object":
        add("frame", el.getAttribute("data"), el);
        break;
      case "video":
      case "audio":
      case "source":
      case "track":
        add("media", el.getAttribute("src"), el);
        if (tag === "video") add("img", el.getAttribute("poster"), el);
        break;
    }
    const background = el.getAttribute("background");
    if (background) addImage(background, el);
    const style = el.getAttribute("style");
    if (style) for (const url of cssUrls(style)) add("css", url, el);
  }
  for (const url of cssUrls(sheets)) add("css", url, null);

  // Only text a reader can actually see is checked for invisible tricks.
  let visible = "";
  const root = doc.body ?? doc.documentElement;
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName.toLowerCase()) || hiddenOf(parent)) continue;
    visible += `${node.textContent ?? ""} `;
  }

  return {
    base: doc.querySelector("base[href]")?.getAttribute("href") ?? null,
    links,
    forms,
    brokenWords: [...new Set([...visible.matchAll(BROKEN_WORD)].map((m) => m[0].replace(INVISIBLE, "·")))],
    bidiOverrides: (visible.match(BIDI_OVERRIDE) ?? []).length,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/html src/lib/testing
git commit -m "Extract links, forms and hidden content from HTML bodies

extractHtml walks a parsed (inert) document and records every link and
remote resource — anchors, map areas, forms, images, backgrounds, CSS
url() and @import, stylesheets, refresh redirects, frames and media —
with the reason it is invisible when it is: hidden by an ancestor, a
stylesheet class, or text coloured like its background. Visible text is
checked for words broken by invisible characters and for direction
overrides.

The engine takes a Document and never builds one itself; tests use
linkedom, a dev dependency that is never bundled."
```

---

### Task 6: Link analysis and findings

**Files:**
- Modify: `src/lib/finding.ts` (add categories)
- Modify: `fixtures/clean-newsletter.eml` (add an ESP open-tracking pixel)
- Create: `fixtures/lookalike-paypal.eml`
- Create: `src/lib/links/analyze.ts`, `src/lib/links/analyze.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 5, `ParsedEmail`, `Finding`, `sameOrg`, `isKnownTracker`.
- Produces: `LinkOrigin = HtmlOrigin | "text"`, `Link = { source: "html" | "text"; origin: LinkOrigin; text: string | null; hidden: string | null; url: InspectedUrl; shownHost: string | null; tracking: "pixel" | "tracker" | null }`, `LinkReport = { links: Link[]; forms: HtmlForm[]; findings: Finding[] }`, `LinkContext = { fromDomain: string | null; references: readonly Reference[] }`, `isClickable(link): boolean`, `analyzeLinks(email: ParsedEmail, doc: Document | null, context: LinkContext): LinkReport`.

- [ ] **Step 1: Finding categories**

In `src/lib/finding.ts`, replace the `FindingCategory` declaration and its comment with:

```ts
/** Milestone 3 adds attachment and body categories. */
export type FindingCategory = "auth" | "sender" | "route" | "vendor" | "link" | "html";
```

- [ ] **Step 2: Fixtures**

In `fixtures/clean-newsletter.eml`, add an open-tracking pixel from the mailing service as the last line of the HTML part, just before `--b1_nl_4471--`:

```
<img src=3D"https://u4471.ct.sendgrid.net/wf/open?upn=3DaBcD4471" width=3D"1" height=3D"1" alt=3D"">
```

Then create the third fixture:

```eml file=fixtures/lookalike-paypal.eml
Received: from mail.xn--pypal-4ve.com (mail.xn--pypal-4ve.com [45.83.122.17])
        by mx.google.com with ESMTPS id 7a1c2b3d4e5f
        for <claire.dupont@gmail.com>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 13 Oct 2026 05:41:09 -0700 (PDT)
Authentication-Results: mx.google.com;
       dkim=pass header.i=@xn--pypal-4ve.com header.s=k1;
       spf=pass (google.com: domain of service@xn--pypal-4ve.com designates 45.83.122.17 as permitted sender) smtp.mailfrom=service@xn--pypal-4ve.com;
       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=xn--pypal-4ve.com
Return-Path: <service@xn--pypal-4ve.com>
From: PayPal <service@xn--pypal-4ve.com>
To: claire.dupont@gmail.com
Subject: =?UTF-8?Q?Votre_compte_est_limit=C3=A9?=
Date: Tue, 13 Oct 2026 12:41:08 +0000
Message-ID: <c0ffee.4471@xn--pypal-4ve.com>
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html><body>
<p>V=C3=A9&#8203;rifiez votre com&#8203;pte sous 48&nbsp;heures.</p>
<p><a href=3D"https://urldefense.proofpoint.com/v2/url?u=3Dhttps-3A__xn-2D-2=
Dpypal-2D4ve.com_signin&d=3DDwMF&c=3Dabc">Se connecter =C3=A0 PayPal</a></p>
<p><a href=3D"https://urldefense.com/v3/__https://paypa1.com/resolution?case=
=3D4471*ref=3Dmail__;Jg!!ORG!a1b2$">R=C3=A9soudre le litige</a></p>
<div style=3D"display:none"><a href=3D"https://bit.ly/3xYz">x</a></div>
<form action=3D"https://xn--pypal-4ve.com/login" method=3D"post">
<input type=3D"email" name=3D"email"><input type=3D"password" name=3D"pass">
<button>Connexion</button>
</form>
</body></html>
```

- [ ] **Step 3: Write the failing test**

```ts file=src/lib/links/analyze.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BRANDS } from "../data/brands.ts";
import type { ParsedEmail } from "../email.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseTestHtml as parse } from "../testing/dom.ts";
import type { Reference } from "../urls/lookalike.ts";
import { analyzeLinks, isClickable } from "./analyze.ts";

const references: Reference[] = BRANDS.flatMap((b) => b.domains.map((domain) => ({ domain, own: false })));
const run = (email: ParsedEmail, fromDomain: string | null) =>
  analyzeLinks(email, email.html ? parse(email.html) : null, { fromDomain, references });
const fixture = (name: string) => parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
const htmlEmail = (html: string | null, text: string | null = null): ParsedEmail => ({
  source: "eml", headers: [], text, html, attachments: [], raw: "", warnings: [],
});

test("finds the deceptive Safe Links link and the pixel in the spoofed invoice", () => {
  const report = run(fixture("spoofed-invoice.eml"), "rhone-energie.fr");
  const anchor = report.links.find((l) => l.origin === "a");
  assert.equal(anchor?.shownHost, "espace-client.rhone-energie.fr");
  assert.equal(anchor?.url.final, "https://rhone-energie.fr.secure-login.click/auth?u=j.martin");
  assert.equal(anchor?.url.wrappers[0].service, "Microsoft Safe Links");
  assert.equal(report.links.find((l) => l.origin === "img")?.tracking, "pixel");
  assert.deepEqual(
    report.links.filter((l) => l.source === "text").map((l) => l.url.final),
    ["https://espace-client.rhone-energie.fr/"],
  );
  assert.deepEqual(report.findings.map((f) => f.id), [
    "link.deceptive",
    "url.disguised-domain",
    "url.abused-tld",
    "html.tracking-pixel",
  ]);
  assert.ok(report.findings[0].evidence.includes('"https://espace-client.rhone-energie.fr" → https://rhone-energie.fr.secure-login.click/auth?u=j.martin'));
});

test("stays silent on the clean newsletter, whose pixel is its mailing service's", () => {
  const report = run(fixture("clean-newsletter.eml"), "librairie-exemple.fr");
  assert.equal(report.links.find((l) => l.origin === "img")?.tracking, "tracker");
  assert.deepEqual(report.findings, []);
});

test("catches the PayPal lookalike's tricks", () => {
  const report = run(fixture("lookalike-paypal.eml"), "xn--pypal-4ve.com");
  assert.deepEqual(report.findings.map((f) => f.id).sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "url.lookalike",
    "url.shortener",
  ]);
  const lookalike = report.findings.find((f) => f.id === "url.lookalike");
  assert.deepEqual(lookalike?.evidence, ["pаypal.com imitates paypal.com", "paypa1.com imitates paypal.com"]);
  assert.equal(report.forms[0].hasPassword, true);
});

test("ignores pixels from the sender's own organisation and in-page anchors", () => {
  const report = run(
    htmlEmail(`<a href="#top">top</a><img src="https://news.shop.example/o.gif" width="1" height="1">`),
    "shop.example",
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.links.length, 1);
  assert.equal(isClickable(report.links[0]), false);
});

test("reports script links and user-name tricks", () => {
  const report = run(
    htmlEmail(`<a href="javascript:alert(1)">x</a><a href="https://www.paypal.com@evil.example/">PayPal</a>`),
    null,
  );
  assert.deepEqual(report.findings.map((f) => f.id), ["url.javascript-url", "url.userinfo"]);
});

test("reads links from a text-only body", () => {
  const report = run(htmlEmail(null, "Cliquez https://bit.ly/abc."), null);
  assert.deepEqual(report.links.map((l) => [l.origin, l.url.final]), [["text", "https://bit.ly/abc"]]);
  assert.deepEqual(report.findings.map((f) => f.id), ["url.shortener"]);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `links/analyze.ts`.

- [ ] **Step 5: Implement**

```ts file=src/lib/links/analyze.ts
import { isKnownTracker } from "../data/trackers.ts";
import type { ParsedEmail } from "../email.ts";
import type { Finding, Severity } from "../finding.ts";
import { extractHtml, type HtmlForm, type HtmlLink, type HtmlOrigin } from "../html/extract.ts";
import { sameOrg } from "../net/domain.ts";
import { inspectUrl, type InspectedUrl, type UrlFlag } from "../urls/inspect.ts";
import type { Reference } from "../urls/lookalike.ts";
import { findUrlsInText } from "../urls/text.ts";

export type LinkOrigin = HtmlOrigin | "text";

export type Link = {
  source: "html" | "text";
  origin: LinkOrigin;
  text: string | null;
  hidden: string | null;
  url: InspectedUrl;
  /** Domain the link text displays, when it is not where the link goes. */
  shownHost: string | null;
  tracking: "pixel" | "tracker" | null;
};

export type LinkReport = { links: Link[]; forms: HtmlForm[]; findings: Finding[] };

export type LinkContext = {
  fromDomain: string | null;
  /** Domains lookalikes are measured against: the organisation's own and well-known brands. */
  references: readonly Reference[];
};

const CLICKABLE = new Set<LinkOrigin>(["a", "area", "form", "meta-refresh", "text"]);

/** Links a reader can follow, as opposed to resources the email loads by itself. */
export function isClickable(link: Link): boolean {
  return CLICKABLE.has(link.origin);
}

// Link text that is itself an address: "https://espace-client.example.fr", "www.example.com/x".
const SHOWN_ADDRESS = /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i;

function shownHost(item: HtmlLink, url: InspectedUrl): string | null {
  if ((item.origin !== "a" && item.origin !== "area") || !item.text || !url.host) return null;
  const match = SHOWN_ADDRESS.exec(item.text);
  if (!match) return null;
  const shown = match[1].toLowerCase();
  return sameOrg(shown, url.host) ? null : shown;
}

function tracking(item: HtmlLink, url: InspectedUrl): Link["tracking"] {
  if (item.origin !== "img" || !url.host) return null;
  if (isKnownTracker(url.host)) return "tracker";
  const tiny = (n: number | null) => n !== null && n <= 2;
  const pixel =
    (tiny(item.width) && (tiny(item.height) || item.height === null)) ||
    (tiny(item.height) && item.width === null) ||
    item.hidden !== null;
  return pixel ? "pixel" : null;
}

export function analyzeLinks(email: ParsedEmail, doc: Document | null, context: LinkContext): LinkReport {
  const links: Link[] = [];
  let forms: HtmlForm[] = [];
  let brokenWords: string[] = [];
  let bidiOverrides = 0;

  if (doc) {
    const html = extractHtml(doc);
    forms = html.forms;
    brokenWords = html.brokenWords;
    bidiOverrides = html.bidiOverrides;
    for (const item of html.links) {
      if (item.raw.startsWith("#")) continue; // in-page anchors go nowhere
      const url = inspectUrl(item.raw, { base: html.base, references: context.references });
      links.push({
        source: "html", origin: item.origin, text: item.text, hidden: item.hidden, url,
        shownHost: shownHost(item, url), tracking: tracking(item, url),
      });
    }
  }
  if (email.text) {
    for (const raw of findUrlsInText(email.text)) {
      links.push({
        source: "text", origin: "text", text: null, hidden: null,
        url: inspectUrl(raw, { references: context.references }), shownHost: null, tracking: null,
      });
    }
  }
  return { links, forms, findings: linkFindings(links, forms, brokenWords, bidiOverrides, context) };
}

type FlagRule = { flag: UrlFlag; severity: Severity; weight: number; title: string; explanation: string };

const FLAG_RULES: FlagRule[] = [
  { flag: "lookalike", severity: "high", weight: 18, title: "Lookalike domain",
    explanation: "A link goes to a domain built to be mistaken for a known one." },
  { flag: "homoglyph", severity: "high", weight: 15, title: "Domain uses look-alike characters",
    explanation: "Letters from another alphabet stand in for Latin ones, so the domain reads like a familiar name." },
  { flag: "javascript-url", severity: "high", weight: 15, title: "Link runs a script",
    explanation: "A javascript: link executes code instead of opening a page." },
  { flag: "data-url", severity: "high", weight: 12, title: "Link opens embedded content",
    explanation: "A data: link carries a whole page inside the email, out of reach of URL filters." },
  { flag: "userinfo", severity: "high", weight: 15, title: "Destination hidden behind a user name",
    explanation: "Everything before @ in a link is a user name, not the site: the real destination comes after it." },
  { flag: "disguised-domain", severity: "high", weight: 15, title: "Domain disguised as a subdomain",
    explanation: "The link starts with a familiar domain, but that is only a subdomain of another one." },
  { flag: "ip-host", severity: "medium", weight: 8, title: "Link to a bare IP address",
    explanation: "Legitimate senders link to named sites; a raw IP address avoids domain reputation checks." },
  { flag: "shortener", severity: "low", weight: 4, title: "Shortened link",
    explanation: "A URL shortener hides the destination until the link is followed." },
  { flag: "abused-tld", severity: "low", weight: 3, title: "Top-level domain favoured by abuse",
    explanation: "The domain ends in a TLD that abuse reports single out. A weak signal by itself." },
  { flag: "punycode", severity: "info", weight: 0, title: "Internationalised domain",
    explanation: "The domain contains non-ASCII letters. Check how it reads." },
  { flag: "opaque-wrapper", severity: "info", weight: 0, title: "Link rewritten by a gateway",
    explanation: "A security gateway rewrote the link in a way that cannot be reversed offline; its destination is unknown here." },
];

const unique = (items: string[]) => [...new Set(items)].slice(0, 10);
const destination = (link: Link) => link.url.final ?? link.url.raw;

function linkFindings(
  links: Link[],
  forms: HtmlForm[],
  brokenWords: string[],
  bidiOverrides: number,
  context: LinkContext,
): Finding[] {
  const findings: Finding[] = [];
  const clickable = links.filter(isClickable);

  const deceptive = clickable.filter((l) => l.shownHost);
  if (deceptive.length > 0) {
    findings.push({
      id: "link.deceptive", category: "link", severity: "high", title: "Link text shows another destination",
      explanation: "The text of a link displays one address while the link goes somewhere else. Readers trust what they see.",
      evidence: unique(deceptive.map((l) => `"${l.text}" → ${destination(l)}`)), weight: 20,
    });
  }

  for (const rule of FLAG_RULES) {
    const hits = clickable.filter((l) => l.url.flags.includes(rule.flag));
    if (hits.length === 0) continue;
    findings.push({
      id: `url.${rule.flag}`, category: "link", severity: rule.severity, title: rule.title, explanation: rule.explanation,
      evidence: unique(hits.map((l) => (rule.flag === "lookalike" ? `${l.url.displayHost} imitates ${l.url.lookalikeOf}` : destination(l)))),
      weight: rule.weight,
    });
  }

  const hidden = clickable.filter((l) => l.hidden !== null);
  if (hidden.length > 0) {
    findings.push({
      id: "link.hidden", category: "link", severity: "medium", title: "Hidden links",
      explanation: "Links the reader cannot see are there for filters and crawlers, not for people.",
      evidence: unique(hidden.map((l) => `${destination(l)} (${l.hidden})`)), weight: 6,
    });
  }

  const pixels = links.filter(
    (l) => l.tracking === "pixel" && !(context.fromDomain && l.url.host && sameOrg(l.url.host, context.fromDomain)),
  );
  if (pixels.length > 0) {
    findings.push({
      id: "html.tracking-pixel", category: "html", severity: "low", title: "Tracking pixel",
      explanation: "An invisible image tells its server when the email is opened, confirming the address is read. The safe preview never loads it.",
      evidence: unique(pixels.map(destination)), weight: 4,
    });
  }

  const formEvidence = (list: HtmlForm[]) => unique(list.map((f) => `${f.method.toUpperCase()} ${f.action || "(no action)"} — ${f.fields.join(", ")}`));
  const passwordForms = forms.filter((f) => f.hasPassword);
  if (passwordForms.length > 0) {
    findings.push({
      id: "html.password-form", category: "html", severity: "high", title: "Password form inside the email",
      explanation: "The email itself asks for a password. No legitimate service collects credentials that way.",
      evidence: formEvidence(passwordForms), weight: 18,
    });
  } else if (forms.length > 0) {
    findings.push({
      id: "html.form", category: "html", severity: "medium", title: "Form inside the email",
      explanation: "The email contains a form that sends what is typed into it to a server.",
      evidence: formEvidence(forms), weight: 10,
    });
  }

  if (brokenWords.length >= 2) {
    findings.push({
      id: "html.broken-words", category: "html", severity: "low", title: "Words broken by invisible characters",
      explanation: "Invisible characters inside words defeat keyword filters while the text still reads normally.",
      evidence: unique(brokenWords), weight: 4,
    });
  }
  if (bidiOverrides > 0) {
    findings.push({
      id: "html.bidi-override", category: "html", severity: "medium", title: "Text direction overrides",
      explanation: "Direction-override characters make text display in a different order than it is written, a trick used to disguise names and links.",
      evidence: [`${bidiOverrides} override character${bidiOverrides === 1 ? "" : "s"} in the visible text`], weight: 6,
    });
  }
  return findings;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (the milestone 1 parse and analyze tests still pass on the updated clean fixture).

- [ ] **Step 7: Commit**

```bash
git add src/lib/finding.ts src/lib/links fixtures
git commit -m "Turn links into findings

analyzeLinks inspects every link and remote resource of the HTML body and
every URL of the text body. Link text that shows another domain than the
real, unwrapped destination is the strongest signal; URL flags, hidden
links, tracking pixels from outside the sender's organisation and its
mailing services, forms (above all password forms), words broken by
invisible characters and direction overrides follow. Flags are only
scored on links a reader can follow, one finding per kind.

Adds a PayPal lookalike fixture (homoglyph and digit-swap domains behind
Proofpoint, a hidden shortened link, a password form, broken words) and
gives the clean newsletter its mailing service's open pixel."
```

---

### Task 7: Safe preview

**Files:**
- Create: `src/lib/html/preview.ts`, `src/lib/html/preview.test.ts`

**Interfaces:**
- Consumes: `Attachment` (`email.ts`), `bytesToBinary` (`mime/bytes.ts`).
- Produces: `PREVIEW_CSP: string`, `buildPreview(html: string, parseHtml: (html: string) => Document, attachments: readonly Attachment[]): string`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/html/preview.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `preview.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/html/preview.ts
import type { Attachment } from "../email.ts";
import { bytesToBinary } from "../mime/bytes.ts";

/** Inside the preview frame, nothing may load except inline styles and data: images. */
export const PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

const REMOVED = "script, noscript, iframe, frame, frameset, object, embed, applet, portal, link, meta, base, template";
const SOURCE_ATTRIBUTES = ["src", "background", "poster", "data"];
const MAX_INLINE_IMAGE = 2_000_000;

// Shown in place of every remote image; scaled to the image's declared size.
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='48'><rect width='100%' height='100%' fill='#e4e4e0'/>" +
      "<text x='50%' y='56%' font-family='sans-serif' font-size='11' fill='#555' text-anchor='middle'>remote image blocked</text></svg>",
  );

function stripCssUrls(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:image\/)[^)]*?\1\s*\)/gi, "none");
}

function safeImageSource(value: string, images: Map<string, Attachment>): string {
  const v = value.trim();
  if (/^cid:/i.test(v)) {
    const image = images.get(decodeURIComponent(v.slice(4)).toLowerCase());
    return image ? `data:${image.contentType};base64,${btoa(bytesToBinary(image.data))}` : PLACEHOLDER;
  }
  return /^data:image\//i.test(v) ? v : PLACEHOLDER;
}

/**
 * The email's HTML, made inert for display in a sandboxed `srcdoc` frame:
 * active and fetching elements removed, event handlers dropped, links and
 * forms disarmed, remote images swapped for placeholders, remote CSS cut,
 * and a CSP that forbids any load as a second line of defence.
 */
export function buildPreview(
  html: string,
  parseHtml: (html: string) => Document,
  attachments: readonly Attachment[],
): string {
  const doc = parseHtml(html);
  const images = new Map(
    attachments
      .filter((a) => a.contentId && a.contentType.startsWith("image/") && a.data.length <= MAX_INLINE_IMAGE)
      .map((a) => [(a.contentId as string).toLowerCase(), a] as const),
  );

  for (const el of [...doc.querySelectorAll(REMOVED)]) el.remove();

  for (const el of [...doc.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcset" || name === "formaction" || name === "ping") {
        el.removeAttribute(attribute.name);
      }
    }
    if (tag === "a" || tag === "area") {
      const href = el.getAttribute("href");
      el.removeAttribute("href");
      if (href) el.setAttribute("title", `Link disabled in preview: ${href}`);
    } else {
      el.removeAttribute("href");
      el.removeAttribute("xlink:href");
    }
    if (tag === "form") el.removeAttribute("action");
    for (const name of SOURCE_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value !== null) el.setAttribute(name, safeImageSource(value, images));
    }
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", stripCssUrls(style));
  }
  for (const sheet of doc.querySelectorAll("style")) sheet.textContent = stripCssUrls(sheet.textContent ?? "");

  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", PREVIEW_CSP);
  doc.head.insertBefore(csp, doc.head.firstChild);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/html
git commit -m "Build an inert copy of the email for the safe preview

The preview HTML has scripts, frames, plugins, refreshes, bases and
stylesheets links removed, event handlers dropped, links and forms
disarmed (each link keeps its destination as a tooltip), remote images
replaced by a placeholder and remote CSS cut. Embedded cid: images are
inlined as data: URLs. A CSP meta that allows nothing but inline styles
and data: images sits first in its head, so even a missed element cannot
load anything."
```

---

### Task 8: One report for the whole email

**Files:**
- Create: `src/lib/analyze.ts`, `src/lib/analyze.test.ts`

**Interfaces:**
- Consumes: `analyzeHeaders`, `HeaderReport` (milestone 1), `analyzeLinks`, `LinkReport` (Task 6), `BRANDS`, `sortFindings`.
- Produces: `EmailReport = { headers: HeaderReport; links: LinkReport; findings: Finding[] }`, `AnalyzeOptions = { orgDomains: string[]; parseHtml: (html: string) => Document }`, `analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): EmailReport`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/analyze.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "./analyze.ts";
import { parseEmail, parseHeadersOnly } from "./mime/parse.ts";
import { parseTestHtml as parseHtml } from "./testing/dom.ts";

const read = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
const ids = (name: string, orgDomains: string[] = []) =>
  analyzeEmail(parseEmail(read(name)), { orgDomains, parseHtml }).findings.map((f) => f.id);

test("merges header and link findings, most severe first", () => {
  assert.deepEqual(ids("spoofed-invoice.eml"), [
    "link.deceptive",
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "url.disguised-domain",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
    "html.tracking-pixel",
    "url.abused-tld",
  ]);
});

test("uses the organisation's domains for both header and link checks", () => {
  const report = analyzeEmail(parseEmail(read("spoofed-invoice.eml")), { orgDomains: ["rhone-energie.fr"], parseHtml });
  assert.match(report.findings.find((f) => f.id === "auth.dmarc-fail")?.title ?? "", /your own domain/);
});

test("finds nothing on the clean newsletter", () => {
  assert.deepEqual(ids("clean-newsletter.eml"), []);
});

test("combines the lookalike's sender and link findings", () => {
  assert.deepEqual(ids("lookalike-paypal.eml").sort(), [
    "html.broken-words",
    "html.password-form",
    "link.hidden",
    "sender.brand-impersonation",
    "url.lookalike",
    "url.shortener",
  ]);
});

test("handles pasted headers, which have no body", () => {
  const report = analyzeEmail(parseHeadersOnly("From: a@b.com\nSubject: x"), { orgDomains: [], parseHtml });
  assert.deepEqual(report.links.links, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `src/lib/analyze.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/analyze.ts
import { BRANDS } from "./data/brands.ts";
import type { ParsedEmail } from "./email.ts";
import { sortFindings, type Finding } from "./finding.ts";
import { analyzeHeaders, type HeaderReport } from "./headers/analyze.ts";
import { analyzeLinks, type LinkReport } from "./links/analyze.ts";
import type { Reference } from "./urls/lookalike.ts";

export type EmailReport = {
  headers: HeaderReport;
  links: LinkReport;
  /** Every finding, most severe first. */
  findings: Finding[];
};

export type AnalyzeOptions = {
  orgDomains: string[];
  /** Builds an inert Document: the browser's DOMParser in the app, linkedom in tests. */
  parseHtml: (html: string) => Document;
};

const BRAND_REFERENCES: Reference[] = BRANDS.flatMap((brand) => brand.domains.map((domain) => ({ domain, own: false })));

export function analyzeEmail(email: ParsedEmail, options: AnalyzeOptions): EmailReport {
  const headers = analyzeHeaders(email, { orgDomains: options.orgDomains });
  const references = [...options.orgDomains.map((domain) => ({ domain, own: true })), ...BRAND_REFERENCES];
  const links = analyzeLinks(email, email.html ? options.parseHtml(email.html) : null, {
    fromDomain: headers.sender.from?.domain ?? null,
    references,
  });
  return { headers, links, findings: sortFindings([...headers.findings, ...links.findings]) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyze.ts src/lib/analyze.test.ts
git commit -m "Analyse a whole email in one call

analyzeEmail runs the header and link analyses and merges their findings,
most severe first. The organisation's domains count as references for
lookalike detection alongside well-known brands."
```

---

### Task 9: Links tab, preview tab, page CSP

**Files:**
- Create: `src/components/parseHtml.ts`, `src/components/LinksTab.tsx`, `src/components/PreviewTab.tsx`
- Modify: `src/components/Breakable.tsx` (more break points), `src/components/FindingsPanel.tsx` (empty message), `src/components/ReportView.tsx` (full replacement), `src/app/page.tsx` (analysis call), `src/app/layout.tsx` (CSP)

**Interfaces:**
- Consumes: `analyzeEmail`, `EmailReport` (Task 8), `Link`, `isClickable` (Task 6), `UrlFlag` (Task 3), `buildPreview` (Task 7).

- [ ] **Step 1: DOM helper and break points**

```ts file=src/components/parseHtml.ts
/**
 * The browser's own HTML parser. Documents it returns are inert: scripts do
 * not run and images are not fetched.
 */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
```

In `src/components/Breakable.tsx`, change the comment and the break characters so URLs wrap at their separators too:

```tsx
/**
 * Lets hostnames, IPs, addresses and URLs wrap after a separator (`.`, `/`,
 * `?`, `&`, `=`, `:`, `@`, `#`) instead of in the middle of a word.
 */
```

and replace `if (".:@".includes(text[i])) {` with `if ("./?&=:@#".includes(text[i])) {`.

In `src/components/FindingsPanel.tsx`, replace `No finding in the headers.` with `No finding.`

- [ ] **Step 2: Links tab**

```tsx file=src/components/LinksTab.tsx
import type { Link, LinkOrigin } from "@/lib/links/analyze";
import { isClickable } from "@/lib/links/analyze";
import type { UrlFlag } from "@/lib/urls/inspect";
import Breakable from "./Breakable";
import { DATA, FLAG, LABEL, SECTION_TITLE } from "./ui";

const ORIGIN_LABEL: Record<LinkOrigin, string> = {
  a: "link",
  area: "map",
  form: "form",
  "meta-refresh": "refresh",
  text: "text",
  img: "image",
  css: "css",
  link: "stylesheet",
  frame: "frame",
  media: "media",
};

const FLAG_LABEL: Record<UrlFlag, string> = {
  "javascript-url": "javascript:",
  "data-url": "data: URL",
  userinfo: "user-name trick",
  lookalike: "lookalike",
  homoglyph: "look-alike characters",
  "disguised-domain": "disguised domain",
  "ip-host": "IP address",
  shortener: "shortener",
  "abused-tld": "abused TLD",
  punycode: "punycode",
  "opaque-wrapper": "rewritten, not reversible",
  unparseable: "unreadable",
};

// Long data: URLs would fill the screen; the start says what they are.
const MAX_SHOWN = 300;

type Badge = { text: string; flagged: boolean };

function badges(link: Link): Badge[] {
  const out: Badge[] = [];
  if (link.shownHost) out.push({ text: `shows ${link.shownHost}`, flagged: true });
  for (const flag of link.url.flags) {
    out.push({
      text: flag === "lookalike" ? `lookalike of ${link.url.lookalikeOf}` : FLAG_LABEL[flag],
      flagged: flag !== "punycode" && flag !== "opaque-wrapper",
    });
  }
  if (link.hidden) out.push({ text: `hidden: ${link.hidden}`, flagged: true });
  if (link.tracking) out.push({ text: link.tracking === "pixel" ? "tracking pixel" : "mailing tracker", flagged: link.tracking === "pixel" });
  return out;
}

export default function LinksTab({ links }: { links: Link[] }) {
  const numbered = links.map((link, i) => ({ link, n: i + 1, badges: badges(link) }));
  const byConcern = (a: (typeof numbered)[number], b: (typeof numbered)[number]) =>
    Number(b.badges.some((x) => x.flagged)) - Number(a.badges.some((x) => x.flagged));
  const clickable = numbered.filter((x) => isClickable(x.link)).sort(byConcern);
  const loaded = numbered.filter((x) => !isClickable(x.link)).sort(byConcern);
  return (
    <div className="grid gap-10 console:gap-4">
      <LinkList id="links-title" title={`Links · ${clickable.length}`} rows={clickable} empty="No links." />
      <LinkList
        id="remote-title"
        title={`Remote content · ${loaded.length}`}
        rows={loaded}
        empty="No remote content."
        note="Loaded automatically by a mail client that shows images. Never loaded here."
      />
    </div>
  );
}

function LinkList({ id, title, rows, empty, note }: {
  id: string;
  title: string;
  rows: { link: Link; n: number; badges: Badge[] }[];
  empty: string;
  note?: string;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {note && <p className="mb-2 text-sm text-muted console:text-xs">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ol className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {rows.map(({ link, n, badges: list }) => (
            <LinkRow key={n} link={link} n={n} badges={list} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LinkRow({ link, n, badges: list }: { link: Link; n: number; badges: Badge[] }) {
  const destination = link.url.final ?? link.url.raw;
  const shown = destination.length > MAX_SHOWN ? `${destination.slice(0, MAX_SHOWN)}…` : destination;
  return (
    <li className="grid grid-cols-[2.5rem_5.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-2 console:grid-cols-[4ch_10ch_minmax(0,1fr)] console:gap-x-2 console:border-b-0 console:py-0.5 dossier:grid-cols-[2rem_6rem_minmax(0,1fr)] dossier:border-dotted">
      <span className="text-right tabular-nums text-muted console:text-left">{n}</span>
      <span className={LABEL}>{ORIGIN_LABEL[link.origin]}</span>
      <div className="min-w-0">
        {link.text && <p className="font-semibold console:text-xs console:font-normal dossier:font-normal dossier:italic">{link.text.slice(0, 200)}</p>}
        <p className={`${DATA} [overflow-wrap:anywhere]`}>
          <Breakable text={shown} />
        </p>
        {link.url.displayHost && link.url.displayHost !== link.url.host && (
          <p className={`${DATA} text-muted`}>reads as {link.url.displayHost}</p>
        )}
        {link.url.wrappers.length > 0 && (
          <p className="text-xs text-muted">via {link.url.wrappers.map((w) => w.service).join(" → ")}</p>
        )}
        {list.length > 0 && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            {list.map((badge) => (
              <span key={badge.text} className={badge.flagged ? `${FLAG} dossier:italic` : "text-muted"}>
                {badge.text}
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 3: Preview tab**

```tsx file=src/components/PreviewTab.tsx
"use client";

import { useMemo } from "react";
import type { ParsedEmail } from "@/lib/email";
import { buildPreview } from "@/lib/html/preview";
import { parseHtml } from "./parseHtml";
import { DATA } from "./ui";

export default function PreviewTab({ email }: { email: ParsedEmail }) {
  const srcDoc = useMemo(
    () => (email.html ? buildPreview(email.html, parseHtml, email.attachments) : null),
    [email],
  );

  if (srcDoc) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted console:text-xs">
          Scripts, links and forms are disabled and remote images are replaced by placeholders: nothing in this preview
          can reach the network. Hover a link to see where it goes.
        </p>
        {/* The email's own canvas: mail is designed on white whatever the theme. */}
        <iframe
          title="Safe preview of the email"
          sandbox=""
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          className="block h-[75vh] w-full border border-rule bg-[#ffffff]"
        />
      </div>
    );
  }
  if (email.text) return <pre className={`${DATA} whitespace-pre-wrap break-words`}>{email.text}</pre>;
  return <p className="text-muted">This email has no body to preview.</p>;
}
```

- [ ] **Step 4: Report view, page, layout**

```tsx file=src/components/ReportView.tsx
"use client";

import { useState } from "react";
import type { EmailReport } from "@/lib/analyze";
import type { ParsedEmail } from "@/lib/email";
import { formatUtc } from "@/lib/format";
import { isClickable } from "@/lib/links/analyze";
import { decodeEncodedWords } from "@/lib/mime/encoded-words";
import { getHeader } from "@/lib/mime/headers";
import FindingsPanel from "./FindingsPanel";
import HeadersTab from "./HeadersTab";
import LinksTab from "./LinksTab";
import PreviewTab from "./PreviewTab";
import RawTab from "./RawTab";
import Tabs from "./Tabs";
import { DATA, LABEL } from "./ui";

type TabId = "headers" | "links" | "preview" | "raw";

export default function ReportView({ email, report }: { email: ParsedEmail; report: EmailReport }) {
  const [tab, setTab] = useState<TabId>("headers");
  const headers = report.headers;
  const from = headers.sender.from;
  const to = getHeader(email.headers, "to");

  return (
    <main className="flex-1 px-4 pb-12 sm:px-6">
      <div className="grid gap-x-8 gap-y-6 border-b-[3px] border-rule py-6 lg:grid-cols-12 console:border-b console:border-hairline console:py-3 dossier:border-b-0 dossier:py-8">
        <div className="lg:col-span-5 console:lg:col-span-12 dossier:lg:col-span-12">
          <p className={LABEL}>Subject</p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-bold tracking-tight console:text-sm console:font-medium console:tracking-normal dossier:text-[1.6rem] dossier:font-semibold dossier:before:content-['«_'] dossier:after:content-['_»']">
            {headers.subject || "(no subject)"}
          </h1>
          <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-y-1 text-sm console:mt-2 console:grid-cols-[9ch_minmax(0,1fr)] console:gap-y-0 console:text-xs dossier:gap-y-0 dossier:border-t dossier:border-hairline dossier:*:border-b dossier:*:border-hairline dossier:*:py-1">
            <dt className={LABEL}>From</dt>
            <dd className="break-all">
              {from ? (
                <>
                  {from.name && <span>{from.name} </span>}
                  <span className={DATA}>&lt;{from.address}&gt;</span>
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className={LABEL}>To</dt>
            <dd className={`${DATA} break-all`}>{to ? decodeEncodedWords(to) : "—"}</dd>
            <dt className={LABEL}>Date</dt>
            <dd className="tabular-nums">{headers.date ? formatUtc(headers.date) : "—"}</dd>
          </dl>
          {email.warnings.length > 0 && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer">
                {email.warnings.length} parsing {email.warnings.length === 1 ? "warning" : "warnings"}
              </summary>
              <ul className="mt-1 list-inside list-disc">
                {email.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="lg:col-span-7 console:lg:col-span-12 dossier:lg:col-span-12">
          <FindingsPanel findings={report.findings} />
        </div>
      </div>

      <Tabs
        label="Report sections"
        tabs={[
          { id: "headers", label: "Headers" },
          { id: "links", label: "Links", count: report.links.links.filter(isClickable).length },
          { id: "preview", label: "Safe preview" },
          { id: "raw", label: "Raw source" },
        ]}
        active={tab}
        onChange={setTab}
      >
        {tab === "headers" && <HeadersTab report={headers} headers={email.headers} />}
        {tab === "links" && <LinksTab links={report.links.links} />}
        {tab === "preview" && <PreviewTab email={email} />}
        {tab === "raw" && <RawTab raw={email.raw} />}
      </Tabs>
    </main>
  );
}
```

In `src/app/page.tsx`:
- replace `import { analyzeHeaders, type HeaderReport } from "@/lib/headers/analyze";` with
  `import { analyzeEmail, type EmailReport } from "@/lib/analyze";` and add `import { parseHtml } from "@/components/parseHtml";`
- in the `Analysis` type, replace `report: HeaderReport` with `report: EmailReport`
- replace the two lines
  ```ts
      // Organisation domains arrive with the settings panel (milestone 4).
      const report = analyzeHeaders(email, { orgDomains: [] });
  ```
  with
  ```ts
      // Organisation domains arrive with the settings panel (milestone 4).
      const report = analyzeEmail(email, { orgDomains: [], parseHtml });
  ```

In `src/app/layout.tsx`, add above `export const metadata`:

```tsx
/**
 * Defence in depth for the no-network promise: in the built site the browser
 * itself refuses every connection, and the preview frame inherits this
 * policy. Not applied to `next dev`, which needs eval and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
```

and make it the first child of `<head>`:

```tsx
      <head>
        {process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Add the Links and Safe preview tabs

The Links tab lists every link a reader can follow, then every resource a
mail client would load on its own, concerning ones first: the real
destination after unwrapping, the gateways removed, how an
internationalised domain reads, and every flag. Nothing in it is
clickable.

The Safe preview renders the inert copy of the email in a sandboxed
srcdoc frame with no permissions. The built site also carries a page CSP
with connect-src 'none', which the preview frame inherits, so the browser
itself enforces the no-network promise."
```

---

### Task 10: Smoke test across tabs, three fixtures

**Files:**
- Modify: `scripts/smoke.mjs`, `fixtures/smoke.json`

**Interfaces:**
- Consumes: the page (Task 9), fixtures (Task 6).

- [ ] **Step 1: Fail on page errors and visit every tab**

In `scripts/smoke.mjs`:

1. Enable the `Log` domain too: replace `for (const domain of ["Page", "Network", "Runtime", "DOM"])` with `for (const domain of ["Page", "Network", "Runtime", "DOM", "Log"])`.
2. Declare `const errors = [];` next to `const external = [];`.
3. Right after the existing `cdp.on((msg) => { … requestWillBeSent … })` listener, add:

```js
  // CSP violations, React errors and uncaught exceptions all land here.
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push(msg.params.entry.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
```

4. Replace the fixture screenshot line

```js
      await screenshot(`${theme}-${fixture.file.replace(/\W+/g, "-")}.png`);
```

with

```js
      const name = `${theme}-${fixture.file.replace(/\W+/g, "-")}`;
      const tabs = await evaluate(`[...document.querySelectorAll('[role="tab"]')].map((t) => t.id)`);
      for (const id of tabs) {
        await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
        await evaluate("new Promise((ok) => setTimeout(ok, 300))");
        await screenshot(`${name}-${id.replace(/^tab-/, "")}.png`);
      }
```

5. After the `if (external.length > 0 && failures.length === 0) …` line, add:

```js
if (errors.length > 0) failures.push(`Page errors:\n  ${[...new Set(errors)].join("\n  ")}`);
```

- [ ] **Step 2: Fixtures and expectations**

```json file=fixtures/smoke.json
[
  {
    "file": "spoofed-invoice.eml",
    "expect": [
      "Link text shows another destination",
      "DMARC failed for rhone-energie.fr",
      "Microsoft 365 classified it as phishing",
      "Replies go to a different domain",
      "rhone-energie.fr.secure-login.click",
      "CAT: PHSH"
    ]
  },
  {
    "file": "clean-newsletter.eml",
    "expect": ["Nos coups de cœur d'octobre", "No finding", "mx.google.com"]
  },
  {
    "file": "lookalike-paypal.eml",
    "expect": [
      "Password form inside the email",
      "Lookalike domain",
      "pаypal.com imitates paypal.com",
      "Display name invokes PayPal"
    ]
  }
]
```

- [ ] **Step 3: Run**

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed: 3 themes × 3 fixtures.` with no external request and no page error. Review `.smoke/*-links.png` and `.smoke/*-preview.png` in each theme: the deceptive link and the lookalikes are flagged in the signal colour; the preview shows the email with grey placeholders where the pixel and remote images were.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs fixtures/smoke.json
git commit -m "Smoke-test every tab, and fail on page errors

The smoke test now opens all three fixtures in every theme, visits each
tab — so the safe preview is rendered — and fails on any request leaving
the local server, any CSP violation, console error or uncaught exception."
```

---

## Milestone 2 exit criteria

- `npm test`, `npm run lint`, `npm run build`, `npm run smoke` all pass.
- Spoofed invoice: 8 findings (4 header, 4 link); clean newsletter: none; PayPal lookalike: 6.
- The safe preview of every fixture loads nothing from the network, in every theme; the built page carries `connect-src 'none'`.
