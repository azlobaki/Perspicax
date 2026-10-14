# Perspicax

*Perspicax* — Latin for sharp-sighted. Drop a suspicious email, get a scored
verdict with every finding explained, every link and indicator extracted, and
one-click pivots to the usual lookup services. Built for SOC analysts.

Perspicax is a single static page. The email is analysed in your browser and
nowhere else: there is no server to send it to, and the page never makes a
network request on its own.

## Why it is private

This is the point of the tool, so it is worth being precise about it.

- **No server.** The app is built with `output: "export"`: `next build`
  produces plain HTML, CSS and JS, with no API route and no server-side code
  at runtime.
- **No request carrying the email — or anything else.** The built page sets a
  Content Security Policy with `connect-src 'none'`, so the browser itself
  refuses any connection the page might attempt. Fonts are self-hosted.
  There is no analytics, no CDN, no tracker.
- **The email is never stored.** It lives in React state only. Reloading the
  page forgets it. Nothing about it goes to `localStorage`, a cookie or the URL.
- **Only settings are stored**, and only once you change one, under the single
  key `perspicax.settings.v1`:
  your organisation's domains, the defang default, the pivot services and the
  theme. They are re-validated every time they are read.
- **Opening an email never fires its tracking pixels.** The safe preview
  renders an inert copy in a sandboxed frame with no permissions and its own
  `default-src 'none'` policy: scripts removed, links and forms disarmed,
  remote images replaced by placeholders.
- **Pivots open only when you click them**, in a new tab, without a referrer.
  That is the one moment an indicator leaves your machine, and you choose it.

### Check it yourself

- Open your browser's **Network** tab, drop an email, go through every tab.
  Nothing is requested.
- Open **Application → Local Storage**: at most one key, holding settings.
- Open the page, then turn off your Wi-Fi: dropping and analysing emails keeps
  working, every tab included.
- `npm run smoke` does all of this in headless Chromium, for every fixture
  and every theme, and fails on a single request leaving the page.

## What it checks

| Area | Checks |
|---|---|
| Headers | Relay chain (hops, delays, HELO vs reverse DNS, private and public IPs); SPF, DKIM, DMARC and Microsoft compauth as recorded by the receiving server; From / Sender / Reply-To / Return-Path / Message-ID consistency; sender domains that imitate your organisation's or a well-known brand's; display names that show another address, invoke a brand, or imitate your organisation; Date anomalies; verdicts of Microsoft 365, Proofpoint, Mimecast, Gmail and SpamAssassin |
| DKIM | Body hash of every signature, recomputed offline: tells you whether the body changed after signing. (Verifying the signature itself needs DNS and is out of scope.) |
| Links | Every link and remote resource, unwrapped from Safe Links, Proofpoint URL Defense v1–v3, Google, Barracuda, Cisco and Sophos rewrites; link text that shows another domain; hidden links; lookalike, homoglyph and Punycode domains; domains disguised as subdomains; `user@host` tricks; bare IPs; shorteners; abused TLDs; `javascript:` and `data:` links; tracking pixels; forms, password forms above all; words broken by invisible characters; direction overrides |
| Attachments | MD5, SHA-1, SHA-256; real type from the bytes vs the name; programs, scripts, shortcuts, disk images, web pages; double extensions, right-to-left overrides, padded names; archive contents and encryption; Office macros (OOXML and legacy OLE) and remote templates; HTML smuggling; PDF links and active content; QR codes in images |
| Indicators | URLs, domains, IPs, addresses and hashes with where each was seen, defanged or raw, with pivots to VirusTotal, urlscan, URLhaus, WHOIS, MXToolbox, AbuseIPDB, Talos and Shodan (editable in Settings) |

Inputs: `.eml`, Outlook `.msg`, or pasted raw headers.

### The score

Every finding has a weight. Weights add up per category, each category is
capped (so ten flagged links cannot outweigh everything else), and the total is
capped at 100:

| Score | Verdict |
|---|---|
| 0–14 | Clean |
| 15–39 | Suspicious |
| 40–69 | Likely phishing |
| 70–100 | Malicious indicators |

Some findings are malicious in themselves — HTML smuggling, an executable,
script or shortcut, Office macros, a program hidden in an archive, a disk
image, a remote template — and set the verdict to *malicious indicators*
whatever the score. Every finding shows its weight and its evidence, so the
verdict can always be argued with.

### Reports

The **Report** buttons copy or download a Markdown report for the ticket —
defanged by default, so pasting it creates no live link — or the full analysis
as JSON for tooling.

## Themes

Three looks, one interface; switch in the top bar. *Suisse* (default) is a
strict grid with a single accent. *Console* is dense, monospace and dark.
*Dossier* reads like a printed incident report, verdict stamp included.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine tests (node:test)
npm run build    # static export into out/
npm run smoke    # after build: headless Chromium, every fixture × every theme
```

`npm run smoke` needs Chromium (`CHROME=/path/to/chrome` to point at another
binary). `fixtures/docusign.msg` is generated by `node scripts/make-msg-fixture.mjs`.

## Limits

- The DKIM *signature* is not verified (that needs the sender's public key
  from DNS); only the body hash is.
- An Outlook `.msg` whose formatted body only exists as compressed RTF shows
  its plain-text body; links that only exist in the RTF are not analysed.
- Lookalike detection compares against well-known brands and the domains you
  enter in Settings; it cannot know every organisation you deal with.
- No live lookups of any kind: reputation, DNS and WHOIS are one pivot click
  away, by design.

## Legal notice

The page *Mentions légales et confidentialité* (`/mentions-legales`, linked from
every page's footer) gives the publisher and host as French law requires, the
privacy notice, and the tool's limits: Perspicax is decision support, its
verdicts are heuristics, and it does not replace a qualified human analysis. The
same warning closes every exported report. If you deploy your own copy, edit
`src/app/mentions-legales/page.tsx` with your own details.

## Deploy

The build output is static: anything that serves files will do. For Vercel,
import the repository; `output: "export"` is honoured and there is nothing to
configure. Elsewhere, `npm run build` and serve `out/`.

## Project layout

```
src/
  app/                  page, layout (CSP, fonts, theme boot script), theme tokens
  components/           one component per tab and panel, styled for all three themes
  lib/mime/             RFC 5322 / MIME parser
  lib/msg/              Outlook .msg reader
  lib/headers/          relay chain, authentication, sender, gateway verdicts
  lib/dkim/             DKIM body-hash check
  lib/html/             link extraction, hidden content, safe preview
  lib/urls/             unwrapping, lookalikes, Punycode, URL flags
  lib/links/            link findings
  lib/attachments/      hashes, file types, ZIP / Office / PDF, smuggling, QR codes
  lib/ioc/, lib/pivots/ indicators, defanging, pivot services
  lib/score/, lib/report/  verdict, Markdown and JSON reports
fixtures/               synthetic emails, one scenario each
scripts/smoke.mjs       browser smoke test
```

The engine under `src/lib/` is framework-free TypeScript, tested directly by
`node --test`, so it can be reused elsewhere — in a browser extension, say.
Three small libraries run locally: `fflate` (ZIP and zlib), `cfb` (OLE files)
and `jsqr` (QR codes).

## License

Copyright © 2026 Perspicax contributors. Licensed under the
[GNU Affero General Public License v3.0](LICENSE).

Use it, study it, change it, share it. If you deploy a modified version as a
hosted service, you have to publish your changes under the same license — that
is what keeps the privacy claims above checkable on any Perspicax someone puts
in front of you.

If you host it, set `SOURCE_URL` in [src/components/Footer.tsx](src/components/Footer.tsx)
to your repository; the page then links to its own source, as section 13
requires.
