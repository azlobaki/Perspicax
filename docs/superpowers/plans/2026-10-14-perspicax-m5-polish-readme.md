# Perspicax — Milestone 5 Implementation Plan (polish, last fixture, README)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three themes hold up at phone width with no horizontal scroll (checked automatically), the fixture set covers every scenario the spec lists, and the README states what Perspicax does, why it is private and how to check that, as Innomi's does.

**Architecture:** No engine change. Layout fixes are Tailwind class changes on existing components; the smoke test gains a 390 px pass that fails on any horizontal overflow; one fixture joins the set.

**Tech Stack:** unchanged.

**Spec:** `docs/design/2026-10-13-perspicax-design.md` — milestone 5 of §7 (visual polish of the three themes, README, fixtures complete), §5 privacy guarantees for the README, §6 fixture list.

## Global Constraints

Everything in milestones 1–4's Global Constraints still applies. The visual review at 390 px found three defects, fixed here: the top bar's actions do not wrap (console and dossier overflow by 4–19 px); the dossier stamp covers the subject; the console relay table keeps six fixed columns.

---

### Task 1: Phone-width layouts, checked by the smoke test

**Files:**
- Modify: `src/components/TopBar.tsx`, `src/components/VerdictBlock.tsx`, `src/components/ReportView.tsx`, `src/components/HeadersTab.tsx`, `scripts/smoke.mjs`

- [ ] **Step 1: Make the smoke test fail on overflow at phone width**

In `scripts/smoke.mjs`, just before the `} finally {` line of the main `try`, add a second pass:

```js
  // Phone width: every tab of the richest fixture, in every theme, without horizontal scrolling.
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  for (const theme of THEMES) {
    await load(base);
    await evaluate(`localStorage.setItem("perspicax.settings.v1", ${JSON.stringify(JSON.stringify({ theme }))})`);
    await load(base);
    const { root } = await page("DOM.getDocument");
    const { nodeId } = await page("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    await page("DOM.setFileInputFiles", { nodeId, files: [join(ROOT, "fixtures", "spoofed-invoice.eml")] });
    await evaluate(`new Promise((ok) => { (function poll() { document.querySelector('[role="tab"]') ? ok() : setTimeout(poll, 50); })(); })`);
    const tabs = await evaluate(`[...document.querySelectorAll('[role="tab"]')].map((t) => t.id)`);
    for (const id of tabs) {
      await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
      await evaluate("new Promise((ok) => setTimeout(ok, 300))");
      const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
      if (overflow > 0) failures.push(`${theme} at 390 px, ${id}: ${overflow} px of horizontal overflow`);
    }
    await evaluate(`document.getElementById("tab-headers").click()`);
    const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(join(SHOTS, `${theme}-phone.png`), Buffer.from(data, "base64"));
  }
```

Run: `npm run build && npm run smoke`
Expected: FAIL — `console at 390 px, tab-headers: 9 px of horizontal overflow`, and 4–19 px on every console and dossier tab.

- [ ] **Step 2: Fix the layouts**

In `src/components/TopBar.tsx`:
- replace `<div className="ml-auto flex items-center gap-3">` with `<div className="ml-auto flex flex-wrap items-center justify-end gap-3">`;
- add `whitespace-nowrap` to the "New email" button: `className={`${BUTTON} whitespace-nowrap`}`.

In `src/components/VerdictBlock.tsx`, in `VerdictStamp`, keep the stamp in the flow on phones and pin it top-right from `sm` up: replace

```
pointer-events-none absolute top-6 right-0 hidden -rotate-[5deg]
```

with

```
pointer-events-none hidden -rotate-[5deg] justify-self-start dossier:sm:absolute dossier:sm:top-6 dossier:sm:right-0
```

and replace `dossier:block` with `dossier:inline-block`.

In `src/components/ReportView.tsx`, on the subject `<h1>`, replace `dossier:pr-56` with `dossier:sm:pr-56`.

In `src/components/HeadersTab.tsx`, the console relay table becomes a table from `sm` up only; below, hops stack like the Swiss columns:
- in the console header row `<div aria-hidden className="hidden grid-cols-[3ch_10ch_7ch_…] … console:grid">`, replace `console:grid` with `console:sm:grid`;
- in `HopItem`'s `<li>`, replace `console:grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)]` with `console:sm:grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)]`;
- in its three last `<span>`s (host, by, transport), replace `console:col-span-1` with `console:sm:col-span-1`, and in the host span replace `console:mt-0` with `console:sm:mt-0`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint && npm run build && npm run smoke`
Expected: all pass, `Smoke test passed`. Open `.smoke/*-phone.png`: the top bar wraps, the dossier stamp sits above the subject, console hops stack.

- [ ] **Step 4: Commit**

```bash
git add src/components scripts/smoke.mjs
git commit -m "Fit every theme at phone width

The top bar's actions now wrap, the dossier stamp sits above the subject
on narrow screens instead of covering it, and the console relay table
only becomes a table from the small breakpoint up. The smoke test opens
the richest fixture at 390 px in every theme and fails on any horizontal
scroll, on every tab."
```

---

### Task 2: The last fixture — display-name spoofing with DMARC failure

**Files:**
- Create: `fixtures/bec-display-name.eml`
- Modify: `src/lib/analyze.test.ts`, `fixtures/smoke.json`

- [ ] **Step 1: Fixture**

```eml file=fixtures/bec-display-name.eml
Received: from mail.rhone-energie-direction.com (unknown [80.94.95.211])
	by mx01.rhone-energie.fr (Postfix) with ESMTPS id 7C1D2E3F4A
	for <comptabilite@rhone-energie.fr>; Wed, 14 Oct 2026 07:02:11 +0200 (CEST)
Authentication-Results: mx01.rhone-energie.fr;
	spf=softfail smtp.mailfrom=rhone-energie-direction.com;
	dkim=none;
	dmarc=fail (p=none dis=none) header.from=rhone-energie-direction.com
Return-Path: <pdg@rhone-energie-direction.com>
From: "pdg@rhone-energie.fr" <pdg@rhone-energie-direction.com>
Reply-To: <direction.rhone.energie@gmail.com>
To: <comptabilite@rhone-energie.fr>
Subject: Virement urgent et confidentiel
Date: Wed, 14 Oct 2026 07:02:09 +0200
Message-ID: <bec.4471@rhone-energie-direction.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

Bonjour,

Je suis en réunion et ne peux pas être joint par téléphone. Merci de
préparer aujourd'hui un virement de 48 600 € pour une acquisition
confidentielle. Je vous transmets les coordonnées bancaires par retour.

Merci de ne pas en parler pour l'instant.
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/analyze.test.ts`:

```ts
test("the CEO-fraud email: a display name that shows another address, likely phishing", async () => {
  assert.deepEqual(await summary("bec-display-name.eml"), {
    ids: ["auth.dmarc-fail", "sender.display-name-address", "sender.reply-to-mismatch", "route.helo-mismatch"],
    score: 45,
    band: "likely-phishing",
  });
  const own = await analyse("bec-display-name.eml", ["rhone-energie.fr"]);
  assert.ok(own.findings.some((f) => f.id === "sender.org-impersonation"));
});
```

Run: `npm test`
Expected: FAIL until the fixture file exists (step 1 must be applied first if run separately); with the fixture present, PASS — this fixture adds coverage, not behaviour. If it fails with the fixture present, stop and investigate: the engine disagrees with the scenario.

- [ ] **Step 3: Smoke expectations**

In `fixtures/smoke.json`, add before the closing `]` (after the `docusign.msg` entry, with a comma):

```json
  {
    "file": "bec-display-name.eml",
    "expect": ["Likely phishing", "Display name shows another address", "Replies go to a different domain", "DMARC failed for rhone-energie-direction.com"]
  }
```

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed: 3 themes × 9 fixtures.`

- [ ] **Step 4: Commit**

```bash
git add fixtures src/lib/analyze.test.ts
git commit -m "Add the CEO-fraud fixture

A wire-transfer request whose display name is the CEO's address at the
organisation, sent from a lookalike domain that fails DMARC, with
replies diverted to a free webmail address and no link or attachment at
all. It completes the fixture set the design lists and scores as likely
phishing on its headers alone."
```

---

### Task 3: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write it**

````markdown file=README.md
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
- **Only settings are stored**, under the single key `perspicax.settings.v1`:
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
- Turn off your Wi-Fi and reload. Everything keeps working.
- `npm run smoke` does all of this in headless Chromium, for every fixture
  and every theme, and fails on a single request leaving the page.

## What it checks

| Area | Checks |
|---|---|
| Headers | Relay chain (hops, delays, HELO vs reverse DNS, private and public IPs); SPF, DKIM, DMARC and Microsoft compauth as recorded by the receiving server; From / Sender / Reply-To / Return-Path / Message-ID consistency; display names that show another address, invoke a brand, or imitate your organisation; Date anomalies; verdicts of Microsoft 365, Proofpoint, Mimecast, Gmail and SpamAssassin |
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
````

- [ ] **Step 2: Check every claim against the code**

For each statement, find the code or test that backs it (CSP in `src/app/layout.tsx`, preview in `src/lib/html/preview.ts`, `rel="noopener noreferrer"` in `src/components/IocsTab.tsx`, score thresholds in `src/lib/score/score.ts`, the gateways in `src/lib/urls/unwrap.ts`, the vendors in `src/lib/headers/vendors.ts`). Fix the README where it overstates.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Write the README

What Perspicax checks, how it scores, why it is private and how to check
that from the browser, how to run, test and deploy it, what it does not
do, and the license."
```

---

## Milestone 5 exit criteria

- `npm test`, `npm run lint`, `npm run build`, `npm run smoke` all pass, including the 390 px pass in every theme.
- Nine fixtures, one per scenario listed in the spec.
- The README's privacy claims each map to code or a test.
