# Perspicax — design

Date: 2026-10-13 · Status: approved (visual direction chosen 2026-10-13, see §8)

*Perspicax* (Latin, "sharp-sighted"). A fully offline phishing email analyser for SOC analysts: drop an email, get a scored verdict with every finding explained, all links and IOCs extracted, and one-click pivots to external services — without the tool itself ever making a network request.

## 1. Goals

1. Analyse a `.eml` file, an Outlook `.msg` file, or pasted raw headers.
2. Header analysis: relay chain, authentication results, spoofing patterns, vendor verdicts.
3. Detect tracking pixels, hidden and deceptive links.
4. List every link (body, attachments), decoding URL-rewriting wrappers.
5. Extract IOCs and attachment hashes; one-click pivots (VirusTotal, WHOIS, MXToolbox, urlscan, AbuseIPDB, …).
6. Explainable risk score; exportable report for the ticket.

Non-goals (V1): sending data to any API, live DNS/WHOIS lookups, batch/campaign analysis, `.mbox`, browser extension packaging (the engine stays reusable for it).

## 2. Constraints

- **Same stack as Innomi**: Next.js static export (`output: "export"`), React 19, Tailwind 4, TypeScript, tests with `node:test`, license to match Innomi (AGPL-3.0-only).
- **No backend, no network at runtime.** No API routes, no analytics, no CDN, self-hosted fonts. Pivot links open in a new tab only when the analyst clicks them.
- **The email is never persisted.** It lives in React state only; reload wipes it. Only settings are stored (`localStorage`, one versioned key `perspicax.settings.v1`): organisation domains, pivot services, display options, theme.
- Bundled dependencies are allowed when they run locally (no network): `.msg` reader (OLE/CFB), ZIP reader (OOXML macro detection), QR decoder. Everything else is written in-house.
- Engine code in `src/lib/` is framework-free TypeScript so it can be unit-tested and later reused in a browser extension.

## 3. Engine modules (`src/lib/`)

| Module | Responsibility |
|---|---|
| `mime/` | RFC 5322/2045 parser: header unfolding, RFC 2047 encoded words, multipart trees, base64 / quoted-printable, charset decoding (`TextDecoder`), attachments and inline parts |
| `msg/` | Outlook `.msg` (CFB) → same normalised `ParsedEmail` model as `mime/` (transport headers, bodies, attachments) |
| `headers/` | `Received` chain → ordered hops (from/by/IP/time, delay, private vs public IP, HELO mismatch); `Authentication-Results` / `ARC-*` / `Received-SPF` (SPF, DKIM, DMARC, compauth as recorded by the receiving server); From / Return-Path / Reply-To / Sender / Message-ID domain consistency; display-name spoofing (name contains another address or a brand); date anomalies; decoders for `X-Forefront-Antispam-Report` (SFV, CAT, IPV, SCL…), `X-MS-Exchange-Organization-SCL/BCL/PCL`, Proofpoint, Mimecast, Google headers |
| `dkim/` | Offline body-hash check: canonicalise the body (simple/relaxed) and compare with `bh=` → "body modified after signing" finding. Signature verification is out of scope (needs DNS) |
| `html/` | Parse HTML bodies without executing them (`DOMParser`); every link (`a`, `area`, `form[action]`, `img`, `link`, `meta refresh`, CSS `url()`); deceptive links (displayed URL/domain ≠ real destination); hidden links (`display:none`, zero size, `font-size:0`, same colour as background, off-screen); zero-width / bidi characters; tracking pixels (1×1, hidden or remote images with unique-ID query strings, known tracker domains from a bundled list); remote content inventory; embedded forms |
| `urls/` | Normalisation; unwrap Microsoft SafeLinks, Proofpoint URL Defense v2/v3, Mimecast, Google redirects and generic `?url=` / `?u=` parameters; punycode / IDN homoglyph detection; lookalike detection against the organisation domains (edit distance, confusables); shortener list; `data:` and `javascript:` URLs; IP-literal URLs |
| `attachments/` | MD5 (in-house) / SHA-1 / SHA-256 (WebCrypto); true type from magic bytes vs extension; double extensions, RTLO, very long names; OOXML macros (`vbaProject.bin`), legacy OLE Office macros; HTML smuggling indicators (`atob`, `Blob`, `msSaveOrOpenBlob`, `download=`); ISO/IMG/LNK/archive flags; URIs inside PDFs; QR codes in images (quishing) |
| `ioc/` | Extraction (IPv4/IPv6, domains, URLs, emails, hashes) from headers, bodies and attachments; de-duplication with provenance; defang / refang |
| `score/` | Each check emits a `Finding { id, severity, title, explanation, evidence, weight }`; the score aggregates weights with caps per category; verdict bands: clean / suspicious / likely phishing / malicious indicators |
| `pivots/` | URL templates per IOC type (VirusTotal hash/URL/domain/IP, WHOIS, MXToolbox, urlscan, AbuseIPDB, Talos, URLhaus, Shodan); user-editable list in settings |
| `report/` | Markdown report for tickets (defanged by default) and JSON export |

Data flow: `input → (mime | msg | headers-only) → ParsedEmail → analysers (headers, dkim, html, urls, attachments, ioc) → Finding[] + IOC[] → score → UI / report`.

## 4. User interface (structure)

- **Entry**: drop zone for `.eml` / `.msg`, plus a "paste headers" mode.
- **Verdict**: score, verdict band, top findings with their evidence.
- **Tabs**: Headers (relay timeline, authentication, sender consistency, vendor verdicts) · Links (every link with origin, displayed vs real destination, unwrapped URL, flags) · Attachments (hashes, real type, flags) · IOCs (grouped, copy defanged or raw, pivot buttons) · Safe preview · Raw source.
- **Safe preview**: HTML rendered in a sandboxed `iframe` (`sandbox` without `allow-scripts`, `srcdoc`, CSP `default-src 'none'`), remote images replaced by placeholders — opening an email in Perspicax never fires its tracking pixels.
- **Settings**: organisation domains, pivot services, defang default, theme.
- **Theme switch**: a segmented control in the top bar (Console · Dossier · Suisse), see §8.

## 5. Privacy guarantees (to be stated in the README, like Innomi)

No server, no network request carrying the email, nothing persisted except settings, works with Wi-Fi off; verifiable from the browser's Network and Storage panels.

## 6. Testing

- Unit tests (`node:test`) per engine module.
- A fixture set of synthetic emails, each targeting one scenario: SPF/DMARC fail with display-name spoofing, Reply-To mismatch, SafeLinks/Proofpoint-wrapped links, deceptive and hidden links, tracking pixel, QR-code image, macro-enabled `.docm`, HTML-smuggling attachment, RTLO filename, punycode lookalike, clean newsletter (false-positive guard), `.msg` sample.
- Browser smoke test: drop each fixture, check verdict and key findings; confirm zero network requests during analysis and preview.

## 7. Milestones

1. Scaffold (Innomi stack) + theme system with all three themes and the switch + `mime/` + headers-only mode + Headers tab.
2. `html/` + `urls/` + Links tab + safe preview.
3. `attachments/` + `ioc/` + `pivots/` + IOCs and Attachments tabs.
4. `msg/`, `dkim/`, `score/`, report export, settings.
5. Visual polish of the three themes, README, fixtures complete.

## 8. Visual direction

Requirement from the user: **no "AI-generated" look** — no purple/blue gradients, glassmorphism, soft rounded cards everywhere, emoji headings, sparkle icons, generic centered hero layouts.

The three candidate directions were compared as mockups of the same screen (verdict + Headers tab, same sample email). Decision: **ship all three as themes, with a switch; Swiss is the default.**

| Theme (`data-theme`) | Look | Score block | Severity | Relay chain |
|---|---|---|---|---|
| `suisse` (default) | Off-white, black rules, strict 12-column grid, no shadows, one accent (`#ff3d00`), Archivo + IBM Plex Mono | Very large numeral, 0–100 scale with band thresholds and a marker | Accent square (high), black square (medium), outlined square (low) | Hops as columns, large hop numbers |
| `console` | Warm near-black, all monospace (IBM Plex Mono), single amber signal (`#f2a900`) | Numeral + segmented gauge, inverted band label | Inverted amber block (high), amber text (medium), dim text (low) | Dense table with tree glyphs, status bar footer |
| `dossier` | Paper cream, Source Serif 4 headings and body, Courier Prime for values, red pen (`#b3261e`) | Rotated red stamp with the score | Wavy red underline on evidence, failures circled | Ledger list with time in the left margin, explanations as margin notes |

Rules:

- **One DOM, CSS-only themes.** Components use semantic classes and Tailwind tokens; a theme changes tokens (colours, fonts, rules, density) and layout variants via `data-theme` on `<html>`. No per-theme components and no hard-coded colours or fonts in components. Elements that only one theme shows (e.g. the gauge, the scale) are present in the DOM and hidden by the other themes.
- **No per-theme content.** The dossier's margin notes are each finding's `explanation`, shown by every theme.
- `console` is dark, `suisse` and `dossier` are light; the switch doubles as dark mode, there is no separate setting.
- The chosen theme is stored in `perspicax.settings.v1`; a small inline script in `<head>` applies it before first paint (no flash on the static export).
- Fonts are self-hosted through `next/font` (downloaded at build time, no runtime request).
- Common to all themes: border radius 0, no shadows, no gradients except the console gauge segments, no icons other than functional glyphs, tabular numerals for numbers.
- The browser smoke test runs every fixture in each of the three themes.

Mockups: `.superpowers/brainstorm/` (local, not committed).
