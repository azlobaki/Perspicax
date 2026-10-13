# Perspicax — design

Date: 2026-10-13 · Status: approved (visual direction still to be chosen, see §8)

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
- **The email is never persisted.** It lives in React state only; reload wipes it. Only settings are stored (`localStorage`, one versioned key): organisation domains, pivot services, display options.
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
- **Settings**: organisation domains, pivot services, defang default.

## 5. Privacy guarantees (to be stated in the README, like Innomi)

No server, no network request carrying the email, nothing persisted except settings, works with Wi-Fi off; verifiable from the browser's Network and Storage panels.

## 6. Testing

- Unit tests (`node:test`) per engine module.
- A fixture set of synthetic emails, each targeting one scenario: SPF/DMARC fail with display-name spoofing, Reply-To mismatch, SafeLinks/Proofpoint-wrapped links, deceptive and hidden links, tracking pixel, QR-code image, macro-enabled `.docm`, HTML-smuggling attachment, RTLO filename, punycode lookalike, clean newsletter (false-positive guard), `.msg` sample.
- Browser smoke test: drop each fixture, check verdict and key findings; confirm zero network requests during analysis and preview.

## 7. Milestones

1. Scaffold (Innomi stack) + `mime/` + headers-only mode + Headers tab.
2. `html/` + `urls/` + Links tab + safe preview.
3. `attachments/` + `ioc/` + `pivots/` + IOCs and Attachments tabs.
4. `msg/`, `dkim/`, `score/`, report export, settings.
5. Visual polish per the chosen direction, README, fixtures complete.

## 8. Visual direction (open)

Requirement from the user: **no "AI-generated" look** — avoid purple/blue gradients, glassmorphism, soft rounded cards everywhere, emoji headings, sparkle icons, generic centered hero layouts.

Candidate directions to compare with real mockups before milestone 1 UI work:

- **Forensic console** — dense, monospace-forward, dark background with a single amber/green signal colour; tables and timelines like Wireshark or a disassembler.
- **Case file / printed report** — paper-white, serif headings, typewriter details, red-pen annotations and stamps for findings; reads like an incident report.
- **Swiss / industrial** — strict grid, black rules, no shadows or gradients, one accent colour, large numerals for the score, tabular data first.
