# Perspicax — Milestone 1 Implementation Plan (scaffold, themes, MIME, headers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Next.js page that opens a `.eml` file (or pasted headers) entirely in the browser and shows the Headers tab — relay chain, authentication results, sender consistency, gateway verdicts, findings — in three switchable themes (Swiss by default).

**Architecture:** Framework-free TypeScript engine under `src/lib/` (`mime/` parser → `ParsedEmail` → `headers/` analysers → `Finding[]`), unit-tested with `node:test` running the `.ts` files directly. A thin client-only React layer under `src/components/` renders the report. Themes are CSS only: tokens and `suisse:` / `console:` / `dossier:` Tailwind variants keyed on `<html data-theme>`.

**Tech Stack:** Next.js 16.3.4 (`output: "export"`), React 19.2.8, Tailwind CSS 4, TypeScript 5, `node:test` on Node ≥ 22 (type stripping), `next/font/google` (self-hosted at build time), headless Chromium over the DevTools protocol for the smoke test.

**Spec:** `docs/design/2026-10-13-perspicax-design.md` (milestone 1 of §7; theme rules in §8).

## Global Constraints

- Same stack and conventions as Innomi (`~/Dev/innomi`): static export, React 19, Tailwind 4, TypeScript, `node:test`, license AGPL-3.0-only, English code/comments/UI, imperative English commit messages with an explanatory body.
- No backend, no network at runtime: no API routes, no analytics, no CDN; fonts self-hosted via `next/font`.
- The email is never persisted: React state only. The only `localStorage` key is `perspicax.settings.v1`.
- Engine code in `src/lib/` is framework-free TypeScript; runtime imports between `src/lib/` files carry the `.ts` extension (so `node --test` can run them without a bundler); type-only imports use `import type`.
- No TypeScript syntax that Node's type stripping rejects: no `enum`, `namespace`, parameter properties. No regex flags newer than ES2017 (`s`, `u` property escapes) — the `target` is ES2017.
- Themes: one DOM, CSS-only. Components use only the tokens defined in `globals.css` (`paper`, `panel`, `ink`, `muted`, `rule`, `hairline`, `signal`, `signal-fg`, `on-signal`; fonts `ui`, `data`, `display`). Tailwind's stock palette, radii and shadows are disabled. No per-theme content.
- Default theme: `suisse`. Theme stored in `perspicax.settings.v1`, applied before first paint by an inline script.
- Commits: author `azlobaki` (repo git config). No `Co-Authored-By` trailer, no mention of Claude or Anthropic anywhere in commits. Do not commit `CLAUDE.md`.

## File structure (end of milestone 1)

```
package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
.gitignore, .gitattributes, LICENSE, AGENTS.md
scripts/smoke.mjs                 browser smoke test (themes × fixtures, zero external requests)
fixtures/spoofed-invoice.eml      DMARC fail, Reply-To mismatch, SafeLinks link, pixel, smuggling attachment
fixtures/clean-newsletter.eml     false-positive guard
fixtures/smoke.json               fixtures the smoke test loads and the text it expects
src/app/layout.tsx                fonts, theme boot script, <html data-theme>
src/app/page.tsx                  app state: current analysis (memory only), drag & drop
src/app/globals.css               tokens, theme definitions, theme variants
src/app/icon.svg
src/hooks/useLocalStorage.ts      copied from Innomi
src/hooks/useSettings.ts          settings + applying the theme
src/components/ui.ts              shared class lists (label, buttons, data text)
src/components/TopBar.tsx, ThemeSwitch.tsx, EntryPanel.tsx, ReportView.tsx, FindingsPanel.tsx,
               SeverityTag.tsx, Tabs.tsx, HeadersTab.tsx, RawTab.tsx, Footer.tsx
src/lib/settings.ts               Settings type, validation, theme list, boot script
src/lib/format.ts                 UTC times, delays, sizes
src/lib/email.ts                  ParsedEmail / MimePart / Attachment / HeaderField
src/lib/finding.ts                Finding / Severity, sorting
src/lib/mime/bytes.ts             binary strings, base64, quoted-printable
src/lib/mime/charset.ts           TextDecoder with fallbacks
src/lib/mime/headers.ts           header/body split, unfolding, lookup
src/lib/mime/encoded-words.ts     RFC 2047
src/lib/mime/params.ts            Content-Type / Content-Disposition parameters, RFC 2231
src/lib/mime/parse.ts             parseEmail, parseHeadersOnly
src/lib/mime/address.ts           address lists
src/lib/net/ip.ts                 IPv4/IPv6 literals and scopes
src/lib/net/domain.ts             registrable domain approximation
src/lib/data/freemail.ts          free webmail domains
src/lib/data/brands.ts            commonly impersonated brands
src/lib/headers/date.ts           RFC 5322 dates, Date header anomalies
src/lib/headers/received.ts       Received parsing, relay chain, route findings
src/lib/headers/auth.ts           Authentication-Results / Received-SPF, auth findings
src/lib/headers/sender.ts         sender consistency, display-name spoofing
src/lib/headers/vendors.ts        Microsoft, Proofpoint, Mimecast, Google, SpamAssassin
src/lib/headers/analyze.ts        analyzeHeaders → HeaderReport
```

Each `src/lib/**/x.ts` has a sibling `x.test.ts`.

---

### Task 1: Scaffold with the theme system

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `.gitattributes`, `LICENSE` (copy), `AGENTS.md` (copy)
- Create: `src/lib/settings.ts`, `src/lib/settings.test.ts`
- Create: `src/hooks/useLocalStorage.ts` (copy), `src/hooks/useSettings.ts`
- Create: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/icon.svg`
- Create: `src/components/ThemeSwitch.tsx`, `src/components/TopBar.tsx`
- Create: `scripts/smoke.mjs`, `fixtures/smoke.json`

**Interfaces:**
- Produces: `SETTINGS_KEY`, `THEMES`, `Theme`, `THEME_LABELS`, `DEFAULT_THEME`, `Settings`, `DEFAULT_SETTINGS`, `isTheme(v)`, `parseSettings(v): Settings`, `THEME_BOOT_SCRIPT` (from `@/lib/settings`); `useSettings(): { settings, setSettings, loaded }`; `<ThemeSwitch theme={Theme | null} onChange>`; Tailwind tokens and variants listed in Global Constraints; `npm run smoke`.

- [ ] **Step 1: Project files**

```json file=package.json
{
  "name": "perspicax",
  "version": "0.1.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \"src/lib/**/*.test.ts\"",
    "smoke": "node scripts/smoke.mjs"
  },
  "dependencies": {
    "next": "16.3.4",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

```ts file=next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static export: no server runtime, no API routes, nowhere for an
  // analysed email to be sent. `next build` emits the site into `out/`.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
```

```gitattributes file=.gitattributes
# Fixtures are byte-exact test inputs: never touch their line endings.
fixtures/** -text
```

Copy the rest from Innomi unchanged, then add the two local-only directories to `.gitignore`:

```bash
cd ~/Dev/Perspicax
cp ~/Dev/innomi/{tsconfig.json,eslint.config.mjs,postcss.config.mjs,.gitignore,LICENSE,AGENTS.md} .
printf '\n# local tooling output\n/.superpowers/\n/.smoke/\n' >> .gitignore
npm install
```

Expected: `npm install` finishes without errors and writes `package-lock.json`.

- [ ] **Step 2: Write the failing settings test**

```ts file=src/lib/settings.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
// Explicit extensions: `node --test` runs these files directly, with no
// bundler to resolve them.
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  THEME_BOOT_SCRIPT,
  parseSettings,
} from "./settings.ts";

test("defaults to the Swiss theme", () => {
  assert.equal(DEFAULT_SETTINGS.theme, "suisse");
});

test("falls back to the defaults on garbage", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("suisse"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ theme: "neon" }), DEFAULT_SETTINGS);
});

test("keeps a known theme", () => {
  assert.equal(parseSettings({ theme: "console" }).theme, "console");
  assert.equal(parseSettings({ theme: "dossier", extra: 1 }).theme, "dossier");
});

function runBootScript(stored: string | null): string | undefined {
  const attributes: Record<string, string> = {};
  const storage = { getItem: (key: string) => (key === SETTINGS_KEY ? stored : null) };
  const doc = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  new Function("localStorage", "document", THEME_BOOT_SCRIPT)(storage, doc);
  return attributes["data-theme"];
}

test("boot script applies a saved theme", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "dossier" })), "dossier");
});

test("boot script ignores unknown, broken or missing values", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "neon" })), undefined);
  assert.equal(runBootScript("{not json"), undefined);
  assert.equal(runBootScript(null), undefined);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/lib/settings.ts'`.

- [ ] **Step 4: Implement settings**

```ts file=src/lib/settings.ts
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

export type Settings = { theme: Theme };

export const DEFAULT_SETTINGS: Settings = { theme: DEFAULT_THEME };

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Values coming out of localStorage are untrusted (hand-edited, from an older
 * version, or plain corrupted), so every field is re-checked before use.
 */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return { theme: isTheme(raw.theme) ? raw.theme : DEFAULT_THEME };
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
Expected: PASS, 5 tests.

- [ ] **Step 6: Hooks**

```bash
mkdir -p src/hooks && cp ~/Dev/innomi/src/hooks/useLocalStorage.ts src/hooks/
```

```ts file=src/hooks/useSettings.ts
"use client";

import { useEffect } from "react";
import { DEFAULT_SETTINGS, SETTINGS_KEY, parseSettings, type Settings } from "@/lib/settings";
import { useLocalStorage } from "./useLocalStorage";

/** Settings, plus their one side effect: the theme lives on `<html data-theme>`. */
export function useSettings() {
  const [settings, setSettings, loaded] = useLocalStorage<Settings>(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    parseSettings,
  );

  useEffect(() => {
    // Until the stored value is read, the boot script's choice must stand.
    if (loaded) document.documentElement.dataset.theme = settings.theme;
  }, [loaded, settings.theme]);

  return { settings, setSettings, loaded };
}
```

- [ ] **Step 7: Theme tokens and variants**

```css file=src/app/globals.css
@import "tailwindcss";

/*
 * Three themes over one DOM (docs/design §8). Components only use the tokens
 * below and the `suisse:` / `console:` / `dossier:` variants. Tailwind's stock
 * palette, radii and shadows are removed so nothing can quietly hard-code a
 * look of its own.
 */
@theme {
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --inset-shadow-*: initial;
  --drop-shadow-*: initial;
  --text-shadow-*: initial;
  --font-*: initial;
}

@theme inline {
  --color-paper: var(--px-paper);
  --color-panel: var(--px-panel);
  --color-ink: var(--px-ink);
  --color-muted: var(--px-muted);
  --color-rule: var(--px-rule);
  --color-hairline: var(--px-hairline);
  --color-signal: var(--px-signal);
  --color-signal-fg: var(--px-signal-fg);
  --color-on-signal: var(--px-on-signal);
  --font-ui: var(--px-font-ui);
  --font-data: var(--px-font-data);
  --font-display: var(--px-font-display);
}

@custom-variant suisse (&:where([data-theme="suisse"], [data-theme="suisse"] *));
@custom-variant console (&:where([data-theme="console"], [data-theme="console"] *));
@custom-variant dossier (&:where([data-theme="dossier"], [data-theme="dossier"] *));

/* Swiss / industrial — the default. */
[data-theme="suisse"] {
  color-scheme: light;
  --px-paper: #fbfbf9;
  --px-panel: #f0f0ec;
  --px-ink: #111111;
  --px-muted: #636363;
  --px-rule: #111111;
  --px-hairline: #d6d6d2;
  /* The vivid orange fills marks; text in that colour takes a darker step to stay readable. */
  --px-signal: #ff3d00;
  --px-signal-fg: #c93100;
  --px-on-signal: #ffffff;
  --px-font-ui: var(--font-archivo), "Helvetica Neue", Arial, sans-serif;
  --px-font-data: var(--font-plex-mono), ui-monospace, monospace;
  --px-font-display: var(--font-archivo), "Helvetica Neue", Arial, sans-serif;
}

/* Forensic console. */
[data-theme="console"] {
  color-scheme: dark;
  --px-paper: #0e0f0d;
  --px-panel: #151613;
  --px-ink: #d2cfc2;
  --px-muted: #8a877a;
  --px-rule: #3a3b35;
  --px-hairline: #24251f;
  --px-signal: #f2a900;
  --px-signal-fg: #f2a900;
  --px-on-signal: #000000;
  --px-font-ui: var(--font-plex-mono), ui-monospace, monospace;
  --px-font-data: var(--font-plex-mono), ui-monospace, monospace;
  --px-font-display: var(--font-plex-mono), ui-monospace, monospace;
}

/* Case file / printed report. */
[data-theme="dossier"] {
  color-scheme: light;
  --px-paper: #f3efe5;
  --px-panel: #e9e3d4;
  --px-ink: #1f1c17;
  --px-muted: #675f51;
  --px-rule: #1f1c17;
  --px-hairline: #cbc2ae;
  --px-signal: #b3261e;
  --px-signal-fg: #b3261e;
  --px-on-signal: #ffffff;
  --px-font-ui: var(--font-source-serif), Georgia, serif;
  --px-font-data: var(--font-courier-prime), "Courier New", monospace;
  --px-font-display: var(--font-source-serif), Georgia, serif;
}

::selection {
  background-color: var(--px-signal);
  color: var(--px-on-signal);
}

* {
  scrollbar-color: var(--px-hairline) transparent;
  scrollbar-width: thin;
}
```

- [ ] **Step 8: Layout, components, page, icon**

```tsx file=src/app/layout.tsx
import type { Metadata } from "next";
import { Archivo, Courier_Prime, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/settings";
import "./globals.css";

// Self-hosted by next/font: downloaded once at build time, never at runtime.
// Only the default theme's faces are preloaded.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  preload: false,
});

const courierPrime = Courier_Prime({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-courier-prime",
  preload: false,
});

export const metadata: Metadata = {
  title: "Perspicax — phishing email analyser",
  description:
    "Drop an email, get a scored verdict with every finding explained. Everything runs in your browser: the email is never sent anywhere or stored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fonts = [archivo, plexMono, sourceSerif, courierPrime].map((f) => f.variable).join(" ");
  return (
    // The boot script may change data-theme before React hydrates.
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning className={`${fonts} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper font-ui text-ink">{children}</body>
    </html>
  );
}
```

```tsx file=src/components/ThemeSwitch.tsx
"use client";

import { THEMES, THEME_LABELS, type Theme } from "@/lib/settings";

/** `theme` is null until the saved choice has been read, so nothing shows as pressed by mistake. */
export default function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme | null;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div role="group" aria-label="Theme" className="flex border border-rule text-xs">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={t === theme}
          onClick={() => onChange(t)}
          className="border-l border-rule px-2.5 py-1 first:border-l-0 hover:bg-panel aria-pressed:bg-ink aria-pressed:text-paper console:aria-pressed:bg-signal console:aria-pressed:text-on-signal dossier:font-data"
        >
          {THEME_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
```

```tsx file=src/components/TopBar.tsx
"use client";

import type { Theme } from "@/lib/settings";
import ThemeSwitch from "./ThemeSwitch";

export default function TopBar({
  theme,
  onTheme,
}: {
  theme: Theme | null;
  onTheme: (theme: Theme) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule px-4 py-2.5 sm:px-6 suisse:border-t-[6px] suisse:border-t-ink console:border-hairline console:bg-panel console:py-1.5 dossier:border-b-2">
      <span className="font-display text-lg font-extrabold tracking-tight console:text-sm console:font-semibold console:lowercase console:tracking-normal console:text-signal-fg dossier:text-base dossier:font-semibold dossier:tracking-[0.08em] dossier:[font-variant:small-caps]">
        Perspicax
      </span>
      <div className="ml-auto flex items-center gap-3">
        <ThemeSwitch theme={theme} onChange={onTheme} />
      </div>
    </header>
  );
}
```

```tsx file=src/app/page.tsx
"use client";

import TopBar from "@/components/TopBar";
import { useSettings } from "@/hooks/useSettings";

export default function Home() {
  const { settings, setSettings, loaded } = useSettings();
  return (
    <>
      <TopBar
        theme={loaded ? settings.theme : null}
        onTheme={(theme) => setSettings((current) => ({ ...current, theme }))}
      />
      <main className="flex-1 px-4 py-8 sm:px-6">
        <p className="max-w-prose">Perspicax analyses phishing emails without leaving the browser.</p>
      </main>
    </>
  );
}
```

```svg file=src/app/icon.svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#111111"/>
  <rect x="7" y="7" width="18" height="18" fill="none" stroke="#fbfbf9" stroke-width="2.5"/>
  <rect x="14" y="14" width="4" height="4" fill="#ff3d00"/>
</svg>
```

- [ ] **Step 9: Smoke test harness**

```json file=fixtures/smoke.json
[]
```

```js file=scripts/smoke.mjs
// Browser smoke test. Serves out/ (run `npm run build` first), drives headless
// Chromium over the DevTools protocol and, for each theme: loads the page,
// opens every fixture listed in fixtures/smoke.json through the file input,
// checks the expected text, takes a screenshot into .smoke/, and fails if any
// request leaves the local server. Set CHROME to override the browser binary.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const SHOTS = join(ROOT, ".smoke");
const THEMES = ["suisse", "console", "dossier"];
const WIDTH = 1440;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path.endsWith("/")) path += "index.html";
    let file = join(OUT, path);
    if (!file.startsWith(OUT)) return res.writeHead(403).end();
    if (!existsSync(file) && existsSync(`${file}.html`)) file += ".html";
    if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "perspicax-smoke-"));
  const proc = spawn(
    process.env.CHROME ?? "chromium",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((ok, fail) => {
    let log = "";
    proc.stderr.on("data", (chunk) => {
      log += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (match) ok(match[1]);
    });
    proc.on("exit", (code) => fail(new Error(`Chromium exited (${code}):\n${log}`)));
  });
  return { proc, profile, wsUrl };
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let seq = 0;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
    } else {
      for (const listener of listeners) listener(msg);
    }
  };
  return {
    opened: new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    }),
    send(method, params = {}, sessionId) {
      return new Promise((ok, fail) => {
        const id = ++seq;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    once(method, sessionId) {
      return new Promise((ok) => {
        const listener = (msg) => {
          if (msg.method === method && msg.sessionId === sessionId) {
            listeners.delete(listener);
            ok(msg.params);
          }
        };
        listeners.add(listener);
      });
    },
    on(listener) {
      listeners.add(listener);
    },
    close() {
      ws.close();
    },
  };
}

const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures", "smoke.json"), "utf8"));
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const { proc, profile, wsUrl } = await launch();
const cdp = connect(wsUrl);
const failures = [];
const external = [];

try {
  await cdp.opened;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  for (const domain of ["Page", "Network", "Runtime", "DOM"]) await page(`${domain}.enable`);
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 1000, deviceScaleFactor: 1, mobile: false });
  cdp.on((msg) => {
    if (msg.method !== "Network.requestWillBeSent" || msg.sessionId !== sessionId) return;
    const url = msg.params.request.url;
    if (!url.startsWith(base) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
  });

  const load = async (url) => {
    const loaded = cdp.once("Page.loadEventFired", sessionId);
    await page("Page.navigate", { url });
    await loaded;
  };
  const evaluate = async (expression) => {
    const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async (name) => {
    const { cssContentSize } = await page("Page.getLayoutMetrics");
    const { data } = await page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: WIDTH, height: Math.ceil(cssContentSize.height), scale: 1 },
    });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
  };

  mkdirSync(SHOTS, { recursive: true });
  for (const theme of THEMES) {
    await load(base);
    await evaluate(`localStorage.setItem("perspicax.settings.v1", ${JSON.stringify(JSON.stringify({ theme }))})`);
    await load(base);
    const applied = await evaluate("document.documentElement.dataset.theme");
    if (applied !== theme) failures.push(`${theme}: <html> has data-theme=${applied}`);
    await screenshot(`${theme}-empty.png`);

    for (const fixture of fixtures) {
      await load(base);
      const before = external.length;
      const { root } = await page("DOM.getDocument");
      const { nodeId } = await page("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
      if (!nodeId) {
        failures.push(`${theme}: no file input on the page`);
        break;
      }
      await page("DOM.setFileInputFiles", { nodeId, files: [join(ROOT, "fixtures", fixture.file)] });
      const first = JSON.stringify(fixture.expect[0].toLowerCase());
      const text = await evaluate(`new Promise((ok) => {
        const start = Date.now();
        (function poll() {
          const text = document.body.innerText.toLowerCase();
          if (text.includes(${first}) || Date.now() - start > 5000) ok(text);
          else setTimeout(poll, 50);
        })();
      })`);
      for (const want of fixture.expect) {
        if (!text.includes(want.toLowerCase())) failures.push(`${theme} / ${fixture.file}: missing "${want}"`);
      }
      await screenshot(`${theme}-${fixture.file.replace(/\W+/g, "-")}.png`);
      if (external.length > before) failures.push(`${theme} / ${fixture.file}: ${external.length - before} external request(s)`);
    }
  }
} finally {
  cdp.close();
  proc.kill();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

if (external.length > 0) console.error(`External requests:\n  ${[...new Set(external)].join("\n  ")}`);
if (external.length > 0 && failures.length === 0) failures.push(`${external.length} external request(s)`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Smoke test passed: ${THEMES.length} themes × ${fixtures.length} fixtures. Screenshots in .smoke/`);
```

- [ ] **Step 10: Verify build, lint, smoke**

Run: `npm test && npm run lint && npm run build && npm run smoke`
Expected: tests PASS; lint clean; build writes `out/index.html`; smoke prints `Smoke test passed: 3 themes × 0 fixtures`. Open `.smoke/{suisse,console,dossier}-empty.png`: off-white with a thick black top rule / near-black with amber wordmark / cream with small-caps serif wordmark; the matching switch button is pressed in each.

- [ ] **Step 11: Commit**

```bash
git add -A
git status --short   # must not list CLAUDE.md, .superpowers/ or .smoke/
git commit -m "Scaffold Perspicax with its three themes

Next.js static export, React 19, Tailwind 4 and node:test, as in Innomi.

The three visual directions ship as CSS-only themes over a single DOM:
Swiss (default), forensic console and case file. Components can only use
the theme tokens; Tailwind's stock palette, radii and shadows are
disabled. The chosen theme is the only thing stored, under
perspicax.settings.v1, and an inline boot script applies it before first
paint.

scripts/smoke.mjs drives headless Chromium over the DevTools protocol to
screenshot every theme and fail on any request leaving the page."
```

---

### Task 2: Bytes, transfer encodings, charsets

**Files:**
- Create: `src/lib/mime/bytes.ts`, `src/lib/mime/bytes.test.ts`, `src/lib/mime/charset.ts`, `src/lib/mime/charset.test.ts`

**Interfaces:**
- Produces: `bytesToBinary(bytes: Uint8Array): string`, `binaryToBytes(binary: string): Uint8Array`, `decodeBase64(input: string): Uint8Array`, `decodeQuotedPrintable(input: string): Uint8Array` (from `mime/bytes.ts`); `decodeText(bytes: Uint8Array, charset?: string | null): string`, `decodeUtf8OrLegacy(bytes: Uint8Array): string` (from `mime/charset.ts`).

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/mime/bytes.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { binaryToBytes, bytesToBinary, decodeBase64, decodeQuotedPrintable } from "./bytes.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test("binary strings round-trip every byte value", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(binaryToBytes(bytesToBinary(all)), all);
});

test("binary strings handle inputs larger than one chunk", () => {
  const big = new Uint8Array(100_000).fill(0xe9);
  const binary = bytesToBinary(big);
  assert.equal(binary.length, 100_000);
  assert.equal(binary.charCodeAt(99_999), 0xe9);
});

test("decodes base64 across line breaks and without padding", () => {
  assert.equal(text(decodeBase64("SGVs\r\nbG8=")), "Hello");
  assert.equal(text(decodeBase64("SGVsbG8")), "Hello");
});

test("realigns after padding in concatenated base64 blocks", () => {
  assert.equal(text(decodeBase64("SGk=SGk=")), "HiHi");
});

test("skips characters outside the base64 alphabet", () => {
  assert.equal(text(decodeBase64("SG Vs*bG8=")), "Hello");
});

test("decodes quoted-printable escapes and soft line breaks", () => {
  assert.equal(text(decodeQuotedPrintable("caf=C3=A9")), "café");
  assert.equal(text(decodeQuotedPrintable("abc=\r\ndef")), "abcdef");
  assert.equal(text(decodeQuotedPrintable("abc=  \ndef")), "abcdef");
});

test("keeps malformed quoted-printable escapes literally", () => {
  assert.equal(text(decodeQuotedPrintable("100=ZZ =")), "100=ZZ ");
});
```

```ts file=src/lib/mime/charset.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeText } from "./charset.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const LATIN1_CAFE = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);

test("decodes the declared charset", () => {
  assert.equal(decodeText(LATIN1_CAFE, "ISO-8859-1"), "café");
  assert.equal(decodeText(Uint8Array.from([0x80]), "windows-1252"), "€");
  assert.equal(decodeText(utf8("été"), "UTF-8"), "été");
});

test("falls back to windows-1252 when bytes labelled UTF-8 are not UTF-8", () => {
  assert.equal(decodeText(LATIN1_CAFE, "utf-8"), "café");
});

test("tries UTF-8 first for unknown, missing or ASCII labels", () => {
  assert.equal(decodeText(utf8("crème"), "x-made-up"), "crème");
  assert.equal(decodeText(utf8("crème"), null), "crème");
  assert.equal(decodeText(utf8("crème"), "us-ascii"), "crème");
});

test("accepts quoted labels", () => {
  assert.equal(decodeText(utf8("ok"), '"utf-8"'), "ok");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/lib/mime/bytes.ts'` and `.../charset.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/mime/bytes.ts
/**
 * MIME structure is ASCII but bodies are arbitrary bytes. The parser works on
 * "binary strings" — one char per byte, code points 0–255 — so it can use
 * plain string search and stay lossless.
 *
 * Never use `TextDecoder("latin1")` for this: per the WHATWG Encoding
 * standard that label means windows-1252, which remaps 0x80–0x9F.
 */
export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  // Chunked: spreading a large array into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

export function binaryToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

const BASE64_VALUES = (() => {
  const table = new Int8Array(256).fill(-1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  // URL-safe variants show up in hand-made payloads; accepting them costs nothing.
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

/**
 * Lenient base64: skips line breaks and stray characters, tolerates missing
 * padding, and realigns after `=` so concatenated encoded blocks still decode.
 */
export function decodeBase64(input: string): Uint8Array {
  const out = new Uint8Array(Math.ceil((input.length * 3) / 4));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x3d) {
      buffer = 0;
      bits = 0;
      continue;
    }
    const value = code < 256 ? BASE64_VALUES[code] : -1;
    if (value < 0) continue;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length++] = (buffer >> bits) & 0xff;
    }
  }
  return out.slice(0, length);
}

/** Quoted-printable (RFC 2045 §6.7). Malformed escapes are kept literally, as mail clients do. */
export function decodeQuotedPrintable(input: string): Uint8Array {
  const out = new Uint8Array(input.length);
  let length = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x3d) {
      // Soft line break: "=", optional trailing whitespace, then CRLF or LF.
      let j = i + 1;
      while (input[j] === " " || input[j] === "\t") j++;
      if (input[j] === "\r" && input[j + 1] === "\n") {
        i = j + 1;
        continue;
      }
      if (input[j] === "\n" || j >= input.length) {
        i = j;
        continue;
      }
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out[length++] = parseInt(hex, 16);
        i += 2;
        continue;
      }
    }
    out[length++] = code & 0xff;
  }
  return out.slice(0, length);
}
```

```ts file=src/lib/mime/charset.ts
const ALIASES: Record<string, string> = {
  utf8: "utf-8",
  "x-unknown": "utf-8",
  "unknown-8bit": "utf-8",
  "ks_c_5601-1987": "euc-kr",
  "ansi_x3.4-1968": "us-ascii",
};

// Labels that cannot be trusted to describe the bytes: they go through the
// UTF-8-then-legacy guess instead of a strict decoder.
const GUESSED = new Set(["utf-8", "us-ascii", "ascii"]);

function normaliseLabel(charset: string | null | undefined): string | null {
  const label = charset?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return label ? (ALIASES[label] ?? label) : null;
}

/**
 * Decodes text in its declared charset. A missing, unknown or untrustworthy
 * label falls back to UTF-8, then windows-1252 when the bytes are not valid
 * UTF-8: a wrong label should cost accents, not the whole body.
 */
export function decodeText(bytes: Uint8Array, charset?: string | null): string {
  const label = normaliseLabel(charset);
  if (label && !GUESSED.has(label)) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: guess below.
    }
  }
  return decodeUtf8OrLegacy(bytes);
}

export function decodeUtf8OrLegacy(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (settings + bytes + charset).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mime
git commit -m "Decode MIME transfer encodings and charsets

Bodies are handled as binary strings, one char per byte, so the parser can
use string search without losing anything. Base64 and quoted-printable are
lenient the way mail clients are: junk is skipped, padding realigns,
malformed escapes stay literal. Text decoding trusts explicit legacy
labels but guesses UTF-8 then windows-1252 when the label says UTF-8 or
ASCII, since that label is often wrong."
```

---

### Task 3: Header fields, encoded words, structured parameters

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/mime/headers.ts`, `src/lib/mime/headers.test.ts`
- Create: `src/lib/mime/encoded-words.ts`, `src/lib/mime/encoded-words.test.ts`
- Create: `src/lib/mime/params.ts`, `src/lib/mime/params.test.ts`

**Interfaces:**
- Consumes: `bytesToBinary`, `binaryToBytes`, `decodeBase64`, `decodeQuotedPrintable`, `decodeText`, `decodeUtf8OrLegacy` (Task 2).
- Produces: types `HeaderField`, `MimePart`, `Attachment`, `ParsedEmail` (`email.ts`); `splitHeaderBody(binary): { header: string; body: string }`, `parseHeaderBlock(header: string, warnings?: string[]): HeaderField[]`, `getHeader(fields, name): string | null`, `getHeaders(fields, name): string[]` (`mime/headers.ts`); `decodeEncodedWords(value: string): string` (`mime/encoded-words.ts`); `parseStructured(input: string): { value: string; params: Record<string, string> }` (`mime/params.ts`).

- [ ] **Step 1: Shared email types**

```ts file=src/lib/email.ts
/** One header line, unfolded. `value` is raw: RFC 2047 words are not decoded. */
export type HeaderField = { name: string; value: string };

export type MimePart = {
  headers: HeaderField[];
  /** Lowercased `type/subtype`; `text/plain` when absent, per RFC 2045. */
  contentType: string;
  /** Content-Type parameters, lowercased keys, values decoded. */
  params: Record<string, string>;
  disposition: "inline" | "attachment" | null;
  filename: string | null;
  contentId: string | null;
  /** Body with the transfer encoding removed. Empty for multiparts. */
  body: Uint8Array;
  children: MimePart[];
};

export type Attachment = {
  filename: string;
  contentType: string;
  contentId: string | null;
  /** Inline parts (images referenced by `cid:`, say) are listed too: they can carry payloads. */
  inline: boolean;
  data: Uint8Array;
};

/** The normalised email every parser produces (`mime/` now, `msg/` in milestone 4). */
export type ParsedEmail = {
  source: "eml" | "msg" | "headers";
  /** Top-level headers, in file order (newest Received first). */
  headers: HeaderField[];
  text: string | null;
  html: string | null;
  attachments: Attachment[];
  /** Human-readable source for the Raw tab. */
  raw: string;
  warnings: string[];
};
```

- [ ] **Step 2: Write the failing tests**

```ts file=src/lib/mime/headers.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { bytesToBinary } from "./bytes.ts";
import { getHeader, getHeaders, parseHeaderBlock, splitHeaderBody } from "./headers.ts";

const bin = (s: string) => bytesToBinary(new TextEncoder().encode(s));

test("splits headers from body on the first empty line, CRLF or LF", () => {
  assert.deepEqual(splitHeaderBody("A: 1\r\nB: 2\r\n\r\nbody\r\n\r\nmore"), {
    header: "A: 1\r\nB: 2",
    body: "body\r\n\r\nmore",
  });
  assert.deepEqual(splitHeaderBody("A: 1\n\nbody"), { header: "A: 1", body: "body" });
  assert.deepEqual(splitHeaderBody("A: 1"), { header: "A: 1", body: "" });
  assert.deepEqual(splitHeaderBody("\r\nbody"), { header: "", body: "body" });
});

test("unfolds continuation lines and keeps header order", () => {
  const fields = parseHeaderBlock(
    bin("Received: from a\r\n by b;\r\n\tTue, 13 Oct 2026 07:14:02 +0000\r\nSubject: hi\r\nReceived: from c by d"),
  );
  assert.deepEqual(fields.map((f) => f.name), ["Received", "Subject", "Received"]);
  assert.equal(fields[0].value, "from a by b;\tTue, 13 Oct 2026 07:14:02 +0000");
  assert.deepEqual(getHeaders(fields, "received"), [fields[0].value, "from c by d"]);
  assert.equal(getHeader(fields, "SUBJECT"), "hi");
  assert.equal(getHeader(fields, "x-missing"), null);
});

test("reads raw UTF-8 header bytes (RFC 6532) and falls back to windows-1252", () => {
  assert.equal(getHeader(parseHeaderBlock(bin("Subject: Résumé")), "subject"), "Résumé");
  const legacy = "Subject: caf" + String.fromCharCode(0xe9);
  assert.equal(getHeader(parseHeaderBlock(legacy), "subject"), "café");
});

test("skips lines that are not headers and reports them", () => {
  const warnings: string[] = [];
  const fields = parseHeaderBlock(bin("From someone@example.com Tue Oct 13 07:14:02 2026\nSubject: ok"), warnings);
  assert.deepEqual(fields, [{ name: "Subject", value: "ok" }]);
  assert.equal(warnings.length, 1);
});

test("tolerates whitespace before the colon", () => {
  assert.equal(getHeader(parseHeaderBlock(bin("Subject : hi")), "subject"), "hi");
});
```

```ts file=src/lib/mime/encoded-words.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEncodedWords } from "./encoded-words.ts";

test("decodes B and Q encoded words", () => {
  assert.equal(
    decodeEncodedWords("=?utf-8?B?UmFwcGVsIDogdm90cmUgZmFjdHVyZSBSRS0yMDI2LTQ0NzEgcmVzdGUgaW1wYXnDqWU=?="),
    "Rappel : votre facture RE-2026-4471 reste impayée",
  );
  assert.equal(decodeEncodedWords("=?iso-8859-1?Q?Caf=E9_cr=E8me?="), "Café crème");
});

test("joins a multi-byte character split across adjacent words", () => {
  assert.equal(decodeEncodedWords("=?utf-8?B?ww==?= =?utf-8?B?qQ==?="), "é");
});

test("keeps plain text and its spacing around encoded words", () => {
  assert.equal(decodeEncodedWords("Re: =?utf-8?Q?caf=C3=A9?= ok"), "Re: café ok");
  assert.equal(decodeEncodedWords("no words here"), "no words here");
});

test("drops whitespace between adjacent words in different charsets", () => {
  assert.equal(decodeEncodedWords("=?utf-8?Q?a?= =?iso-8859-1?Q?=E9?="), "aé");
});

test("ignores the RFC 2231 language suffix", () => {
  assert.equal(decodeEncodedWords("=?utf-8*fr?Q?=C3=A9t=C3=A9?="), "été");
});

test("leaves malformed words untouched", () => {
  assert.equal(decodeEncodedWords("=?utf-8?X?abc?="), "=?utf-8?X?abc?=");
});
```

```ts file=src/lib/mime/params.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStructured } from "./params.ts";

test("reads the value and quoted parameters", () => {
  assert.deepEqual(parseStructured('multipart/mixed; boundary="----=_Part_17_2026"'), {
    value: "multipart/mixed",
    params: { boundary: "----=_Part_17_2026" },
  });
  assert.deepEqual(parseStructured('text/plain; charset="UTF-8"; format=flowed').params, {
    charset: "UTF-8",
    format: "flowed",
  });
});

test("lowercases the value and parameter names", () => {
  assert.deepEqual(parseStructured("Text/HTML;Charset=iso-8859-1"), {
    value: "text/html",
    params: { charset: "iso-8859-1" },
  });
});

test("keeps semicolons inside quotes", () => {
  assert.equal(parseStructured('attachment; filename="a;b.txt"').params.filename, "a;b.txt");
});

test("decodes RFC 2231 extended values", () => {
  assert.equal(
    parseStructured("attachment; filename*=UTF-8''Facture%20%E2%82%AC.pdf").params.filename,
    "Facture €.pdf",
  );
});

test("joins RFC 2231 continuations, encoded or not", () => {
  assert.equal(
    parseStructured('attachment; filename*0="Facture_RE-4471"; filename*1=".pdf.html"').params.filename,
    "Facture_RE-4471.pdf.html",
  );
  assert.equal(
    parseStructured("attachment; filename*0*=utf-8''%C3%A9t; filename*1*=%C3%A9.txt").params.filename,
    "été.txt",
  );
});

test("prefers the RFC 2231 value over the plain one", () => {
  assert.equal(
    parseStructured("attachment; filename=\"old.pdf\"; filename*=utf-8''new.pdf").params.filename,
    "new.pdf",
  );
});

test("decodes RFC 2047 words in quoted names but never in the boundary", () => {
  assert.equal(parseStructured('attachment; filename="=?utf-8?B?w6l0w6kucGRm?="').params.filename, "été.pdf");
  assert.equal(parseStructured('multipart/mixed; boundary="=?x?Q?y?="').params.boundary, "=?x?Q?y?=");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `headers.ts`, `encoded-words.ts`, `params.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/mime/headers.ts
import type { HeaderField } from "../email.ts";
import { binaryToBytes } from "./bytes.ts";
import { decodeUtf8OrLegacy } from "./charset.ts";

/** Splits a message or part at its first empty line. Accepts CRLF and bare LF. */
export function splitHeaderBody(binary: string): { header: string; body: string } {
  // A part that starts with an empty line has no headers at all.
  if (binary.startsWith("\r\n")) return { header: "", body: binary.slice(2) };
  if (binary.startsWith("\n")) return { header: "", body: binary.slice(1) };
  const blank = /\r?\n\r?\n/.exec(binary);
  if (!blank) return { header: binary, body: "" };
  return {
    header: binary.slice(0, blank.index),
    body: binary.slice(blank.index + blank[0].length),
  };
}

/**
 * Parses a header block (a binary string) into unfolded fields, in order.
 * Raw 8-bit bytes are read as UTF-8 (RFC 6532), or windows-1252 when they
 * are not valid UTF-8. Lines that are not `name: value` are skipped.
 */
export function parseHeaderBlock(header: string, warnings?: string[]): HeaderField[] {
  const text = decodeUtf8OrLegacy(binaryToBytes(header));
  const fields: HeaderField[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && fields.length > 0) {
      // Unfolding: drop the line break, keep the whitespace.
      fields[fields.length - 1].value += line;
      continue;
    }
    const colon = line.indexOf(":");
    const name = colon > 0 ? line.slice(0, colon).replace(/[ \t]+$/, "") : "";
    if (!/^[!-9;-~]+$/.test(name)) {
      if (line.trim()) warnings?.push(`Ignored a line that is not a header: ${line.slice(0, 80)}`);
      continue;
    }
    fields.push({ name, value: line.slice(colon + 1).replace(/^[ \t]+/, "") });
  }
  for (const field of fields) field.value = field.value.replace(/[ \t]+$/, "");
  return fields;
}

/** First field with this name (case-insensitive) — the topmost, i.e. the most recent. */
export function getHeader(fields: readonly HeaderField[], name: string): string | null {
  const lower = name.toLowerCase();
  return fields.find((f) => f.name.toLowerCase() === lower)?.value ?? null;
}

export function getHeaders(fields: readonly HeaderField[], name: string): string[] {
  const lower = name.toLowerCase();
  return fields.filter((f) => f.name.toLowerCase() === lower).map((f) => f.value);
}
```

```ts file=src/lib/mime/encoded-words.ts
import { decodeBase64, decodeQuotedPrintable } from "./bytes.ts";
import { decodeText } from "./charset.ts";

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

type Run = { charset: string; bytes: number[] };

/**
 * Decodes RFC 2047 encoded words. Whitespace between two adjacent encoded
 * words is dropped (§6.2), and consecutive words in one charset are decoded
 * as a single run of bytes, because senders split multi-byte characters
 * across words.
 */
export function decodeEncodedWords(value: string): string {
  if (!value.includes("=?")) return value;
  let out = "";
  let last = 0;
  let run: Run | null = null;
  for (const match of value.matchAll(ENCODED_WORD)) {
    const start = match.index ?? 0;
    const gap = value.slice(last, start);
    // The *lang suffix comes from RFC 2231 §5.
    const charset = match[1].split("*")[0].toLowerCase();
    const bytes =
      match[2].toUpperCase() === "B"
        ? decodeBase64(match[3])
        : decodeQuotedPrintable(match[3].replace(/_/g, " "));
    const adjacent = run !== null && /^\s*$/.test(gap);
    if (run !== null && adjacent && run.charset === charset) {
      run.bytes.push(...bytes);
    } else {
      if (run !== null) out += decodeText(Uint8Array.from(run.bytes), run.charset);
      if (!adjacent) out += gap;
      run = { charset, bytes: Array.from(bytes) };
    }
    last = start + match[0].length;
  }
  if (run !== null) out += decodeText(Uint8Array.from(run.bytes), run.charset);
  return out + value.slice(last);
}
```

```ts file=src/lib/mime/params.ts
import { decodeText } from "./charset.ts";
import { decodeEncodedWords } from "./encoded-words.ts";

export type Structured = { value: string; params: Record<string, string> };

type Segment = { index: number; text: string; encoded: boolean };

/**
 * Parses `value; key=val; key*=charset''%XX` headers (Content-Type,
 * Content-Disposition), including RFC 2231 continuations and charsets, and
 * the RFC 2047 words that clients put in quoted file names anyway.
 */
export function parseStructured(input: string): Structured {
  const [head = "", ...rest] = splitOutsideQuotes(input);
  const params: Record<string, string> = {};
  const segments = new Map<string, Segment[]>();

  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const raw = unquote(part.slice(eq + 1).trim());
    const match = /^(.+?)(?:\*(\d+))?(\*)?$/.exec(key);
    if (!match) continue;
    const [, name, index, star] = match;
    if (index === undefined && star === undefined) {
      params[name] = name === "boundary" ? raw : decodeEncodedWords(raw);
      continue;
    }
    const list = segments.get(name) ?? [];
    list.push({ index: index === undefined ? 0 : Number(index), text: raw, encoded: star !== undefined });
    segments.set(name, list);
  }

  // RFC 2231 values win over plain ones: senders add both for older clients.
  for (const [name, list] of segments) {
    list.sort((a, b) => a.index - b.index);
    let charset = "utf-8";
    const bytes: number[] = [];
    list.forEach((segment, i) => {
      let text = segment.text;
      if (segment.encoded && i === 0) {
        const declared = /^([^']*)'[^']*'([\s\S]*)$/.exec(text);
        if (declared) {
          charset = declared[1] || charset;
          text = declared[2];
        }
      }
      if (segment.encoded) bytes.push(...percentDecode(text));
      else bytes.push(...new TextEncoder().encode(text));
    });
    params[name] = decodeText(Uint8Array.from(bytes), charset);
  }

  return { value: head.trim().toLowerCase(), params };
}

function splitOutsideQuotes(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted && ch === "\\") {
      current += ch + (input[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === ";" && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return value;
}

function percentDecode(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(text.charCodeAt(i) & 0xff);
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/lib/mime
git commit -m "Parse header fields, encoded words and MIME parameters

Header blocks are unfolded in order and read as UTF-8 with a windows-1252
fallback. RFC 2047 words are decoded run by run so a character split
across two words survives. Content-Type and Content-Disposition
parameters handle quoting and RFC 2231 continuations and charsets, and
RFC 2231 values take precedence over the plain ones senders add for old
clients."
```

---

### Task 4: MIME tree, bodies and attachments; first fixtures

**Files:**
- Create: `src/lib/mime/parse.ts`, `src/lib/mime/parse.test.ts`
- Create: `fixtures/spoofed-invoice.eml`, `fixtures/clean-newsletter.eml`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `parseEmail(bytes: Uint8Array): ParsedEmail`, `parseHeadersOnly(text: string): ParsedEmail`, `splitMultipart(body: string, boundary: string, warnings: string[]): string[]` (`mime/parse.ts`); the two fixtures, used by every later milestone.

- [ ] **Step 1: Fixtures**

Write both files exactly as below (LF line endings; `.gitattributes` keeps them byte-exact).

```eml file=fixtures/spoofed-invoice.eml
Received: from AS8PR04MB8213.eurprd04.prod.outlook.com (2603:10a6:20b:3f8::10)
 by AS8PR04MB8213.eurprd04.prod.outlook.com with HTTPS; Tue, 13 Oct 2026
 07:14:04 +0000
Authentication-Results: spf=fail (sender IP is 185.234.72.19)
 smtp.mailfrom=mta-relay.click; dkim=none (message not signed)
 header.d=none;dmarc=fail action=quarantine
 header.from=rhone-energie.fr;compauth=fail reason=000
Received-SPF: Fail (protection.outlook.com: domain of mta-relay.click does not
 designate 185.234.72.19 as permitted sender) receiver=protection.outlook.com;
 client-ip=185.234.72.19; helo=mx01.mta-relay.click;
Received: from AM4PEPF00027A6C.eurprd04.prod.outlook.com (2603:10a6:20b:4c4::14)
 by AS8PR04MB8213.eurprd04.prod.outlook.com (2603:10a6:20b:3f8::10) with
 Microsoft SMTP Server (version=TLS1_2,
 cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.8093.1; Tue, 13 Oct
 2026 07:14:03 +0000
Received: from mx01.mta-relay.click (185.234.72.19) by
 AM4PEPF00027A6C.mail.protection.outlook.com (10.167.16.73) with Microsoft SMTP
 Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.8093.1 via
 Frontend Transport; Tue, 13 Oct 2026 07:14:03 +0000
Received: from mail.rhone-energie.fr (unknown [185.234.72.19])
	by mx01.mta-relay.click (Postfix) with ESMTP id 4F2A71C0042
	for <j.martin@rhone-energie.fr>; Tue, 13 Oct 2026 09:14:02 +0200 (CEST)
X-MS-Exchange-Organization-SCL: 9
X-Forefront-Antispam-Report: CIP:185.234.72.19;CTRY:NL;LANG:fr;SCL:9;SRV:;IPV:NLI;SFV:SPM;H:mx01.mta-relay.click;PTR:InfoNoRecords;CAT:PHSH;SFS:(13230040)(4636009)(376014);DIR:INB;
X-Microsoft-Antispam: BCL:0;ARA:13230040|4636009|376014;
Return-Path: bounce-7f3a@mta-relay.click
From: =?utf-8?Q?Rh=C3=B4ne_=C3=89nergie_=E2=80=93_Service_Facturation?=
 <facturation@rhone-energie.fr>
Reply-To: <rhone.energie.paiement@outlook.fr>
To: <j.martin@rhone-energie.fr>
Subject: =?utf-8?B?UmFwcGVsIDogdm90cmUgZmFjdHVyZSBSRS0yMDI2LTQ0NzEgcmVzdGUgaW1wYXnDqWU=?=
Date: Tue, 13 Oct 2026 09:14:01 +0200
Message-ID: <20261013071401.4471@mta-relay.click>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="=_mix_4471"

This is a multi-part message in MIME format.

--=_mix_4471
Content-Type: multipart/alternative; boundary="=_alt_4471"

--=_alt_4471
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Bonjour,

Sauf erreur de notre part, la facture RE-2026-4471 d'un montant de 1 284,60 =
=E2=82=AC reste impay=C3=A9e. Merci de r=C3=A9gulariser via votre espace clie=
nt : https://espace-client.rhone-energie.fr

Service Facturation
--=_alt_4471
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html><body>
<p>Bonjour,</p>
<p>Sauf erreur de notre part, la facture RE-2026-4471 d'un montant de 1&nbs=
p;284,60&nbsp;&euro; reste impay&eacute;e.</p>
<p><a href=3D"https://eur01.safelinks.protection.outlook.com/?url=3Dhttps%3=
A%2F%2Frhone-energie.fr.secure-login.click%2Fauth%3Fu%3Dj.martin&amp;data=
=3D05%7C02&amp;reserved=3D0">https://espace-client.rhone-energie.fr</a></p>
<img src=3D"https://t.mta-relay.click/o/9f3a2c1e.gif" width=3D"1" height=3D=
"1" alt=3D"">
</body></html>
--=_alt_4471--

--=_mix_4471
Content-Type: text/html; name="Facture_RE-4471.pdf.html"
Content-Disposition: attachment; filename="Facture_RE-4471.pdf.html"
Content-Transfer-Encoding: base64

PGh0bWw+PGJvZHk+PHNjcmlwdD4KdmFyIGQ9YXRvYigiSlZCRVJpMHhMalFLSmNPa3c3ekR0c09m
Q2c9PSIpOwp2YXIgYj1uZXcgQmxvYihbZF0se3R5cGU6ImFwcGxpY2F0aW9uL29jdGV0LXN0cmVh
bSJ9KTsKaWYobmF2aWdhdG9yLm1zU2F2ZU9yT3BlbkJsb2Ipe25hdmlnYXRvci5tc1NhdmVPck9w
ZW5CbG9iKGIsIkZhY3R1cmVfUkUtNDQ3MS5pc28iKTt9CmVsc2V7dmFyIGE9ZG9jdW1lbnQuY3Jl
YXRlRWxlbWVudCgiYSIpO2EuaHJlZj1VUkwuY3JlYXRlT2JqZWN0VVJMKGIpO2EuZG93bmxvYWQ9
IkZhY3R1cmVfUkUtNDQ3MS5pc28iO2EuY2xpY2soKTt9Cjwvc2NyaXB0PjwvYm9keT48L2h0bWw+
Cg==
--=_mix_4471--
```

```eml file=fixtures/clean-newsletter.eml
Delivered-To: claire.dupont@gmail.com
Received: by 2002:a05:7010:4b8e:b0:3d1:5c2a:6b1f with SMTP id f14csp112233mdb;
        Mon, 12 Oct 2026 23:02:11 -0700 (PDT)
ARC-Authentication-Results: i=1; mx.google.com;
       dkim=pass header.i=@librairie-exemple.fr header.s=s1 header.b=Xy12abCd;
       spf=pass (google.com: domain of bounce+4471@em.librairie-exemple.fr designates 149.72.120.130 as permitted sender) smtp.mailfrom="bounce+4471@em.librairie-exemple.fr";
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=librairie-exemple.fr
Authentication-Results: mx.google.com;
       dkim=pass header.i=@librairie-exemple.fr header.s=s1 header.b=Xy12abCd;
       spf=pass (google.com: domain of bounce+4471@em.librairie-exemple.fr designates 149.72.120.130 as permitted sender) smtp.mailfrom="bounce+4471@em.librairie-exemple.fr";
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=librairie-exemple.fr
Return-Path: <bounce+4471@em.librairie-exemple.fr>
Received: from o1.em.librairie-exemple.fr (o1.em.librairie-exemple.fr. [149.72.120.130])
        by mx.google.com with ESMTPS id 5b1f17b1804b1-46f0c2a1d3esi998877f8f.412.2026.10.12.23.02.10
        for <claire.dupont@gmail.com>
        (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128);
        Mon, 12 Oct 2026 23:02:11 -0700 (PDT)
Received: by filterdrecv-5c9d8f7b4-x2k9q with SMTP id filterdrecv-5c9d8f7b4-x2k9q-1-6A0B1C2D-12
        2026-10-13 06:02:09.123456789 +0000 UTC m=+1234.567890
Received: from MjQ0NzE (unknown)
	by geopod-ismtpd-3 (SG) with HTTP
	id 9fXyZ_abQ1uVwR3sT2kL6g
	Tue, 13 Oct 2026 06:02:09.000 +0000 (UTC)
From: Librairie Exemple <lettre@librairie-exemple.fr>
To: claire.dupont@gmail.com
Subject: Nos coups de =?UTF-8?Q?c=C5=93ur_d=27octobre?=
Date: Tue, 13 Oct 2026 06:02:09 +0000
Message-ID: <a1b2c3d4.4471@librairie-exemple.fr>
List-Unsubscribe: <https://lettre.librairie-exemple.fr/desabonnement?u=4471>, <mailto:unsubscribe@librairie-exemple.fr>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b1_nl_4471"

--b1_nl_4471
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Bonjour Claire,
Voici nos coups de c=C5=93ur du mois.
--b1_nl_4471
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html><body><p>Bonjour Claire,</p><p>Voici nos coups de c&oelig;ur du mois.</p>
<p><a href=3D"https://lettre.librairie-exemple.fr/selection-octobre">Voir la s=
=C3=A9lection</a></p></body></html>
--b1_nl_4471--
```

- [ ] **Step 2: Write the failing tests**

```ts file=src/lib/mime/parse.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeEncodedWords } from "./encoded-words.ts";
import { getHeader } from "./headers.ts";
import { parseEmail, parseHeadersOnly } from "./parse.ts";

const eml = (source: string) => parseEmail(new TextEncoder().encode(source));
const fixture = (name: string) =>
  parseEmail(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));

const NESTED = [
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "preamble",
  "--mix",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  "Content-Type: text/plain",
  "",
  "plain body",
  "--alt",
  "Content-Type: text/html",
  "",
  "<p>html body</p>",
  "--alt--",
  "",
  "--mix",
  'Content-Type: application/pdf; name="a.pdf"',
  "Content-Disposition: attachment",
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0=",
  "--mix--",
  "epilogue",
];

test("parses a single-part message with quoted-printable text", () => {
  const email = eml(
    "Subject: hi\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nCaf=C3=A9 cr=C3=A8me=\r\n ok\r\n",
  );
  assert.equal(email.source, "eml");
  assert.equal(email.text, "Café crème ok\r\n");
  assert.equal(email.html, null);
  assert.deepEqual(email.attachments, []);
});

test("defaults to text/plain when Content-Type is missing", () => {
  assert.equal(eml("Subject: x\n\nhello").text, "hello");
});

test("walks nested multiparts: alternative bodies plus an attachment", () => {
  for (const eol of ["\r\n", "\n"]) {
    const email = eml(NESTED.join(eol));
    assert.equal(email.text, "plain body");
    assert.equal(email.html, "<p>html body</p>");
    assert.equal(email.attachments.length, 1);
    assert.equal(email.attachments[0].filename, "a.pdf");
    assert.equal(email.attachments[0].contentType, "application/pdf");
    assert.equal(email.attachments[0].inline, false);
    assert.equal(new TextDecoder().decode(email.attachments[0].data), "%PDF-");
    assert.deepEqual(email.warnings, []);
  }
});

test("tolerates a missing closing boundary", () => {
  const email = eml(
    ['Content-Type: multipart/mixed; boundary="b"', "", "--b", "Content-Type: text/plain", "", "body", "--b",
      'Content-Type: text/plain; name="note.txt"', "", "trailing"].join("\n"),
  );
  assert.equal(email.text, "body");
  assert.equal(email.attachments[0].filename, "note.txt");
  assert.match(email.warnings.join(" "), /closing boundary/);
});

test("names unnamed extra parts instead of dropping them", () => {
  const email = eml(
    ['Content-Type: multipart/mixed; boundary="b"', "", "--b", "Content-Type: text/plain", "", "one", "--b",
      "Content-Type: text/plain", "", "two", "--b--"].join("\n"),
  );
  assert.equal(email.text, "one");
  assert.equal(email.attachments[0].filename, "part-1.txt");
});

test("survives absurd multipart nesting", () => {
  let body = "Content-Type: text/plain\n\ncore";
  for (let i = 0; i < 40; i++) {
    body = `Content-Type: multipart/mixed; boundary="b${i}"\n\n--b${i}\n${body}\n--b${i}--`;
  }
  assert.match(eml(body).warnings.join(" "), /too deep/);
});

test("reads the spoofed-invoice fixture", () => {
  const email = fixture("spoofed-invoice.eml");
  assert.equal(
    decodeEncodedWords(getHeader(email.headers, "subject") ?? ""),
    "Rappel : votre facture RE-2026-4471 reste impayée",
  );
  assert.match(email.text ?? "", /1 284,60 € reste impayée/);
  assert.match(email.html ?? "", /safelinks\.protection\.outlook\.com/);
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, "Facture_RE-4471.pdf.html");
  assert.match(new TextDecoder().decode(email.attachments[0].data), /msSaveOrOpenBlob/);
  assert.deepEqual(email.warnings, []);
});

test("reads the clean-newsletter fixture", () => {
  const email = fixture("clean-newsletter.eml");
  assert.equal(decodeEncodedWords(getHeader(email.headers, "subject") ?? ""), "Nos coups de cœur d'octobre");
  assert.match(email.text ?? "", /cœur du mois/);
  assert.match(email.html ?? "", /Voir la sélection/);
});

test("pasted headers: everything up to the first blank line, leading blank lines ignored", () => {
  const email = parseHeadersOnly("\n\nReceived: from a by b; Tue, 13 Oct 2026 07:14:02 +0000\nSubject: x\n\nnot a header");
  assert.equal(email.source, "headers");
  assert.deepEqual(email.headers.map((h) => h.name), ["Received", "Subject"]);
  assert.equal(email.text, null);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `parse.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/mime/parse.ts
import type { MimePart, ParsedEmail } from "../email.ts";
import { binaryToBytes, bytesToBinary, decodeBase64, decodeQuotedPrintable } from "./bytes.ts";
import { decodeText, decodeUtf8OrLegacy } from "./charset.ts";
import { getHeader, parseHeaderBlock, splitHeaderBody } from "./headers.ts";
import { parseStructured } from "./params.ts";

// A crafted email can nest multiparts deep enough to exhaust the stack.
const MAX_DEPTH = 32;

const EXTENSIONS: Record<string, string> = {
  "text/plain": "txt",
  "text/html": "html",
  "message/rfc822": "eml",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};

/** Parses a complete RFC 5322 / MIME message. Never throws on malformed input. */
export function parseEmail(bytes: Uint8Array): ParsedEmail {
  const warnings: string[] = [];
  const root = parsePart(bytesToBinary(bytes), 0, warnings);
  const email: ParsedEmail = {
    source: "eml",
    headers: root.headers,
    text: null,
    html: null,
    attachments: [],
    raw: decodeUtf8OrLegacy(bytes),
    warnings,
  };
  collect(root, email);
  return email;
}

/** "Paste headers" mode: the header block only; anything after a blank line is ignored. */
export function parseHeadersOnly(text: string): ParsedEmail {
  const trimmed = text.replace(/^(?:[ \t]*\r?\n)+/, "");
  const warnings: string[] = [];
  const { header } = splitHeaderBody(bytesToBinary(new TextEncoder().encode(trimmed)));
  return {
    source: "headers",
    headers: parseHeaderBlock(header, warnings),
    text: null,
    html: null,
    attachments: [],
    raw: trimmed,
    warnings,
  };
}

function parsePart(binary: string, depth: number, warnings: string[]): MimePart {
  const { header, body } = splitHeaderBody(binary);
  const headers = parseHeaderBlock(header, warnings);
  const type = parseStructured(getHeader(headers, "content-type") ?? "text/plain");
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(type.value) ? type.value : "text/plain";
  const disposition = parseStructured(getHeader(headers, "content-disposition") ?? "");
  const contentId = (getHeader(headers, "content-id") ?? "").trim().replace(/^<|>$/g, "");
  const part: MimePart = {
    headers,
    contentType,
    params: type.params,
    disposition:
      disposition.value === "attachment" || disposition.value === "inline" ? disposition.value : null,
    filename: disposition.params.filename || type.params.name || null,
    contentId: contentId || null,
    body: new Uint8Array(0),
    children: [],
  };

  if (contentType.startsWith("multipart/")) {
    const boundary = type.params.boundary;
    if (boundary && depth < MAX_DEPTH) {
      part.children = splitMultipart(body, boundary, warnings).map((child) =>
        parsePart(child, depth + 1, warnings),
      );
      return part;
    }
    warnings.push(
      depth >= MAX_DEPTH
        ? "Multipart nesting too deep; inner parts were not parsed."
        : `A ${contentType} part has no boundary; it was read as a single body.`,
    );
  }

  part.body = decodeTransfer(body, getHeader(headers, "content-transfer-encoding"));
  return part;
}

function decodeTransfer(body: string, encoding: string | null): Uint8Array {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return binaryToBytes(body);
  }
}

/**
 * Splits a multipart body on its delimiter lines (RFC 2046 §5.1.1). The line
 * break before a delimiter belongs to the delimiter; preamble and epilogue
 * are dropped; a missing close delimiter is tolerated.
 */
export function splitMultipart(body: string, boundary: string, warnings: string[]): string[] {
  const delimiter = `--${boundary}`;
  const parts: string[] = [];
  let partStart = -1;
  let lineStart = 0;
  while (lineStart <= body.length) {
    let lineEnd = body.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = body.length;
    // Only lines starting with "-" can be delimiters; skip the rest cheaply.
    if (body.charCodeAt(lineStart) === 0x2d) {
      const line = body.slice(lineStart, lineEnd).replace(/\r$/, "");
      if (line.startsWith(delimiter)) {
        const rest = line.slice(delimiter.length);
        const isClose = /^--[ \t]*$/.test(rest);
        if (isClose || /^[ \t]*$/.test(rest)) {
          if (partStart !== -1) parts.push(body.slice(partStart, contentEnd(body, lineStart)));
          if (isClose) return parts;
          partStart = lineEnd + 1;
        }
      }
    }
    lineStart = lineEnd + 1;
  }
  if (partStart !== -1) {
    parts.push(body.slice(partStart));
    warnings.push("A multipart body ends without its closing boundary.");
  }
  return parts;
}

function contentEnd(body: string, delimiterStart: number): number {
  let end = delimiterStart;
  if (end > 0 && body[end - 1] === "\n") end--;
  if (end > 0 && body[end - 1] === "\r") end--;
  return end;
}

/**
 * The first unnamed, non-attachment text/plain and text/html leaves are the
 * bodies; every other leaf is an attachment, so nothing a sender included
 * goes unseen.
 */
function collect(part: MimePart, email: ParsedEmail): void {
  if (part.children.length > 0) {
    for (const child of part.children) collect(child, email);
    return;
  }
  if (part.contentType.startsWith("multipart/")) return;
  const isBody = part.disposition !== "attachment" && part.filename === null;
  if (isBody && part.contentType === "text/plain" && email.text === null) {
    email.text = decodeText(part.body, part.params.charset);
    return;
  }
  if (isBody && part.contentType === "text/html" && email.html === null) {
    email.html = decodeText(part.body, part.params.charset);
    return;
  }
  const n = email.attachments.length + 1;
  email.attachments.push({
    filename: part.filename ?? `part-${n}.${EXTENSIONS[part.contentType] ?? "bin"}`,
    contentType: part.contentType,
    contentId: part.contentId,
    inline: part.disposition === "inline" || (part.disposition === null && part.contentId !== null),
    data: part.body,
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mime fixtures
git commit -m "Parse MIME trees into bodies and attachments

parseEmail walks nested multiparts, removes transfer encodings and picks
the first plain and HTML bodies; every other leaf becomes an attachment,
named if the sender left it unnamed, so nothing a sender included goes
unseen. Missing closing boundaries and absurd nesting produce warnings,
not exceptions. parseHeadersOnly backs the paste-headers mode.

Adds the first two fixtures: a spoofed invoice (DMARC fail, Reply-To to
free mail, SafeLinks-wrapped link, tracking pixel, HTML smuggling
attachment) and a clean newsletter as the false-positive guard."
```

---

### Task 5: Addresses, IP literals, domains, reference lists

**Files:**
- Create: `src/lib/mime/address.ts`, `src/lib/mime/address.test.ts`
- Create: `src/lib/net/ip.ts`, `src/lib/net/ip.test.ts`, `src/lib/net/domain.ts`, `src/lib/net/domain.test.ts`
- Create: `src/lib/data/freemail.ts`, `src/lib/data/brands.ts`

**Interfaces:**
- Consumes: `decodeEncodedWords` (Task 3).
- Produces: `Address = { name: string; address: string; domain: string }`, `parseAddressList(value: string): Address[]`; `IpScope`, `isIPv4(s)`, `isIPv6(s)`, `isIp(s)`, `ipScope(ip): IpScope`; `normaliseHost(h)`, `orgDomain(h)`, `sameOrg(a, b)`, `isSubdomainOf(host, domain)`; `isFreeMail(domain)`; `Brand`, `BRANDS`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/mime/address.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAddressList } from "./address.ts";

test("parses a display name and address, lowercasing the domain only", () => {
  assert.deepEqual(parseAddressList('"Rhône Énergie" <Facturation@Rhone-Energie.FR>'), [
    { name: "Rhône Énergie", address: "Facturation@rhone-energie.fr", domain: "rhone-energie.fr" },
  ]);
});

test("decodes RFC 2047 display names", () => {
  const [from] = parseAddressList(
    "=?utf-8?Q?Rh=C3=B4ne_=C3=89nergie_=E2=80=93_Service_Facturation?= <facturation@rhone-energie.fr>",
  );
  assert.equal(from.name, "Rhône Énergie – Service Facturation");
});

test("splits lists on commas outside quotes", () => {
  const list = parseAddressList('a@x.com, "Doe, John" <j@y.com>');
  assert.deepEqual(list.map((a) => a.address), ["a@x.com", "j@y.com"]);
  assert.equal(list[1].name, "Doe, John");
});

test("handles bare addresses, angle-only addresses and comments", () => {
  assert.deepEqual(parseAddressList("<x@y.com>")[0], { name: "", address: "x@y.com", domain: "y.com" });
  assert.equal(parseAddressList("user@example.com (Comment)")[0].address, "user@example.com");
});

test("keeps an address-looking display name as the name", () => {
  const [from] = parseAddressList('"ceo@rhone-energie.fr" <boss@evil.top>');
  assert.equal(from.name, "ceo@rhone-energie.fr");
  assert.equal(from.address, "boss@evil.top");
});

test("returns nothing for empty groups and garbage", () => {
  assert.deepEqual(parseAddressList("Undisclosed recipients:;"), []);
  assert.deepEqual(parseAddressList("not an address"), []);
  assert.deepEqual(parseAddressList("<>"), []);
});
```

```ts file=src/lib/net/ip.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ipScope, isIPv4, isIPv6 } from "./ip.ts";

test("recognises IPv4 literals", () => {
  for (const ip of ["185.234.72.19", "0.0.0.0", "255.255.255.255"]) assert.ok(isIPv4(ip), ip);
  for (const ip of ["256.1.1.1", "1.2.3", "01.2.3.4", "1.2.3.4.5"]) assert.ok(!isIPv4(ip), ip);
});

test("recognises IPv6 literals", () => {
  for (const ip of ["2603:10a6:20b:4c4::14", "::1", "::", "fe80::1", "::ffff:192.0.2.1", "1:2:3:4:5:6:7:8"]) {
    assert.ok(isIPv6(ip), ip);
  }
  for (const ip of ["1::2::3", "12345::", "1:2:3:4:5:6:7:8:9", "abc", ":1", "1.2.3.4"]) {
    assert.ok(!isIPv6(ip), ip);
  }
});

test("classifies IPv4 scopes", () => {
  assert.equal(ipScope("185.234.72.19"), "public");
  assert.equal(ipScope("10.1.2.3"), "private");
  assert.equal(ipScope("172.16.0.1"), "private");
  assert.equal(ipScope("172.32.0.1"), "public");
  assert.equal(ipScope("192.168.1.1"), "private");
  assert.equal(ipScope("127.0.0.1"), "loopback");
  assert.equal(ipScope("169.254.1.1"), "link-local");
  assert.equal(ipScope("100.64.0.1"), "shared");
  assert.equal(ipScope("192.0.2.1"), "reserved");
  assert.equal(ipScope("224.0.0.1"), "reserved");
});

test("classifies IPv6 scopes", () => {
  assert.equal(ipScope("::1"), "loopback");
  assert.equal(ipScope("fe80::1"), "link-local");
  assert.equal(ipScope("fd12::1"), "private");
  assert.equal(ipScope("2001:db8::1"), "reserved");
  assert.equal(ipScope("2603:10a6:20b:4c4::14"), "public");
  assert.equal(ipScope("::ffff:10.0.0.1"), "private");
});
```

```ts file=src/lib/net/domain.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isFreeMail } from "../data/freemail.ts";
import { isSubdomainOf, orgDomain, sameOrg } from "./domain.ts";

test("finds the registrable domain", () => {
  assert.equal(orgDomain("mail.rhone-energie.fr"), "rhone-energie.fr");
  assert.equal(orgDomain("Rhone-Energie.FR."), "rhone-energie.fr");
  assert.equal(orgDomain("rhone-energie.fr.secure-login.click"), "secure-login.click");
  assert.equal(orgDomain("a.b.example.co.uk"), "example.co.uk");
  assert.equal(orgDomain("dgfip.finances.gouv.fr"), "finances.gouv.fr");
  assert.equal(orgDomain("evil.github.io"), "evil.github.io");
  assert.equal(orgDomain("localhost"), "localhost");
  assert.equal(orgDomain("185.234.72.19"), "185.234.72.19");
});

test("compares organisations and subdomains", () => {
  assert.ok(sameOrg("em.librairie-exemple.fr", "librairie-exemple.fr"));
  assert.ok(!sameOrg("rhone-energie.fr", "rhone-energie.fr.secure-login.click"));
  assert.ok(isSubdomainOf("espace-client.rhone-energie.fr", "rhone-energie.fr"));
  assert.ok(!isSubdomainOf("evilrhone-energie.fr", "rhone-energie.fr"));
});

test("knows free webmail domains", () => {
  assert.ok(isFreeMail("Outlook.FR"));
  assert.ok(isFreeMail("gmail.com"));
  assert.ok(!isFreeMail("rhone-energie.fr"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `address.ts`, `ip.ts`, `domain.ts`, `freemail.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/mime/address.ts
import { decodeEncodedWords } from "./encoded-words.ts";

export type Address = {
  /** Display name, decoded; empty when there is none. */
  name: string;
  /** `local@domain`, domain lowercased (the local part is case-sensitive). */
  address: string;
  domain: string;
};

/**
 * Parses an address-list header (From, To, Reply-To…). Lenient on purpose:
 * phishing mail is often malformed, so anything shaped like `local@domain`
 * is picked up, inside angle brackets or not.
 */
export function parseAddressList(value: string): Address[] {
  const out: Address[] = [];
  for (const item of splitAddresses(value)) {
    const parsed = parseMailbox(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Splits on commas outside quotes, comments and angle brackets; drops group syntax (`team: a, b;`). */
function splitAddresses(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quoted) {
      current += ch;
      if (ch === "\\") current += value[++i] ?? "";
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (paren === 0 && angle === 0) {
      if (ch === "," || ch === ";") {
        items.push(current);
        current = "";
        continue;
      }
      if (ch === ":") {
        // End of a group name; its members follow.
        current = "";
        continue;
      }
    }
    current += ch;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

function parseMailbox(item: string): Address | null {
  const text = stripComments(item);
  const open = text.lastIndexOf("<");
  const close = open === -1 ? -1 : text.indexOf(">", open);
  let name = "";
  let spec = text;
  if (open !== -1 && close !== -1) {
    name = text.slice(0, open);
    spec = text.slice(open + 1, close);
  }
  const match = /([^\s<>()[\],;:"@]+)@([^\s<>()[\],;:"@]+)/.exec(spec);
  if (!match) return null;
  const domain = match[2].toLowerCase().replace(/\.$/, "");
  return { name: cleanName(name), address: `${match[1]}@${domain}`, domain };
}

function cleanName(name: string): string {
  let n = name.trim();
  if (n.length >= 2 && n.startsWith('"') && n.endsWith('"')) n = n.slice(1, -1).replace(/\\(.)/g, "$1");
  return decodeEncodedWords(n).replace(/\s+/g, " ").trim();
}

function stripComments(text: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') quoted = false;
      continue;
    }
    if (depth === 0 && ch === '"') {
      quoted = true;
      out += ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}
```

```ts file=src/lib/net/ip.ts
export type IpScope = "public" | "private" | "loopback" | "link-local" | "shared" | "reserved";

const OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`);

export function isIPv4(value: string): boolean {
  return IPV4.test(value);
}

export function isIPv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const lastColon = value.lastIndexOf(":");
  const embedsV4 = value.slice(lastColon + 1).includes(".");
  if (embedsV4 && !isIPv4(value.slice(lastColon + 1))) return false;
  const groupsOf = (part: string) => (part === "" ? [] : part.split(":"));
  let groups = [...groupsOf(halves[0]), ...(halves.length === 2 ? groupsOf(halves[1]) : [])];
  if (embedsV4) groups = groups.slice(0, -1);
  if (!groups.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  const count = groups.length + (embedsV4 ? 2 : 0);
  return halves.length === 2 ? count < 8 : count === 8;
}

export function isIp(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

/** Where an address lives. Only `public` addresses identify a sender on the internet. */
export function ipScope(ip: string): IpScope {
  if (isIPv4(ip)) return ipv4Scope(ip.split(".").map(Number));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return ipv4Scope(mapped[1].split(".").map(Number));
  const lower = ip.toLowerCase();
  if (lower === "::1") return "loopback";
  if (lower === "::") return "reserved";
  const groups = lower.split(":");
  const first = parseInt(groups[0] || "0", 16);
  const second = parseInt(groups[1] || "0", 16);
  if ((first & 0xffc0) === 0xfe80) return "link-local";
  if ((first & 0xfe00) === 0xfc00) return "private";
  if ((first & 0xff00) === 0xff00) return "reserved";
  if (first === 0x2001 && second === 0x0db8) return "reserved";
  return "public";
}

function ipv4Scope([a, b, c]: number[]): IpScope {
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link-local";
  if (a === 100 && b >= 64 && b <= 127) return "shared";
  if (
    a === 0 ||
    a >= 224 ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return "reserved";
  }
  return "public";
}
```

```ts file=src/lib/net/domain.ts
import { isIp } from "./ip.ts";

/**
 * Public suffixes made of two or more labels, for the registrable-domain
 * approximation below. Not the full Public Suffix List — enough for the
 * mail and hosting domains an analyst meets; anything else falls back to
 * "the last two labels".
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "govt.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.hk", "com.sg", "com.tw", "com.my", "com.mx", "com.ar", "com.co", "com.tr",
  "com.ua", "com.pl", "com.vn", "com.ph", "com.pk", "com.eg", "com.sa", "com.ng",
  "co.in", "net.in", "org.in", "gov.in", "ac.in",
  "co.za", "org.za", "gov.za",
  "co.il", "org.il", "co.id", "or.id", "ac.id", "co.ke", "co.th", "in.th", "ac.th",
  "co.at", "or.at", "gv.at",
  "gouv.fr", "asso.fr", "nom.fr", "presse.fr",
  // Hosting platforms: each customer subdomain is a different owner.
  "github.io", "gitlab.io", "blogspot.com", "herokuapp.com", "netlify.app", "vercel.app",
  "pages.dev", "workers.dev", "r2.dev", "web.app", "firebaseapp.com", "appspot.com",
  "azurewebsites.net", "cloudfront.net", "s3.amazonaws.com", "glitch.me", "repl.co",
  "ngrok.io", "ngrok-free.app", "weebly.com", "wixsite.com", "000webhostapp.com",
]);

export function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Registrable ("organisational") domain: `mail.em.example.co.uk` → `example.co.uk`. IP literals come back as is. */
export function orgDomain(host: string): string {
  const h = normaliseHost(host);
  if (isIp(h)) return h;
  const labels = h.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  for (let take = Math.min(3, labels.length - 1); take >= 2; take--) {
    if (MULTI_LABEL_SUFFIXES.has(labels.slice(-take).join("."))) {
      return labels.slice(-take - 1).join(".");
    }
  }
  return labels.slice(-2).join(".");
}

export function sameOrg(a: string, b: string): boolean {
  return orgDomain(a) === orgDomain(b);
}

/** True when `host` is `domain` itself or one of its subdomains. */
export function isSubdomainOf(host: string, domain: string): boolean {
  const h = normaliseHost(host);
  const d = normaliseHost(domain);
  return h === d || h.endsWith(`.${d}`);
}
```

```ts file=src/lib/data/freemail.ts
import { normaliseHost } from "../net/domain.ts";

/** Free webmail providers: anyone can open an address there in a minute. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.fr", "outlook.de", "outlook.es", "outlook.it",
  "hotmail.com", "hotmail.fr", "hotmail.co.uk", "hotmail.es", "hotmail.it", "hotmail.de",
  "live.com", "live.fr", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.fr", "yahoo.co.uk", "yahoo.es", "yahoo.de", "yahoo.it", "ymail.com",
  "aol.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "tutanota.com", "tuta.io",
  "gmx.com", "gmx.net", "gmx.de", "gmx.fr", "web.de", "t-online.de", "mail.com",
  "mail.ru", "yandex.ru", "yandex.com", "zoho.com",
  "laposte.net", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr",
  "libero.it", "virgilio.it", "qq.com", "163.com", "126.com", "naver.com",
  "seznam.cz", "wp.pl", "o2.pl", "interia.pl", "btinternet.com",
  "terra.com.br", "uol.com.br", "bol.com.br", "rediffmail.com",
  "skynet.be", "telenet.be", "bluewin.ch",
]);

export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(normaliseHost(domain));
}
```

```ts file=src/lib/data/brands.ts
export type Brand = {
  name: string;
  /** Matched against display names. */
  pattern: RegExp;
  /** Domains the brand really mails from; compared by organisation. */
  domains: string[];
};

/** Brands most often impersonated in display names. */
export const BRANDS: Brand[] = [
  {
    name: "Microsoft",
    pattern: /\b(microsoft|office ?365|microsoft ?365|onedrive|sharepoint)\b/i,
    domains: ["microsoft.com", "office.com", "office365.com", "microsoftonline.com", "sharepointonline.com", "onedrive.com", "live.com", "outlook.com"],
  },
  { name: "Google", pattern: /\b(google|gmail)\b/i, domains: ["google.com", "youtube.com"] },
  { name: "Apple", pattern: /\b(apple|icloud|itunes|app ?store)\b/i, domains: ["apple.com", "icloud.com", "me.com"] },
  {
    name: "PayPal",
    pattern: /\bpay ?pal\b/i,
    domains: ["paypal.com", "paypal.fr", "paypal.de", "paypal.co.uk", "paypal.it", "paypal.es", "paypal.nl"],
  },
  {
    name: "Amazon",
    pattern: /\bamazon\b/i,
    domains: ["amazon.com", "amazon.fr", "amazon.de", "amazon.co.uk", "amazon.it", "amazon.es", "amazon.ca", "amazon.co.jp"],
  },
  { name: "DocuSign", pattern: /\bdocu ?sign\b/i, domains: ["docusign.net", "docusign.com"] },
  { name: "Adobe", pattern: /\badobe\b/i, domains: ["adobe.com", "adobesign.com", "echosign.com"] },
  { name: "Dropbox", pattern: /\bdropbox\b/i, domains: ["dropbox.com", "dropboxmail.com"] },
  { name: "WeTransfer", pattern: /\bwe ?transfer\b/i, domains: ["wetransfer.com"] },
  { name: "DHL", pattern: /\bdhl\b/i, domains: ["dhl.com", "dhl.de", "dhl.fr", "dhl.co.uk"] },
  { name: "FedEx", pattern: /\bfed ?ex\b/i, domains: ["fedex.com"] },
  // Case-sensitive: "ups" is also an ordinary word ending ("follow-ups").
  { name: "UPS", pattern: /\bUPS\b/, domains: ["ups.com"] },
  {
    name: "La Poste",
    pattern: /\b(la ?poste|colissimo|chronopost)\b/i,
    domains: ["laposte.fr", "laposte.net", "colissimo.fr", "chronopost.fr"],
  },
  { name: "Netflix", pattern: /\bnetflix\b/i, domains: ["netflix.com"] },
  { name: "LinkedIn", pattern: /\blinked ?in\b/i, domains: ["linkedin.com"] },
  { name: "Facebook", pattern: /\b(facebook|instagram)\b/i, domains: ["facebookmail.com", "facebook.com", "instagram.com", "meta.com"] },
  { name: "Assurance Maladie", pattern: /\b(ameli|assurance ?maladie)\b/i, domains: ["ameli.fr", "assurance-maladie.fr"] },
  {
    name: "Impôts",
    pattern: /\b(imp[oô]ts?|dgfip|finances publiques)\b/i,
    domains: ["impots.gouv.fr", "dgfip.finances.gouv.fr"],
  },
  { name: "ANTAI", pattern: /\bantai\b/i, domains: ["antai.gouv.fr"] },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mime src/lib/net src/lib/data
git commit -m "Parse addresses, IP literals and registrable domains

Address lists are parsed leniently, since phishing mail is malformed on
purpose. IP scopes separate the public addresses that identify a sender
from private and reserved ones. orgDomain approximates the registrable
domain with a short list of multi-label and hosting suffixes rather than
bundling the full Public Suffix List.

Adds the reference lists the header checks need: free webmail providers
and the brands most often impersonated in display names."
```

---

### Task 6: Dates and the relay chain

**Files:**
- Create: `src/lib/finding.ts`
- Create: `src/lib/headers/date.ts`, `src/lib/headers/date.test.ts`
- Create: `src/lib/headers/received.ts`, `src/lib/headers/received.test.ts`

**Interfaces:**
- Consumes: `getHeaders` (Task 3), `ipScope`, `isIp`, `IpScope`, `orgDomain` (Task 5).
- Produces: `Severity`, `FindingCategory`, `Finding`, `SEVERITY_RANK`, `sortFindings(findings)` (`finding.ts`); `parseMailDate(value: string): Date | null`, `dateFindings(raw: string | null, hops: readonly Hop[]): Finding[]` (`headers/date.ts`); `Hop`, `parseReceived(raw: string): Omit<Hop, "index" | "delay">`, `relayChain(headers): Hop[]`, `routeFindings(hops): Finding[]` (`headers/received.ts`).

- [ ] **Step 1: Finding type**

```ts file=src/lib/finding.ts
export type Severity = "info" | "low" | "medium" | "high";

/** Later milestones add link, html, attachment and body categories. */
export type FindingCategory = "auth" | "sender" | "route" | "vendor";

export type Finding = {
  /** Stable machine id, e.g. `auth.dmarc-fail`. */
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  /** Why this matters, in plain words. Every theme shows it. */
  explanation: string;
  /** The exact header values that triggered the finding. */
  evidence: string[];
  /** Contribution to the risk score (aggregated in `score/`, milestone 4). */
  weight: number;
};

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

/** Most severe first, then heaviest first. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.weight - a.weight,
  );
}
```

- [ ] **Step 2: Write the failing tests**

```ts file=src/lib/headers/date.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateFindings, parseMailDate } from "./date.ts";
import type { Hop } from "./received.ts";

const iso = (value: string) => parseMailDate(value)?.toISOString() ?? null;

test("parses RFC 5322 dates with numeric zones and comments", () => {
  assert.equal(iso("Tue, 13 Oct 2026 09:14:02 +0200 (CEST)"), "2026-10-13T07:14:02.000Z");
  assert.equal(iso("Tue, 13 Oct 2026 06:02:09.000 +0000 (UTC)"), "2026-10-13T06:02:09.000Z");
});

test("parses obsolete forms: two-digit years, no seconds, named zones", () => {
  assert.equal(iso("13 Oct 26 07:14 GMT"), "2026-10-13T07:14:00.000Z");
  assert.equal(iso("Mon, 12 Oct 2026 23:02:11 PDT"), "2026-10-13T06:02:11.000Z");
});

test("parses ISO-style stamps some relays write", () => {
  assert.equal(iso("2026-10-13 06:02:09.123456789 +0000 UTC m=+1234.5"), "2026-10-13T06:02:09.000Z");
});

test("returns null instead of guessing", () => {
  assert.equal(parseMailDate("yesterday"), null);
  assert.equal(parseMailDate("32 Oct 2026 10:00:00 +0000"), null);
});

function hopAt(index: number, isoDate: string): Hop {
  return {
    index, helo: null, rdns: null, ip: null, ipScope: null, by: null, protocol: null, tls: false,
    date: new Date(isoDate), delay: null, heloMismatch: false, raw: "",
  };
}

test("flags a missing or unreadable Date header", () => {
  assert.deepEqual(dateFindings(null, []).map((f) => f.id), ["route.date-missing"]);
  assert.deepEqual(dateFindings("soon", []).map((f) => f.id), ["route.date-unreadable"]);
});

test("flags dates in the future of delivery and long before relaying", () => {
  const hops = [hopAt(1, "2026-10-13T07:14:02Z"), hopAt(2, "2026-10-13T07:14:04Z")];
  assert.deepEqual(dateFindings("Tue, 13 Oct 2026 07:14:01 +0000", hops), []);
  assert.deepEqual(dateFindings("Tue, 13 Oct 2026 12:00:00 +0000", hops).map((f) => f.id), ["route.date-future"]);
  assert.deepEqual(dateFindings("Thu, 1 Oct 2026 07:00:00 +0000", hops).map((f) => f.id), ["route.date-old"]);
});
```

```ts file=src/lib/headers/received.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail } from "../mime/parse.ts";
import { parseReceived, relayChain, routeFindings } from "./received.ts";

const POSTFIX =
  "from mail.rhone-energie.fr (unknown [185.234.72.19])\tby mx01.mta-relay.click (Postfix) with ESMTP id 4F2A71C0042\tfor <j.martin@rhone-energie.fr>; Tue, 13 Oct 2026 09:14:02 +0200 (CEST)";
const GMAIL =
  "from o1.em.librairie-exemple.fr (o1.em.librairie-exemple.fr. [149.72.120.130]) by mx.google.com with ESMTPS id 5b1f17b1804b1-46f0c2a1d3esi998877f8f.412.2026.10.12.23.02.10 for <claire.dupont@gmail.com> (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128); Mon, 12 Oct 2026 23:02:11 -0700 (PDT)";
const EXCHANGE =
  "from mx01.mta-relay.click (185.234.72.19) by AM4PEPF00027A6C.mail.protection.outlook.com (10.167.16.73) with Microsoft SMTP Server (version=TLS1_3, cipher=TLS_AES_256_GCM_SHA384) id 15.20.8093.1 via Frontend Transport; Tue, 13 Oct 2026 07:14:03 +0000";
const EXIM =
  "from [203.0.113.9] (helo=WIN-8K2) by mail.example.net with esmtpa (Exim 4.96) (envelope-from <a@b.c>) id 1qXyZ-000abc-12; Tue, 13 Oct 2026 07:14:02 +0000";

test("parses a Postfix hop with no reverse DNS", () => {
  const hop = parseReceived(POSTFIX);
  assert.equal(hop.helo, "mail.rhone-energie.fr");
  assert.equal(hop.rdns, null);
  assert.equal(hop.ip, "185.234.72.19");
  assert.equal(hop.ipScope, "public");
  assert.equal(hop.by, "mx01.mta-relay.click");
  assert.equal(hop.protocol, "ESMTP");
  assert.equal(hop.tls, false);
  assert.equal(hop.date?.toISOString(), "2026-10-13T07:14:02.000Z");
  assert.equal(hop.heloMismatch, true);
});

test("parses a Gmail hop whose HELO matches its reverse DNS", () => {
  const hop = parseReceived(GMAIL);
  assert.equal(hop.helo, "o1.em.librairie-exemple.fr");
  assert.equal(hop.rdns, "o1.em.librairie-exemple.fr");
  assert.equal(hop.ip, "149.72.120.130");
  assert.equal(hop.protocol, "ESMTPS");
  assert.equal(hop.tls, true);
  assert.equal(hop.date?.toISOString(), "2026-10-13T06:02:11.000Z");
  assert.equal(hop.heloMismatch, false);
});

test("parses an Exchange Online hop", () => {
  const hop = parseReceived(EXCHANGE);
  assert.equal(hop.helo, "mx01.mta-relay.click");
  assert.equal(hop.ip, "185.234.72.19");
  assert.equal(hop.rdns, null);
  assert.equal(hop.by, "AM4PEPF00027A6C.mail.protection.outlook.com");
  assert.equal(hop.protocol, "Microsoft SMTP Server");
  assert.equal(hop.tls, true);
  assert.equal(hop.heloMismatch, false);
});

test("reads the HELO name from an Exim comment", () => {
  const hop = parseReceived(EXIM);
  assert.equal(hop.helo, "WIN-8K2");
  assert.equal(hop.ip, "203.0.113.9");
  assert.equal(hop.ipScope, "reserved");
});

test("accepts a hop with no from clause", () => {
  const hop = parseReceived("by 2002:a05:7010:4b8e:b0:3d1:5c2a:6b1f with SMTP id f14csp112233mdb; Mon, 12 Oct 2026 23:02:11 -0700 (PDT)");
  assert.equal(hop.helo, null);
  assert.equal(hop.ip, null);
  assert.equal(hop.by, "2002:a05:7010:4b8e:b0:3d1:5c2a:6b1f");
});

test("orders the fixture's chain oldest first with delays", () => {
  const email = parseEmail(readFileSync(new URL("../../../fixtures/spoofed-invoice.eml", import.meta.url)));
  const hops = relayChain(email.headers);
  assert.deepEqual(hops.map((h) => h.index), [1, 2, 3, 4]);
  assert.deepEqual(hops.map((h) => h.delay), [null, 1, 0, 1]);
  assert.equal(hops[0].helo, "mail.rhone-energie.fr");
  assert.equal(hops[3].protocol, "HTTPS");
  assert.deepEqual(routeFindings(hops).map((f) => f.id), ["route.helo-mismatch"]);
});

test("reports a missing chain and backwards clocks", () => {
  assert.deepEqual(routeFindings([]).map((f) => f.id), ["route.no-received"]);
  const hops = relayChain([
    { name: "Received", value: "from b.example by c.example; Tue, 13 Oct 2026 07:00:00 +0000" },
    { name: "Received", value: "from a.example by b.example; Tue, 13 Oct 2026 08:00:00 +0000" },
  ]);
  assert.equal(hops[1].delay, -3600);
  assert.deepEqual(routeFindings(hops).map((f) => f.id), ["route.clock-skew"]);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `date.ts`, `received.ts`.

- [ ] **Step 4: Implement**

```ts file=src/lib/headers/date.ts
import type { Finding } from "../finding.ts";
import type { Hop } from "./received.ts";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Obsolete zone names allowed by RFC 5322 §4.3, in minutes east of UTC. */
const ZONES: Record<string, number> = {
  UT: 0, UTC: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
};

const RFC5322 =
  /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([+-]\d{4}|[A-Za-z]{1,5})?/;
const ISO = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/;

const HOUR = 3_600_000;

/**
 * Leniently parses the date formats found in Date and Received headers:
 * RFC 5322 (optional weekday, 2- or 4-digit year, optional seconds, numeric
 * or named zone, trailing comments) and the ISO-like stamps some relays
 * write. Returns null rather than guessing.
 */
export function parseMailDate(value: string): Date | null {
  const rfc = RFC5322.exec(value);
  if (rfc) {
    const month = MONTHS[rfc[2].toLowerCase()];
    if (month === undefined) return null;
    let year = Number(rfc[3]);
    if (rfc[3].length === 2) year += year < 50 ? 2000 : 1900;
    return build(year, month, Number(rfc[1]), Number(rfc[4]), Number(rfc[5]), Number(rfc[6] ?? 0), zoneOffset(rfc[7]));
  }
  const iso = ISO.exec(value);
  if (iso) {
    return build(
      Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
      Number(iso[4]), Number(iso[5]), Number(iso[6]), zoneOffset(iso[7]),
    );
  }
  return null;
}

function zoneOffset(zone: string | undefined): number {
  if (!zone) return 0;
  const numeric = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
  if (numeric) return (numeric[1] === "-" ? -1 : 1) * (Number(numeric[2]) * 60 + Number(numeric[3]));
  // Unknown names are treated as UTC, as RFC 5322 says for "-0000".
  return ZONES[zone.toUpperCase()] ?? 0;
}

function build(year: number, month: number, day: number, h: number, m: number, s: number, offset: number): Date | null {
  if (day < 1 || day > 31 || h > 23 || m > 59 || s > 60) return null;
  const date = new Date(Date.UTC(year, month, day, h, m, s) - offset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date header anomalies, judged against the relay timestamps. */
export function dateFindings(raw: string | null, hops: readonly Hop[]): Finding[] {
  if (raw === null) {
    return [{
      id: "route.date-missing", category: "route", severity: "low", title: "No Date header",
      explanation: "Every mail client sets a Date header. Its absence points to a script or a hand-made message.",
      evidence: [], weight: 2,
    }];
  }
  const date = parseMailDate(raw);
  if (date === null) {
    return [{
      id: "route.date-unreadable", category: "route", severity: "low", title: "Unreadable Date header",
      explanation: "The Date header is not in any format mail clients write.",
      evidence: [`Date: ${raw}`], weight: 2,
    }];
  }
  const stamps = hops.flatMap((h) => (h.date ? [h.date.getTime()] : []));
  if (stamps.length === 0) return [];
  const first = stamps[0];
  const last = stamps[stamps.length - 1];
  if (date.getTime() > last + 2 * HOUR) {
    return [{
      id: "route.date-future", category: "route", severity: "low", title: "Dated after it was delivered",
      explanation: "The Date header is later than the time the last server received the message. Senders forge dates to keep a message at the top of the inbox.",
      evidence: [`Date: ${raw}`, `Last relay: ${new Date(last).toISOString()}`], weight: 3,
    }];
  }
  if (date.getTime() < first - 7 * 24 * HOUR) {
    return [{
      id: "route.date-old", category: "route", severity: "low", title: "Written long before it was sent",
      explanation: "The Date header is more than a week older than the first relay. Replayed or resent messages look like this.",
      evidence: [`Date: ${raw}`, `First relay: ${new Date(first).toISOString()}`], weight: 2,
    }];
  }
  return [];
}
```

```ts file=src/lib/headers/received.ts
import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeaders } from "../mime/headers.ts";
import { orgDomain } from "../net/domain.ts";
import { ipScope, isIp, type IpScope } from "../net/ip.ts";
import { parseMailDate } from "./date.ts";

export type Hop = {
  /** 1 is the oldest hop, closest to the sender. */
  index: number;
  /** Name the sending host announced (HELO/EHLO), as recorded by the receiver. */
  helo: string | null;
  /** Reverse DNS name the receiver found for the sending IP, when it recorded one. */
  rdns: string | null;
  ip: string | null;
  ipScope: IpScope | null;
  by: string | null;
  protocol: string | null;
  tls: boolean;
  date: Date | null;
  /** Seconds since the previous dated hop; negative means the clocks disagree. */
  delay: number | null;
  /** Public sender whose HELO name has no reverse DNS, or reverse DNS in another organisation. */
  heloMismatch: boolean;
  raw: string;
};

const KEYWORDS = new Set(["from", "by", "via", "with", "id", "for"]);

/** Cuts a Received header (minus its date) into its `from` / `by` / `with`… clauses, ignoring comments. */
function clauses(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let current: string | null = null;
  let buffer = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[A-Za-z]/.test(ch) && (i === 0 || text[i - 1] === " ")) {
      const word = /^[A-Za-z]+/.exec(text.slice(i))?.[0] ?? "";
      const lower = word.toLowerCase();
      const next = text[i + word.length];
      if (KEYWORDS.has(lower) && !(lower in out) && lower !== current && (next === " " || next === undefined)) {
        if (current) out[current] = buffer.trim();
        current = lower;
        buffer = "";
        i += word.length - 1;
        continue;
      }
    }
    buffer += ch;
  }
  if (current) out[current] = buffer.trim();
  return out;
}

type FromClause = { helo: string | null; rdns: string | null; ip: string | null; noRdns: boolean };

function parseFrom(clause: string): FromClause {
  const announced = /^[^\s(]+/.exec(clause)?.[0] ?? null;
  const comments = [...clause.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  let helo = announced;
  let ip: string | null = null;
  let rdns: string | null = null;
  for (const comment of comments) {
    if (ip === null) {
      const bracket = /\[(?:IPv6:)?([0-9A-Fa-f:.]+)\]/.exec(comment);
      const bare = comment.split(/[\s,;]+/).find((token) => isIp(token));
      const found = bracket && isIp(bracket[1]) ? bracket[1] : (bare ?? null);
      if (found) {
        ip = found;
        const before = comment.slice(0, bracket && bracket[1] === found ? bracket.index : comment.indexOf(found));
        const candidate = before.trim().split(/\s+/).pop() ?? "";
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/i.test(candidate)) rdns = candidate.replace(/\.$/, "");
      }
    }
    const heloComment = /\bhelo[=\s]+([^\s)\];]+)/i.exec(comment);
    if (heloComment) helo = heloComment[1];
  }
  if (announced && /^\[.*\]$/.test(announced)) {
    const inner = announced.slice(1, -1).replace(/^IPv6:/i, "");
    if (ip === null && isIp(inner)) ip = inner;
    if (helo === announced) helo = null;
  }
  return {
    helo: helo ? helo.replace(/\.$/, "") : null,
    rdns,
    ip,
    noRdns: comments.some((c) => /^\s*unknown\b/i.test(c)),
  };
}

export function parseReceived(raw: string): Omit<Hop, "index" | "delay"> {
  const value = raw.replace(/\s+/g, " ").trim();
  const semicolon = value.lastIndexOf(";");
  const head = semicolon === -1 ? value : value.slice(0, semicolon);
  // Some relays (SendGrid's filters, for one) write the date without a semicolon.
  const date = parseMailDate(semicolon === -1 ? value : value.slice(semicolon + 1));
  const parts = clauses(head);
  const from: FromClause = parts.from !== undefined
    ? parseFrom(parts.from)
    : { helo: null, rdns: null, ip: null, noRdns: false };
  const scope = from.ip ? ipScope(from.ip) : null;
  const heloMismatch =
    scope === "public" &&
    from.helo !== null &&
    !isIp(from.helo) &&
    (from.noRdns || (from.rdns !== null && orgDomain(from.rdns) !== orgDomain(from.helo)));
  const by = parts.by !== undefined ? (/^[^\s(]+/.exec(parts.by)?.[0] ?? null) : null;
  return {
    helo: from.helo,
    rdns: from.rdns,
    ip: from.ip,
    ipScope: scope,
    by: by ? by.replace(/\.$/, "") : null,
    protocol: parts.with !== undefined ? parts.with.split("(")[0].trim() || null : null,
    tls: /\b(?:E?SMTPSA?|UTF8SMTPSA?|LMTPSA?|HTTPS)\b|TLS/i.test(value),
    date,
    heloMismatch,
    raw,
  };
}

/** The Received chain, oldest hop first. */
export function relayChain(headers: readonly HeaderField[]): Hop[] {
  // Each server prepends its own Received header, so the file reads newest first.
  const raws = getHeaders(headers, "received").reverse();
  let previous: Date | null = null;
  return raws.map((raw, i) => {
    const hop = parseReceived(raw);
    const delay = hop.date && previous ? Math.round((hop.date.getTime() - previous.getTime()) / 1000) : null;
    if (hop.date) previous = hop.date;
    return { ...hop, index: i + 1, delay };
  });
}

export function routeFindings(hops: readonly Hop[]): Finding[] {
  if (hops.length === 0) {
    return [{
      id: "route.no-received", category: "route", severity: "info", title: "No Received headers",
      explanation: "Without Received headers the path the message took cannot be checked. Pasted headers are often incomplete.",
      evidence: [], weight: 0,
    }];
  }
  const findings: Finding[] = [];
  const origin = hops.find((h) => h.ipScope === "public");
  if (origin?.heloMismatch) {
    findings.push({
      id: "route.helo-mismatch", category: "route", severity: "low", title: "Sending server misnames itself",
      explanation: "The first external server introduced itself with a name its IP address does not resolve back to. Legitimate mail servers usually have matching forward and reverse DNS.",
      evidence: [`HELO ${origin.helo}`, `from ${origin.ip} (${origin.rdns ?? "no reverse DNS"})`],
      weight: 4,
    });
  }
  const skewed = hops.filter((h) => h.delay !== null && h.delay < -300);
  if (skewed.length > 0) {
    findings.push({
      id: "route.clock-skew", category: "route", severity: "info", title: "Relay clocks disagree",
      explanation: "At least one server stamped a time earlier than the server before it. Usually a misconfigured clock; inserted Received headers look the same.",
      evidence: skewed.map((h) => `hop ${h.index}: ${h.delay} s`), weight: 0,
    });
  }
  return findings;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/finding.ts src/lib/headers
git commit -m "Rebuild the relay chain from Received headers

Received headers are cut into from/by/with clauses with comments set
aside, which covers Postfix, Exim, Exchange Online and Gmail stamps.
Each hop records the announced HELO name, the reverse DNS and IP the
receiver saw, TLS, and its delay from the previous hop. A public sender
whose HELO has no matching reverse DNS is reported, as are backwards
clocks and Date headers that do not fit the relay times.

Introduces the Finding type every analyser emits."
```

---

### Task 7: Authentication results

**Files:**
- Create: `src/lib/headers/auth.ts`, `src/lib/headers/auth.test.ts`

**Interfaces:**
- Consumes: `getHeader` (Task 3), `sameOrg` (Task 5), `Hop`, `Finding` (Task 6).
- Produces: `AuthEntry = { method; result; reason: string | null; comment: string | null; props: Record<string, string> }`, `AuthSummary = { recordedBy: string | null; source: "Authentication-Results" | "Received-SPF" | null; entries: AuthEntry[] }`, `parseAuthResults(value): { authservId: string | null; entries: AuthEntry[] }`, `parseReceivedSpf(value): AuthEntry`, `authSummary(headers, hops): AuthSummary`, `isFailing(entry): boolean`, `entryDetails(entry): string`, `authFindings(summary, fromDomain: string | null, orgDomains: readonly string[]): Finding[]`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/headers/auth.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { authFindings, authSummary, isFailing, parseAuthResults, parseReceivedSpf, type AuthSummary } from "./auth.ts";
import { relayChain } from "./received.ts";

const MICROSOFT =
  "spf=fail (sender IP is 185.234.72.19) smtp.mailfrom=mta-relay.click; dkim=none (message not signed) header.d=none;dmarc=fail action=quarantine header.from=rhone-energie.fr;compauth=fail reason=000";
const GMAIL =
  'mx.google.com; dkim=pass header.i=@librairie-exemple.fr header.s=s1 header.b=Xy12abCd; spf=pass (google.com: domain of bounce+4471@em.librairie-exemple.fr designates 149.72.120.130 as permitted sender) smtp.mailfrom="bounce+4471@em.librairie-exemple.fr"; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=librairie-exemple.fr';

test("parses Microsoft's results, which have no authserv-id", () => {
  const { authservId, entries } = parseAuthResults(MICROSOFT);
  assert.equal(authservId, null);
  assert.deepEqual(entries.map((e) => [e.method, e.result]), [
    ["spf", "fail"], ["dkim", "none"], ["dmarc", "fail"], ["compauth", "fail"],
  ]);
  assert.equal(entries[0].comment, "sender IP is 185.234.72.19");
  assert.deepEqual(entries[2].props, { action: "quarantine", "header.from": "rhone-energie.fr" });
  assert.equal(entries[3].reason, "000");
});

test("parses Gmail's results with an authserv-id and quoted values", () => {
  const { authservId, entries } = parseAuthResults(GMAIL);
  assert.equal(authservId, "mx.google.com");
  assert.equal(entries[1].props["smtp.mailfrom"], "bounce+4471@em.librairie-exemple.fr");
  assert.equal(entries[2].comment, "p=QUARANTINE sp=QUARANTINE dis=NONE");
});

test("handles ARC instances, 'none' and quoted reasons", () => {
  assert.equal(parseAuthResults("i=1; mx.google.com; dkim=pass header.d=a.com").authservId, "mx.google.com");
  assert.deepEqual(parseAuthResults("mx.example.com; none").entries, []);
  const [entry] = parseAuthResults('mx.example.com; dkim=fail reason="signature verification failed" header.d=example.com').entries;
  assert.equal(entry.reason, "signature verification failed");
});

test("parses Received-SPF", () => {
  const entry = parseReceivedSpf(
    "Fail (protection.outlook.com: domain of mta-relay.click does not designate 185.234.72.19 as permitted sender) receiver=protection.outlook.com; client-ip=185.234.72.19; helo=mx01.mta-relay.click;",
  );
  assert.equal(entry.method, "spf");
  assert.equal(entry.result, "fail");
  assert.equal(entry.props["client-ip"], "185.234.72.19");
});

test("summarises the topmost Authentication-Results, recorded by the last hop", () => {
  const headers: HeaderField[] = [
    { name: "Received", value: "from x by mbx.contoso.com; Tue, 13 Oct 2026 07:14:04 +0000" },
    { name: "Authentication-Results", value: MICROSOFT },
    { name: "Authentication-Results", value: "forged.example; dmarc=pass header.from=rhone-energie.fr" },
  ];
  const summary = authSummary(headers, relayChain(headers));
  assert.equal(summary.source, "Authentication-Results");
  assert.equal(summary.recordedBy, "mbx.contoso.com");
  assert.equal(summary.entries.find((e) => e.method === "dmarc")?.result, "fail");
});

test("falls back to Received-SPF, then to nothing", () => {
  const spfOnly = authSummary([{ name: "Received-SPF", value: "Pass (x) client-ip=1.2.3.4;" }], []);
  assert.equal(spfOnly.source, "Received-SPF");
  assert.equal(authSummary([], []).entries.length, 0);
});

test("knows which results count as failures", () => {
  const entry = (method: string, result: string) => ({ method, result, reason: null, comment: null, props: {} });
  assert.ok(isFailing(entry("dkim", "none")));
  assert.ok(isFailing(entry("spf", "softfail")));
  assert.ok(!isFailing(entry("spf", "pass")));
  assert.ok(!isFailing(entry("spf", "temperror")));
});

const summaryOf = (value: string): AuthSummary => ({
  recordedBy: null, source: "Authentication-Results", entries: parseAuthResults(value).entries,
});

test("reports a DMARC failure once, heavier on the organisation's own domain", () => {
  const own = authFindings(summaryOf(MICROSOFT), "rhone-energie.fr", ["rhone-energie.fr"]);
  assert.deepEqual(own.map((f) => [f.id, f.severity, f.weight]), [["auth.dmarc-fail", "high", 25]]);
  assert.match(own[0].title, /your own domain/);
  assert.ok(own[0].evidence.includes("dmarc=fail action=quarantine header.from=rhone-energie.fr"));
  const other = authFindings(summaryOf(MICROSOFT), "rhone-energie.fr", []);
  assert.equal(other[0].weight, 18);
});

test("reports SPF, DKIM and compauth failures when DMARC did not fail", () => {
  assert.deepEqual(authFindings(summaryOf("mx; spf=softfail smtp.mailfrom=a.com"), null, []).map((f) => f.id), ["auth.spf-softfail"]);
  assert.deepEqual(
    authFindings(summaryOf("mx; spf=fail smtp.mailfrom=a.com; dkim=fail header.d=a.com; compauth=fail reason=001"), null, []).map((f) => f.id),
    ["auth.spf-fail", "auth.dkim-fail", "auth.compauth-fail"],
  );
});

test("is silent when everything passes and informative when nothing was recorded", () => {
  assert.deepEqual(authFindings(summaryOf(GMAIL), "librairie-exemple.fr", []), []);
  assert.deepEqual(authFindings({ recordedBy: null, source: null, entries: [] }, null, []).map((f) => f.id), ["auth.missing"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `auth.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/headers/auth.ts
import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeader } from "../mime/headers.ts";
import { sameOrg } from "../net/domain.ts";
import type { Hop } from "./received.ts";

export type AuthEntry = {
  /** spf, dkim, dmarc, compauth, arc… lowercased. */
  method: string;
  /** pass, fail, softfail, none… lowercased. */
  result: string;
  reason: string | null;
  comment: string | null;
  /** `smtp.mailfrom`, `header.from`, `header.d`, `action`… */
  props: Record<string, string>;
};

export type AuthSummary = {
  /** The server whose verdict this is. */
  recordedBy: string | null;
  source: "Authentication-Results" | "Received-SPF" | null;
  entries: AuthEntry[];
};

/** Splits on separator characters outside double quotes and parentheses. */
function splitTopLevel(input: string, isSeparator: (ch: string) => boolean): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const ch of input) {
    if (ch === '"' && depth === 0) quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && isSeparator(ch)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Removes top-level comments, returning them separately. */
function stripComments(input: string): { text: string; comments: string[] } {
  let text = "";
  let comment = "";
  const comments: string[] = [];
  let depth = 0;
  let quoted = false;
  for (const ch of input) {
    if (depth === 0 && ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") {
      if (depth > 0) comment += ch;
      depth++;
      continue;
    }
    if (!quoted && ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        comments.push(comment.trim());
        comment = "";
        text += " ";
      } else {
        comment += ch;
      }
      continue;
    }
    if (depth > 0) comment += ch;
    else text += ch;
  }
  return { text, comments };
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function splitPair(token: string): [string, string] {
  const eq = token.indexOf("=");
  return [token.slice(0, eq).trim().toLowerCase(), unquote(token.slice(eq + 1).trim())];
}

/** Authentication-Results (RFC 8601) and ARC-Authentication-Results. */
export function parseAuthResults(value: string): { authservId: string | null; entries: AuthEntry[] } {
  const body = value.replace(/^\s*i=\d+\s*;/, "");
  const segments = splitTopLevel(body, (ch) => ch === ";");
  let authservId: string | null = null;
  if (segments.length > 0) {
    const first = stripComments(segments[0]).text.trim().split(/\s+/)[0] ?? "";
    // Microsoft omits the authserv-id and starts straight with "spf=…".
    if (!first.includes("=")) {
      authservId = first || null;
      segments.shift();
    }
  }
  const entries: AuthEntry[] = [];
  for (const segment of segments) {
    const { text, comments } = stripComments(segment);
    const tokens = splitTopLevel(text, (ch) => /\s/.test(ch));
    const head = tokens.shift();
    if (!head || !head.includes("=")) continue;
    const [method, result] = splitPair(head);
    const props: Record<string, string> = {};
    let reason: string | null = null;
    for (const token of tokens) {
      if (!token.includes("=")) continue;
      const [key, val] = splitPair(token);
      if (key === "reason") reason = val;
      else props[key] = val;
    }
    entries.push({ method, result: result.toLowerCase(), reason, comment: comments.join(" ") || null, props });
  }
  return { authservId, entries };
}

export function parseReceivedSpf(value: string): AuthEntry {
  const { text, comments } = stripComments(value);
  const [word = "", ...rest] = text.trim().split(/\s+/);
  const props: Record<string, string> = {};
  for (const part of splitTopLevel(rest.join(" "), (ch) => ch === ";")) {
    if (part.includes("=")) {
      const [key, val] = splitPair(part);
      props[key] = val;
    }
  }
  return { method: "spf", result: word.toLowerCase(), reason: null, comment: comments.join(" ") || null, props };
}

/**
 * The verdict that counts is the one written by the receiving server: the
 * topmost Authentication-Results. Lower ones, and every ARC copy, were
 * written further upstream and may come from the sender itself.
 */
export function authSummary(headers: readonly HeaderField[], hops: readonly Hop[]): AuthSummary {
  const lastBy = hops.at(-1)?.by ?? null;
  const top = getHeader(headers, "authentication-results");
  if (top !== null) {
    const parsed = parseAuthResults(top);
    return { recordedBy: parsed.authservId ?? lastBy, source: "Authentication-Results", entries: parsed.entries };
  }
  const spf = getHeader(headers, "received-spf");
  if (spf !== null) return { recordedBy: lastBy, source: "Received-SPF", entries: [parseReceivedSpf(spf)] };
  return { recordedBy: null, source: null, entries: [] };
}

const FAILING = new Set(["fail", "softfail", "permerror", "hardfail"]);

export function isFailing(entry: AuthEntry): boolean {
  return FAILING.has(entry.result) || (entry.result === "none" && ["spf", "dkim", "dmarc"].includes(entry.method));
}

/** `key=value` properties plus the reason, for display and evidence. */
export function entryDetails(entry: AuthEntry): string {
  const parts = Object.entries(entry.props).map(([key, value]) => `${key}=${value}`);
  if (entry.reason) parts.push(`reason=${entry.reason}`);
  return parts.join(" ");
}

function evidenceLine(entry: AuthEntry): string {
  return `${entry.method}=${entry.result} ${entryDetails(entry)}`.trim();
}

export function authFindings(summary: AuthSummary, fromDomain: string | null, orgDomains: readonly string[]): Finding[] {
  if (summary.entries.length === 0) {
    return [{
      id: "auth.missing", category: "auth", severity: "info", title: "No authentication results",
      explanation: "No receiving server recorded SPF, DKIM or DMARC results in these headers, so the sender's identity was not checked here.",
      evidence: [], weight: 0,
    }];
  }
  const first = (method: string) => summary.entries.find((e) => e.method === method);
  const dmarc = first("dmarc");
  const spf = first("spf");
  const compauth = first("compauth");
  const dkims = summary.entries.filter((e) => e.method === "dkim");

  if (dmarc?.result === "fail") {
    const domain = dmarc.props["header.from"] ?? fromDomain;
    const own = domain !== null && orgDomains.some((d) => sameOrg(d, domain));
    return [{
      id: "auth.dmarc-fail", category: "auth", severity: "high",
      title: own ? "Sender authentication failed for your own domain" : `DMARC failed for ${domain ?? "the sender's domain"}`,
      explanation:
        `The receiving server checked ${domain ?? "the From domain"} against its DMARC policy and the message failed: neither SPF nor DKIM proved it came from that domain.` +
        (own ? " The From address claims to be your organisation, which is the classic spoofing setup." : ""),
      evidence: [dmarc, spf, ...dkims, compauth].filter((e): e is AuthEntry => e !== undefined).map(evidenceLine),
      weight: own ? 25 : 18,
    }];
  }

  const findings: Finding[] = [];
  if (spf && (spf.result === "fail" || spf.result === "softfail")) {
    const hard = spf.result === "fail";
    findings.push({
      id: `auth.spf-${spf.result}`, category: "auth", severity: hard ? "medium" : "low",
      title: hard ? "SPF failed" : "SPF soft-failed",
      explanation: "The server that delivered the message is not on the list of servers allowed to send for the envelope sender's domain.",
      evidence: [evidenceLine(spf)], weight: hard ? 10 : 4,
    });
  }
  const broken = dkims.filter((e) => e.result === "fail" || e.result === "permerror");
  if (broken.length > 0) {
    findings.push({
      id: "auth.dkim-fail", category: "auth", severity: "medium", title: "DKIM signature did not verify",
      explanation: "The message was signed, but the signature no longer matches: it was altered after signing, or the signature is forged.",
      evidence: broken.map(evidenceLine), weight: 8,
    });
  }
  if (compauth?.result === "fail") {
    findings.push({
      id: "auth.compauth-fail", category: "auth", severity: "medium", title: "Microsoft composite authentication failed",
      explanation: "Microsoft 365 combined SPF, DKIM, DMARC and its own signals and could not confirm the sender.",
      evidence: [evidenceLine(compauth)], weight: 10,
    });
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/headers
git commit -m "Read SPF, DKIM and DMARC as recorded by the receiving server

Authentication-Results is parsed per RFC 8601, including Microsoft's
variant without an authserv-id, ARC copies and quoted values, with
Received-SPF as a fallback. Only the topmost result is trusted: lower
ones were written upstream and may come from the sender.

A DMARC failure is reported once, with SPF and DKIM as its evidence, and
weighs more when the From domain is the organisation's own."
```

---

### Task 8: Sender consistency and display-name spoofing

**Files:**
- Create: `src/lib/headers/sender.ts`, `src/lib/headers/sender.test.ts`

**Interfaces:**
- Consumes: `parseAddressList`, `Address` (Task 5), `getHeader`, `getHeaders` (Task 3), `orgDomain`, `sameOrg`, `isFreeMail`, `BRANDS` (Task 5), `Finding` (Task 6).
- Produces: `SenderRow = { header: "From" | "Sender" | "Reply-To" | "Return-Path" | "Message-ID"; value: string; domain: string | null; matchesFrom: boolean | null; freeMail: boolean }`, `SenderInfo = { from: Address | null; fromCount: number; rows: SenderRow[] }`, `senderInfo(headers): SenderInfo`, `senderFindings(info, orgDomains): Finding[]`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/headers/sender.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { senderFindings, senderInfo } from "./sender.ts";

const headers = (lines: Record<string, string>): HeaderField[] =>
  Object.entries(lines).map(([name, value]) => ({ name, value }));

const SPOOF = headers({
  "Return-Path": "bounce-7f3a@mta-relay.click",
  From: "=?utf-8?Q?Rh=C3=B4ne_=C3=89nergie?= <facturation@rhone-energie.fr>",
  "Reply-To": "<rhone.energie.paiement@outlook.fr>",
  "Message-ID": "<20261013071401.4471@mta-relay.click>",
});

test("lists every sender-related header against the From domain", () => {
  const info = senderInfo(SPOOF);
  assert.equal(info.from?.name, "Rhône Énergie");
  assert.deepEqual(
    info.rows.map((r) => [r.header, r.domain, r.matchesFrom, r.freeMail]),
    [
      ["From", "rhone-energie.fr", null, false],
      ["Reply-To", "outlook.fr", false, true],
      ["Return-Path", "mta-relay.click", false, false],
      ["Message-ID", "mta-relay.click", false, false],
    ],
  );
});

test("treats subdomains of the From organisation as consistent", () => {
  const info = senderInfo(headers({ From: "lettre@librairie-exemple.fr", "Return-Path": "<bounce+1@em.librairie-exemple.fr>" }));
  assert.equal(info.rows[1].matchesFrom, true);
});

test("shows a null Return-Path as is", () => {
  const info = senderInfo(headers({ From: "a@b.com", "Return-Path": "<>" }));
  assert.deepEqual(info.rows[1], { header: "Return-Path", value: "<>", domain: null, matchesFrom: null, freeMail: false });
});

test("flags replies diverted to another domain, mentioning free mail", () => {
  const findings = senderFindings(senderInfo(SPOOF), []);
  assert.deepEqual(findings.map((f) => f.id), ["sender.reply-to-mismatch"]);
  assert.match(findings[0].explanation, /outlook\.fr/);
  assert.match(findings[0].explanation, /free webmail/);
});

test("flags a display name that shows another address", () => {
  const findings = senderFindings(senderInfo(headers({ From: '"ceo@rhone-energie.fr" <boss@evil.top>' })), []);
  assert.deepEqual(findings.map((f) => [f.id, f.severity]), [["sender.display-name-address", "high"]]);
});

test("flags brand impersonation, not the brand itself", () => {
  const fake = senderFindings(senderInfo(headers({ From: '"Microsoft 365 Security" <alert@m365-secure.top>' })), []);
  assert.deepEqual(fake.map((f) => f.id), ["sender.brand-impersonation"]);
  assert.match(fake[0].title, /Microsoft/);
  const real = senderFindings(senderInfo(headers({ From: "Microsoft <no-reply@email.microsoft.com>" })), []);
  assert.deepEqual(real, []);
});

test("flags a display name imitating the organisation", () => {
  const info = senderInfo(headers({ From: '"Rhône Énergie Facturation" <billing@rhone-energie-paiement.com>' }));
  assert.deepEqual(senderFindings(info, ["rhone-energie.fr"]).map((f) => f.id), ["sender.org-impersonation"]);
  assert.deepEqual(senderFindings(info, []), []);
});

test("flags missing or multiple From addresses", () => {
  assert.deepEqual(senderFindings(senderInfo(headers({ Subject: "x" })), []).map((f) => f.id), ["sender.no-from"]);
  assert.deepEqual(senderFindings(senderInfo(headers({ From: "a@x.com, b@y.com" })), []).map((f) => f.id), ["sender.multiple-from"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `sender.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/headers/sender.ts
import { BRANDS } from "../data/brands.ts";
import { isFreeMail } from "../data/freemail.ts";
import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { parseAddressList, type Address } from "../mime/address.ts";
import { getHeader, getHeaders } from "../mime/headers.ts";
import { orgDomain, sameOrg } from "../net/domain.ts";

export type SenderRow = {
  header: "From" | "Sender" | "Reply-To" | "Return-Path" | "Message-ID";
  value: string;
  domain: string | null;
  /** Same organisation as the From domain; null for From itself or when unknown. */
  matchesFrom: boolean | null;
  freeMail: boolean;
};

export type SenderInfo = { from: Address | null; fromCount: number; rows: SenderRow[] };

export function senderInfo(headers: readonly HeaderField[]): SenderInfo {
  const fromList = getHeaders(headers, "from").flatMap(parseAddressList);
  const from = fromList[0] ?? null;
  const row = (header: SenderRow["header"], value: string, domain: string | null): SenderRow => ({
    header,
    value,
    domain,
    matchesFrom: header === "From" || domain === null || from === null ? null : sameOrg(domain, from.domain),
    freeMail: domain !== null && isFreeMail(domain),
  });

  const rows = fromList.map((a) => row("From", a.address, a.domain));
  for (const a of parseAddressList(getHeader(headers, "sender") ?? "")) rows.push(row("Sender", a.address, a.domain));
  for (const a of getHeaders(headers, "reply-to").flatMap(parseAddressList)) rows.push(row("Reply-To", a.address, a.domain));
  const returnPath = getHeader(headers, "return-path");
  if (returnPath !== null) {
    const [a] = parseAddressList(returnPath);
    rows.push(row("Return-Path", a ? a.address : returnPath.trim(), a ? a.domain : null));
  }
  const messageId = getHeader(headers, "message-id");
  if (messageId !== null) {
    const domain = /@([^>\s]+)>?\s*$/.exec(messageId.trim());
    rows.push(row("Message-ID", messageId.trim(), domain ? domain[1].toLowerCase() : null));
  }
  return { from, fromCount: fromList.length, rows };
}

function normaliseName(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function senderFindings(info: SenderInfo, orgDomains: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const fromValues = info.rows.filter((r) => r.header === "From").map((r) => `From: ${r.value}`);

  if (info.fromCount === 0) {
    findings.push({
      id: "sender.no-from", category: "sender", severity: "medium", title: "No usable From address",
      explanation: "The From header is missing or unreadable, so the message does not say who sent it.",
      evidence: [], weight: 6,
    });
  } else if (info.fromCount > 1) {
    findings.push({
      id: "sender.multiple-from", category: "sender", severity: "medium", title: "Several From addresses",
      explanation: "Mail clients show only one of them, and which one depends on the client.",
      evidence: fromValues, weight: 6,
    });
  }

  const diverted = info.rows.filter((r) => r.header === "Reply-To" && r.matchesFrom === false);
  if (diverted.length > 0) {
    const domains = [...new Set(diverted.map((r) => r.domain))].join(", ");
    findings.push({
      id: "sender.reply-to-mismatch", category: "sender", severity: "medium", title: "Replies go to a different domain",
      explanation:
        `Answering this email sends the reply to ${domains}, not to the sender shown` +
        (diverted.some((r) => r.freeMail) ? ", and to a free webmail address." : "."),
      evidence: diverted.map((r) => `Reply-To: ${r.value}`), weight: 8,
    });
  }

  const from = info.from;
  if (from && from.name) {
    const evidence = [`From: ${from.name} <${from.address}>`];
    const shown = /[^\s<>"@]+@([^\s<>"@]+\.[^\s<>"@]+)/.exec(from.name);
    if (shown && !sameOrg(shown[1], from.domain)) {
      findings.push({
        id: "sender.display-name-address", category: "sender", severity: "high", title: "Display name shows another address",
        explanation: "Many mail clients only show the display name, so the reader sees an address this message did not come from.",
        evidence, weight: 15,
      });
    }
    const brand = BRANDS.find((b) => b.pattern.test(from.name) && !b.domains.some((d) => sameOrg(d, from.domain)));
    if (brand) {
      findings.push({
        id: "sender.brand-impersonation", category: "sender", severity: "medium", title: `Display name invokes ${brand.name}`,
        explanation: `The sender calls itself ${brand.name} but writes from ${from.domain}, which is not one of ${brand.name}'s domains.`,
        evidence, weight: 10,
      });
    }
    const name = normaliseName(from.name);
    const imitated = orgDomains.find((d) => {
      const label = normaliseName(orgDomain(d).split(".")[0]);
      return label.length >= 4 && name.includes(label) && !sameOrg(d, from.domain);
    });
    if (imitated) {
      findings.push({
        id: "sender.org-impersonation", category: "sender", severity: "medium", title: "Display name imitates your organisation",
        explanation: `The display name looks like ${imitated}, but the address is at ${from.domain}.`,
        evidence, weight: 10,
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/headers
git commit -m "Check sender consistency and display-name spoofing

From, Sender, Reply-To, Return-Path and Message-ID are compared by
organisation, so a bounce subdomain of the sender stays consistent. A
Reply-To in another domain is reported (and called out when it is free
webmail), as are display names that show another address, invoke a
well-known brand from a foreign domain, or imitate the organisation's
own name."
```

---

### Task 9: Gateway verdict decoders

**Files:**
- Create: `src/lib/headers/vendors.ts`, `src/lib/headers/vendors.test.ts`

**Interfaces:**
- Consumes: `getHeader` (Task 3), `Finding` (Task 6).
- Produces: `VendorField = { key; value; meaning: string | null; flagged: boolean }`, `VendorVerdict = { vendor: string; verdict: "phishing" | "malware" | "spam" | "bulk" | "clean" | null; fields: VendorField[] }`, `vendorVerdicts(headers): VendorVerdict[]`, `vendorFindings(verdicts): Finding[]`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/headers/vendors.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HeaderField } from "../email.ts";
import { vendorFindings, vendorVerdicts } from "./vendors.ts";

const headers = (lines: Record<string, string>): HeaderField[] =>
  Object.entries(lines).map(([name, value]) => ({ name, value }));

const FOREFRONT =
  "CIP:185.234.72.19;CTRY:NL;LANG:fr;SCL:9;SRV:;IPV:NLI;SFV:SPM;H:mx01.mta-relay.click;PTR:InfoNoRecords;CAT:PHSH;SFS:(13230040)(4636009)(376014);DIR:INB;";

test("decodes Microsoft's anti-spam report", () => {
  const [ms] = vendorVerdicts(headers({
    "X-Forefront-Antispam-Report": FOREFRONT,
    "X-Microsoft-Antispam": "BCL:0;ARA:13230040|4636009|376014;",
  }));
  assert.equal(ms.vendor, "Microsoft 365");
  assert.equal(ms.verdict, "phishing");
  const field = (key: string) => ms.fields.find((f) => f.key === key);
  assert.deepEqual(field("CAT"), { key: "CAT", value: "PHSH", meaning: "Phishing", flagged: true });
  assert.deepEqual(field("SFV"), { key: "SFV", value: "SPM", meaning: "Spam", flagged: true });
  assert.equal(field("SCL")?.flagged, true);
  assert.equal(field("BCL")?.flagged, false);
  assert.equal(field("PTR")?.meaning, "No reverse DNS");
  assert.equal(field("CTRY")?.value, "NL");
  assert.equal(field("SRV"), undefined);
});

test("reads a clean Microsoft verdict and stays silent about it", () => {
  const verdicts = vendorVerdicts(headers({ "X-Forefront-Antispam-Report": "SFV:NSPM;CAT:NONE;SCL:1;" }));
  assert.equal(verdicts[0].verdict, "clean");
  assert.deepEqual(vendorFindings(verdicts), []);
});

test("decodes Proofpoint", () => {
  const clean = vendorVerdicts(headers({ "X-Proofpoint-Spam-Details": "rule=notspam policy=default score=0 phishscore=0 malwarescore=0 spamscore=0 bulkscore=0" }));
  assert.equal(clean[0].verdict, "clean");
  const phish = vendorVerdicts(headers({ "X-Proofpoint-Spam-Details": "rule=phish policy=default score=97 phishscore=97" }));
  assert.equal(phish[0].verdict, "phishing");
  assert.ok(phish[0].fields.find((f) => f.key === "phishscore")?.flagged);
});

test("decodes Mimecast impersonation protection", () => {
  const [mc] = vendorVerdicts(headers({
    "X-Mimecast-Impersonation-Protect": "Policy=CLT - Impersonation Protection Definition;Similar Internal Domain=true;Newly Observed Domain=false;Reply-to Address Mismatch=true",
  }));
  assert.equal(mc.verdict, "phishing");
  assert.deepEqual(mc.fields.filter((f) => f.flagged).map((f) => f.key), ["Similar Internal Domain", "Reply-to Address Mismatch"]);
});

test("decodes Gmail and SpamAssassin markers", () => {
  assert.equal(vendorVerdicts(headers({ "X-Gm-Phishy": "1", "X-Gm-Spam": "0" }))[0].verdict, "phishing");
  const [sa] = vendorVerdicts(headers({ "X-Spam-Status": "Yes, score=7.2 required=5.0 tests=BAYES_99,URIBL_BLACK" }));
  assert.equal(sa.vendor, "SpamAssassin");
  assert.equal(sa.verdict, "spam");
  assert.equal(sa.fields.find((f) => f.key === "score")?.value, "7.2");
});

test("returns nothing when no gateway left a verdict", () => {
  assert.deepEqual(vendorVerdicts(headers({ Subject: "x" })), []);
});

test("turns verdicts into findings", () => {
  const findings = vendorFindings(vendorVerdicts(headers({ "X-Forefront-Antispam-Report": FOREFRONT })));
  assert.deepEqual(findings.map((f) => [f.id, f.severity, f.weight]), [["vendor.microsoft-365", "high", 15]]);
  assert.ok(findings[0].evidence.includes("CAT: PHSH (Phishing)"));
  const bulk = vendorFindings(vendorVerdicts(headers({ "X-Forefront-Antispam-Report": "SFV:NSPM;CAT:BULK;" })));
  assert.equal(bulk[0].severity, "info");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `vendors.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/headers/vendors.ts
import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeader } from "../mime/headers.ts";

export type VendorField = { key: string; value: string; meaning: string | null; flagged: boolean };

export type VendorVerdict = {
  vendor: string;
  verdict: "phishing" | "malware" | "spam" | "bulk" | "clean" | null;
  fields: VendorField[];
};

const SFV: Record<string, string> = {
  BLK: "Blocked: sender on the user's blocked list",
  NSPM: "Not spam",
  SFE: "Allowed: sender on the user's safe list",
  SKA: "Allowed by an anti-spam policy",
  SKB: "Blocked by an anti-spam policy",
  SKI: "Internal message, filtering skipped",
  SKN: "Marked not spam by a mail flow rule",
  SKQ: "Released from quarantine",
  SKS: "Marked spam by a mail flow rule",
  SPM: "Spam",
};

const CAT: Record<string, string> = {
  AMP: "Malware (anti-malware)",
  BIMP: "Brand impersonation",
  BULK: "Bulk",
  DIMP: "Domain impersonation",
  FTBP: "Blocked file type",
  GIMP: "Mailbox-intelligence impersonation",
  HPHSH: "High-confidence phishing",
  HPHISH: "High-confidence phishing",
  HSPM: "High-confidence spam",
  INTOS: "Internal phishing",
  MALW: "Malware",
  OSPM: "Outbound spam",
  PHSH: "Phishing",
  SAP: "Safe Attachments",
  SPM: "Spam",
  SPOOF: "Spoofing",
  UIMP: "User impersonation",
  NONE: "No category",
};

const IPV: Record<string, string> = { CAL: "IP allowed by the connection filter", NLI: "IP not on any reputation list" };
const DIR: Record<string, string> = { INB: "Inbound", OUT: "Outbound", INT: "Internal" };
const SFTY: Record<string, string> = { "9.19": "domain impersonation", "9.20": "user impersonation" };
const PHISH_CATS = new Set(["PHSH", "HPHSH", "HPHISH", "SPOOF", "DIMP", "UIMP", "GIMP", "BIMP", "INTOS"]);
const MALWARE_CATS = new Set(["MALW", "AMP", "FTBP", "SAP"]);

function colonPairs(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of value.split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) map.set(part.slice(0, colon).trim().toUpperCase(), part.slice(colon + 1).trim());
  }
  return map;
}

function sclMeaning(scl: number): string {
  if (scl === -1) return "Filtering skipped";
  if (scl <= 1) return "Not spam";
  if (scl <= 6) return "Spam";
  return "High-confidence spam";
}

function bclMeaning(bcl: number): string {
  if (bcl === 0) return "Not bulk";
  if (bcl <= 3) return "Bulk, few complaints";
  if (bcl <= 7) return "Bulk, some complaints";
  return "Bulk, many complaints";
}

function microsoft(headers: readonly HeaderField[]): VendorVerdict | null {
  const report = getHeader(headers, "x-forefront-antispam-report");
  const orgScl = getHeader(headers, "x-ms-exchange-organization-scl");
  const antispam = getHeader(headers, "x-microsoft-antispam");
  const pcl = getHeader(headers, "x-ms-exchange-organization-pcl")?.trim();
  if (report === null && orgScl === null && antispam === null) return null;

  const f = colonPairs(report ?? "");
  const fields: VendorField[] = [];
  const add = (key: string, value: string | undefined, meaning: string | null, flagged: boolean) => {
    if (value) fields.push({ key, value, meaning, flagged });
  };
  const sfv = f.get("SFV");
  const cat = f.get("CAT");
  const scl = f.get("SCL") ?? orgScl?.trim();
  const bcl = colonPairs(antispam ?? "").get("BCL");
  const ptr = f.get("PTR");
  const sfty = f.get("SFTY");
  add("SFV", sfv, sfv ? (SFV[sfv] ?? null) : null, sfv !== undefined && ["SPM", "SKS", "BLK", "SKB"].includes(sfv));
  add("CAT", cat, cat ? (CAT[cat] ?? null) : null, cat !== undefined && cat !== "NONE");
  add("SCL", scl, scl ? sclMeaning(Number(scl)) : null, Number(scl) >= 5);
  add("BCL", bcl, bcl ? bclMeaning(Number(bcl)) : null, Number(bcl) >= 8);
  add("PCL", pcl, pcl ? (Number(pcl) >= 4 ? "Likely phishing" : "Unlikely phishing") : null, Number(pcl) >= 4);
  add("IPV", f.get("IPV"), IPV[f.get("IPV") ?? ""] ?? null, false);
  add("CTRY", f.get("CTRY"), "Country of the connecting IP", false);
  add("CIP", f.get("CIP"), "Connecting IP", false);
  add("PTR", ptr, ptr === "InfoNoRecords" ? "No reverse DNS" : "Reverse DNS of the connecting IP", ptr === "InfoNoRecords");
  add("LANG", f.get("LANG"), "Detected language", false);
  add("DIR", f.get("DIR"), DIR[f.get("DIR") ?? ""] ?? null, false);
  add("SFTY", sfty, sfty ? `Safety tip${SFTY[sfty] ? `: ${SFTY[sfty]}` : ""}` : null, sfty !== undefined);

  let verdict: VendorVerdict["verdict"] = null;
  if (cat && PHISH_CATS.has(cat)) verdict = "phishing";
  else if (cat && MALWARE_CATS.has(cat)) verdict = "malware";
  else if (cat === "SPM" || cat === "HSPM" || sfv === "SPM" || Number(scl) >= 5) verdict = "spam";
  else if (cat === "BULK" || Number(bcl) >= 7) verdict = "bulk";
  else if (sfv === "NSPM" || cat === "NONE") verdict = "clean";
  return { vendor: "Microsoft 365", verdict, fields };
}

function proofpoint(headers: readonly HeaderField[]): VendorVerdict | null {
  const details = getHeader(headers, "x-proofpoint-spam-details");
  if (details === null) return null;
  const pairs = new Map<string, string>();
  for (const token of details.trim().split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq > 0) pairs.set(token.slice(0, eq).toLowerCase(), token.slice(eq + 1));
  }
  const fields: VendorField[] = [];
  const rule = pairs.get("rule");
  if (rule) fields.push({ key: "rule", value: rule, meaning: "Matched rule", flagged: rule !== "notspam" });
  for (const key of ["phishscore", "malwarescore", "spamscore", "bulkscore", "suspectscore"]) {
    const value = pairs.get(key);
    if (value !== undefined) fields.push({ key, value, meaning: "0–100", flagged: Number(value) >= 50 });
  }
  const r = (rule ?? "").toLowerCase();
  let verdict: VendorVerdict["verdict"] = null;
  if (r.includes("phish") || Number(pairs.get("phishscore")) >= 50) verdict = "phishing";
  else if (r.includes("malware") || Number(pairs.get("malwarescore")) >= 50) verdict = "malware";
  else if (r === "notspam") verdict = "clean";
  else if (r.includes("bulk")) verdict = "bulk";
  else if (r.includes("spam")) verdict = "spam";
  return { vendor: "Proofpoint", verdict, fields };
}

function mimecast(headers: readonly HeaderField[]): VendorVerdict | null {
  const score = getHeader(headers, "x-mimecast-spam-score");
  const impersonation = getHeader(headers, "x-mimecast-impersonation-protect");
  if (score === null && impersonation === null) return null;
  const fields: VendorField[] = [];
  if (score !== null) fields.push({ key: "Spam score", value: score.trim(), meaning: null, flagged: false });
  for (const part of (impersonation ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    fields.push({ key, value, meaning: null, flagged: value.toLowerCase() === "true" });
  }
  return { vendor: "Mimecast", verdict: fields.some((f) => f.flagged) ? "phishing" : null, fields };
}

function google(headers: readonly HeaderField[]): VendorVerdict | null {
  const phishy = getHeader(headers, "x-gm-phishy")?.trim();
  const spam = getHeader(headers, "x-gm-spam")?.trim();
  if (phishy === undefined && spam === undefined) return null;
  const fields: VendorField[] = [];
  if (phishy !== undefined) fields.push({ key: "X-Gm-Phishy", value: phishy, meaning: "Gmail phishing flag", flagged: phishy === "1" });
  if (spam !== undefined) fields.push({ key: "X-Gm-Spam", value: spam, meaning: "Gmail spam flag", flagged: spam === "1" });
  const verdict = phishy === "1" ? "phishing" : spam === "1" ? "spam" : "clean";
  return { vendor: "Gmail", verdict, fields };
}

function spamAssassin(headers: readonly HeaderField[]): VendorVerdict | null {
  const status = getHeader(headers, "x-spam-status");
  const flag = getHeader(headers, "x-spam-flag");
  if (status === null && flag === null) return null;
  const yes = /^\s*yes\b/i.test(status ?? flag ?? "");
  const fields: VendorField[] = [{ key: "status", value: yes ? "Yes" : "No", meaning: "Spam", flagged: yes }];
  const score = /score=(-?[\d.]+)/.exec(status ?? "");
  const required = /required=(-?[\d.]+)/.exec(status ?? "");
  if (score) fields.push({ key: "score", value: score[1], meaning: required ? `threshold ${required[1]}` : null, flagged: yes });
  return { vendor: "SpamAssassin", verdict: yes ? "spam" : "clean", fields };
}

/** Verdicts left by mail filters on the way in. */
export function vendorVerdicts(headers: readonly HeaderField[]): VendorVerdict[] {
  return [microsoft, proofpoint, mimecast, google, spamAssassin]
    .map((decode) => decode(headers))
    .filter((v): v is VendorVerdict => v !== null);
}

export function vendorFindings(verdicts: readonly VendorVerdict[]): Finding[] {
  return verdicts.flatMap((v): Finding[] => {
    const id = `vendor.${v.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const evidence = v.fields
      .filter((f) => f.flagged)
      .map((f) => `${f.key}: ${f.value}${f.meaning ? ` (${f.meaning})` : ""}`);
    const base = { id, category: "vendor" as const, evidence };
    switch (v.verdict) {
      case "phishing":
        return [{ ...base, severity: "high", title: `${v.vendor} classified it as phishing`,
          explanation: "The mail filter this message went through flagged it as phishing when it arrived.", weight: 15 }];
      case "malware":
        return [{ ...base, severity: "high", title: `${v.vendor} detected malware`,
          explanation: "The mail filter this message went through found malware in it.", weight: 20 }];
      case "spam":
        return [{ ...base, severity: "medium", title: `${v.vendor} classified it as spam`,
          explanation: "The mail filter this message went through scored it as spam.", weight: 6 }];
      case "bulk":
        return [{ ...base, severity: "info", title: `${v.vendor} classified it as bulk mail`,
          explanation: "Bulk mail is marketing or notifications sent in volume. Not malicious by itself.", weight: 0 }];
      default:
        return [];
    }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/headers
git commit -m "Decode gateway verdict headers

Microsoft 365 (X-Forefront-Antispam-Report, SCL, BCL, PCL), Proofpoint,
Mimecast impersonation protection, Gmail markers and SpamAssassin are
decoded into labelled fields, each marked when it is the reason for
concern, plus an overall verdict. Phishing and malware verdicts become
high-severity findings; spam is medium; bulk is informational."
```

---

### Task 10: Header analysis entry point

**Files:**
- Create: `src/lib/headers/analyze.ts`, `src/lib/headers/analyze.test.ts`

**Interfaces:**
- Consumes: everything in Tasks 3–9.
- Produces: `AnalysisOptions = { orgDomains: string[] }`, `HeaderReport = { subject: string | null; date: Date | null; hops: Hop[]; auth: AuthSummary; sender: SenderInfo; vendors: VendorVerdict[]; findings: Finding[] }`, `analyzeHeaders(email: ParsedEmail, options: AnalysisOptions): HeaderReport`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/headers/analyze.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEmail, parseHeadersOnly } from "../mime/parse.ts";
import { analyzeHeaders } from "./analyze.ts";

const read = (name: string) => readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url));

test("finds the spoof in the spoofed-invoice fixture, most severe first", () => {
  const report = analyzeHeaders(parseEmail(read("spoofed-invoice.eml")), { orgDomains: ["rhone-energie.fr"] });
  assert.equal(report.subject, "Rappel : votre facture RE-2026-4471 reste impayée");
  assert.equal(report.date?.toISOString(), "2026-10-13T07:14:01.000Z");
  assert.equal(report.hops.length, 4);
  assert.equal(report.auth.recordedBy, "AS8PR04MB8213.eurprd04.prod.outlook.com");
  assert.equal(report.sender.from?.address, "facturation@rhone-energie.fr");
  assert.equal(report.vendors[0].verdict, "phishing");
  assert.deepEqual(report.findings.map((f) => f.id), [
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
  ]);
  assert.match(report.findings[0].title, /your own domain/);
});

test("raises nothing on the clean newsletter", () => {
  const report = analyzeHeaders(parseEmail(read("clean-newsletter.eml")), { orgDomains: [] });
  assert.equal(report.subject, "Nos coups de cœur d'octobre");
  assert.equal(report.auth.recordedBy, "mx.google.com");
  assert.deepEqual(report.findings, []);
});

test("gives the same findings from pasted headers", () => {
  const source = read("spoofed-invoice.eml").toString("utf8");
  const pasted = parseHeadersOnly(source.slice(0, source.indexOf("\n\n")));
  const report = analyzeHeaders(pasted, { orgDomains: [] });
  assert.deepEqual(report.findings.map((f) => f.id), [
    "auth.dmarc-fail",
    "vendor.microsoft-365",
    "sender.reply-to-mismatch",
    "route.helo-mismatch",
  ]);
  assert.match(report.findings[0].title, /DMARC failed for rhone-energie\.fr/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `analyze.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/headers/analyze.ts
import type { ParsedEmail } from "../email.ts";
import { sortFindings, type Finding } from "../finding.ts";
import { decodeEncodedWords } from "../mime/encoded-words.ts";
import { getHeader } from "../mime/headers.ts";
import { authFindings, authSummary, type AuthSummary } from "./auth.ts";
import { dateFindings, parseMailDate } from "./date.ts";
import { relayChain, routeFindings, type Hop } from "./received.ts";
import { senderFindings, senderInfo, type SenderInfo } from "./sender.ts";
import { vendorFindings, vendorVerdicts, type VendorVerdict } from "./vendors.ts";

export type AnalysisOptions = {
  /** The analyst's own domains (settings, milestone 4): spoofing them weighs more. */
  orgDomains: string[];
};

export type HeaderReport = {
  subject: string | null;
  date: Date | null;
  hops: Hop[];
  auth: AuthSummary;
  sender: SenderInfo;
  vendors: VendorVerdict[];
  findings: Finding[];
};

export function analyzeHeaders(email: ParsedEmail, options: AnalysisOptions): HeaderReport {
  const headers = email.headers;
  const hops = relayChain(headers);
  const auth = authSummary(headers, hops);
  const sender = senderInfo(headers);
  const vendors = vendorVerdicts(headers);
  const subject = getHeader(headers, "subject");
  const rawDate = getHeader(headers, "date");
  return {
    subject: subject === null ? null : decodeEncodedWords(subject),
    date: rawDate === null ? null : parseMailDate(rawDate),
    hops,
    auth,
    sender,
    vendors,
    findings: sortFindings([
      ...authFindings(auth, sender.from?.domain ?? null, options.orgDomains),
      ...senderFindings(sender, options.orgDomains),
      ...routeFindings(hops),
      ...dateFindings(rawDate, hops),
      ...vendorFindings(vendors),
    ]),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/headers
git commit -m "Add the header analysis entry point

analyzeHeaders runs every header check on a parsed email and returns the
relay chain, authentication summary, sender table, gateway verdicts and
the findings, most severe first. The spoofed-invoice fixture yields its
four expected findings, from the file or from pasted headers alike, and
the clean newsletter yields none."
```

---

### Task 11: Formatting helpers

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatUtc(date): string`, `formatTime(date): string`, `formatDelay(seconds: number | null): string`, `formatSize(bytes: number): string`.

- [ ] **Step 1: Write the failing test**

```ts file=src/lib/format.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDelay, formatSize, formatTime, formatUtc } from "./format.ts";

const DATE = new Date("2026-10-13T07:14:01Z");

test("formats times in UTC whatever the locale", () => {
  assert.equal(formatUtc(DATE), "2026-10-13 07:14:01 UTC");
  assert.equal(formatTime(DATE), "07:14:01Z");
});

test("formats relay delays", () => {
  assert.equal(formatDelay(null), "—");
  assert.equal(formatDelay(0), "+0 s");
  assert.equal(formatDelay(90), "+90 s");
  assert.equal(formatDelay(600), "+10 min");
  assert.equal(formatDelay(-3600), "−60 min");
  assert.equal(formatDelay(86_400), "+24 h");
});

test("formats sizes", () => {
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(49_357), "48.2 KB");
  assert.equal(formatSize(3_500_000), "3.3 MB");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `format.ts`.

- [ ] **Step 3: Implement**

```ts file=src/lib/format.ts
/** `2026-10-13 07:14:01 UTC`: one unambiguous form for every analyst, whatever their locale. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function formatTime(date: Date): string {
  return `${date.toISOString().slice(11, 19)}Z`;
}

export function formatDelay(seconds: number | null): string {
  if (seconds === null) return "—";
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  if (abs < 120) return `${sign}${abs} s`;
  if (abs < 7200) return `${sign}${Math.round(abs / 60)} min`;
  return `${sign}${Math.round(abs / 3600)} h`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "Add UTC, delay and size formatting

Times are shown in UTC in one fixed form so analysts in different
locales read the same thing, and so the client-only render never depends
on the browser's locale."
```

---

### Task 12: Entry screen and report view

**Files:**
- Create: `src/components/ui.ts`, `src/components/EntryPanel.tsx`, `src/components/SeverityTag.tsx`, `src/components/FindingsPanel.tsx`, `src/components/Tabs.tsx`, `src/components/HeadersTab.tsx`, `src/components/RawTab.tsx`, `src/components/ReportView.tsx`, `src/components/Footer.tsx`
- Modify: `src/components/TopBar.tsx` (full replacement), `src/app/page.tsx` (full replacement)

**Interfaces:**
- Consumes: `parseEmail`, `parseHeadersOnly` (Task 4), `analyzeHeaders`, `HeaderReport` (Task 10), `isFailing`, `entryDetails` (Task 7), `format*` (Task 11), `useSettings` (Task 1), `getHeader`, `decodeEncodedWords` (Task 3).
- Produces: `FileMeta = { name: string; size: number; parseMs: number }` (exported by `TopBar.tsx`); the page's `input[type="file"]` used by the smoke test.

- [ ] **Step 1: Shared classes**

```ts file=src/components/ui.ts
// Shared class lists. Base classes are the Swiss look; `console:` and
// `dossier:` variants restyle them. Components never pick colours or fonts
// directly — only the tokens defined in globals.css.

/** Small caption above a value or a section. */
export const LABEL =
  "text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted console:text-[11px] console:font-normal console:tracking-wider dossier:text-[13px] dossier:normal-case dossier:tracking-[0.05em] dossier:[font-variant:small-caps]";

export const SECTION_TITLE =
  "mb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted console:mb-1 console:text-[11px] console:font-normal console:tracking-wider dossier:mb-1.5 dossier:border-b dossier:border-rule dossier:text-[13px] dossier:font-semibold dossier:normal-case dossier:tracking-[0.1em] dossier:text-ink dossier:[font-variant:small-caps]";

/** Values copied from the email: addresses, hosts, header text. */
export const DATA = "font-data text-[0.8125rem] console:text-xs";

/** Text in the signal colour: the part that is wrong. */
export const FLAG = "font-semibold text-signal-fg";

const BUTTON_BASE =
  "border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-40 console:py-1 console:text-xs dossier:font-data";

export const BUTTON = `${BUTTON_BASE} border-rule hover:bg-ink hover:text-paper`;

export const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink bg-ink text-paper hover:border-signal hover:bg-signal hover:text-on-signal`;
```

- [ ] **Step 2: Top bar, footer, entry panel**

```tsx file=src/components/TopBar.tsx
"use client";

import { formatSize } from "@/lib/format";
import type { Theme } from "@/lib/settings";
import ThemeSwitch from "./ThemeSwitch";
import { BUTTON, DATA, LABEL } from "./ui";

export type FileMeta = { name: string; size: number; parseMs: number };

export default function TopBar({
  file,
  theme,
  onTheme,
  onClose,
}: {
  file: FileMeta | null;
  theme: Theme | null;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-rule px-4 py-2.5 sm:px-6 suisse:border-t-[6px] suisse:border-t-ink console:border-hairline console:bg-panel console:py-1.5 dossier:border-b-2">
      <span className="font-display text-lg font-extrabold tracking-tight console:text-sm console:font-semibold console:lowercase console:tracking-normal console:text-signal-fg dossier:text-base dossier:font-semibold dossier:tracking-[0.08em] dossier:[font-variant:small-caps]">
        Perspicax
      </span>
      {file && (
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm console:gap-x-5 console:text-xs console:*:flex console:*:gap-2">
          <div>
            <dt className={LABEL}>File</dt>
            <dd className={`${DATA} break-all`}>{file.name}</dd>
          </div>
          <div>
            <dt className={LABEL}>Size · parse</dt>
            <dd className="tabular-nums">
              {formatSize(file.size)} · {file.parseMs} ms
            </dd>
          </div>
        </dl>
      )}
      <div className="ml-auto flex items-center gap-3">
        {file && (
          <button type="button" className={BUTTON} onClick={onClose}>
            New email
          </button>
        )}
        <ThemeSwitch theme={theme} onChange={onTheme} />
      </div>
    </header>
  );
}
```

```tsx file=src/components/Footer.tsx
import { LABEL } from "./ui";

/**
 * AGPL section 13: a copy offered to users over a network has to offer them
 * the source it runs on. Point this at the public repository before
 * deploying — the link appears as soon as it is filled in.
 */
const SOURCE_URL: string = "";

export default function Footer() {
  return (
    <footer className="flex flex-wrap justify-between gap-2 border-t border-rule px-4 py-2 sm:px-6 console:border-hairline console:bg-panel dossier:border-t-2">
      <span className={LABEL}>Offline · the email stays in this tab · nothing stored</span>
      {SOURCE_URL && (
        <a className={`${LABEL} underline`} href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source
        </a>
      )}
    </footer>
  );
}
```

```tsx file=src/components/EntryPanel.tsx
"use client";

import { useRef, useState } from "react";
import { BUTTON, BUTTON_PRIMARY, DATA, FLAG, LABEL } from "./ui";

const PROMISES = [
  ["No server", "The page is static. There is nowhere to send the email, and nothing tries."],
  ["Nothing stored", "The email lives in this tab's memory. Reload and it is gone; only your settings are kept."],
  ["Works offline", "Turn the network off and drop a file: the analysis is the same."],
] as const;

export default function EntryPanel({
  dragging,
  error,
  onFile,
  onHeaders,
}: {
  dragging: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onHeaders: (text: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  return (
    <main className="grid flex-1 content-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12 console:py-4 dossier:py-10">
      <section
        aria-label="Open an email"
        data-dragging={dragging || undefined}
        className="flex min-h-72 flex-col border border-rule p-6 data-dragging:bg-panel lg:col-span-7 console:border-hairline console:p-4 dossier:border-dashed dossier:p-8"
      >
        {pasting ? (
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) onHeaders(text);
            }}
          >
            <label htmlFor="headers-input" className={LABEL}>
              Raw headers
            </label>
            <textarea
              id="headers-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              rows={14}
              placeholder="Received: from …"
              className={`${DATA} min-h-60 flex-1 resize-y border border-rule bg-paper p-3 focus-visible:outline-2 focus-visible:outline-signal console:bg-panel`}
            />
            <div className="flex gap-3">
              <button type="submit" className={BUTTON_PRIMARY} disabled={!text.trim()}>
                Analyse headers
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl console:text-xl console:font-semibold console:tracking-normal dossier:text-3xl dossier:font-semibold">
              Drop an email to analyse it.
            </h1>
            <p className="mt-3 max-w-prose text-muted">
              A <span className={DATA}>.eml</span> file from any mail client, or the raw headers of a message. It is
              read in this page and never leaves it.
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-8">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => input.current?.click()}>
                Choose a file…
              </button>
              <button type="button" className={BUTTON} onClick={() => setPasting(true)}>
                Paste headers
              </button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".eml,.msg,message/rfc822"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className={`mt-4 ${FLAG}`}>
            {error}
          </p>
        )}
      </section>

      <aside aria-label="Privacy" className="lg:col-span-5">
        <ul className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {PROMISES.map(([title, body]) => (
            <li key={title} className="border-b border-hairline py-3 console:border-b-0 console:py-1 dossier:py-2.5">
              <p className="font-bold console:font-normal console:text-signal-fg dossier:font-semibold">{title}</p>
              <p className="text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
```

- [ ] **Step 3: Findings, tabs, headers tab, raw tab, report view**

```tsx file=src/components/SeverityTag.tsx
import type { Severity } from "@/lib/finding";

const LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low", info: "Info" };

// Swiss: a square mark. Console: an inverted or tinted word. Dossier: the
// word is for screen readers only — the red margin weight carries it.
const MARK: Record<Severity, string> = {
  high: "bg-signal",
  medium: "bg-ink",
  low: "border border-ink",
  info: "border border-hairline",
};

const WORD: Record<Severity, string> = {
  high: "console:bg-signal console:px-1 console:font-semibold console:text-on-signal",
  medium: "console:text-signal-fg",
  low: "text-muted",
  info: "text-muted",
};

export default function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap dossier:sr-only">
      <span aria-hidden className={`inline-block size-[9px] shrink-0 console:hidden ${MARK[severity]}`} />
      <span className={`console:uppercase ${WORD[severity]}`}>{LABEL[severity]}</span>
    </span>
  );
}
```

```tsx file=src/components/FindingsPanel.tsx
import type { Finding } from "@/lib/finding";
import SeverityTag from "./SeverityTag";
import { DATA, SECTION_TITLE } from "./ui";

export default function FindingsPanel({ findings }: { findings: Finding[] }) {
  return (
    <section aria-labelledby="findings-title">
      <h2 id="findings-title" className={SECTION_TITLE}>
        Findings · {findings.length}
      </h2>
      {findings.length === 0 ? (
        <p className="text-muted">No finding in the headers.</p>
      ) : (
        <ol className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {findings.map((finding, i) => (
            <li
              key={finding.id}
              className="grid grid-cols-[2.5rem_5.5rem_minmax(0,1fr)] gap-x-3 border-b border-hairline py-2 console:grid-cols-[4ch_8ch_minmax(0,1fr)] console:gap-x-2 console:border-b-0 console:py-0.5 dossier:grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] dossier:border-dotted dossier:py-2"
            >
              <span className="hidden text-muted dossier:inline">{i + 1}.</span>
              <span className="text-right font-bold tabular-nums console:text-left console:font-normal console:text-signal-fg dossier:order-last dossier:text-[15px] dossier:font-semibold dossier:italic dossier:text-signal-fg">
                +{finding.weight}
              </span>
              <SeverityTag severity={finding.severity} />
              <div className="min-w-0">
                <p className="font-bold console:font-normal dossier:font-semibold">{finding.title}</p>
                <p className="text-muted console:text-xs">{finding.explanation}</p>
                {finding.evidence.length > 0 && (
                  <ul className="mt-1">
                    {finding.evidence.map((line) => (
                      <li
                        key={line}
                        className={`${DATA} break-all ${
                          finding.severity === "high"
                            ? "dossier:underline dossier:decoration-signal dossier:decoration-wavy dossier:underline-offset-[3px]"
                            : ""
                        }`}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

```tsx file=src/components/Tabs.tsx
"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabSpec<T extends string> = { id: T; label: string; count?: number };

export default function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
}: {
  label: string;
  tabs: TabSpec<T>[];
  active: T;
  onChange: (id: T) => void;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  }

  return (
    <div className="mt-6 console:mt-0 dossier:mt-8">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex flex-wrap border-b border-rule console:border-hairline console:bg-panel dossier:gap-1"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="mr-6 border-t-[3px] border-transparent pt-2.5 pb-2 font-medium text-muted hover:text-ink aria-selected:border-ink aria-selected:font-bold aria-selected:text-ink console:mr-0 console:border-t-0 console:border-r console:border-hairline console:px-3 console:py-1 console:text-xs console:font-normal console:lowercase console:aria-selected:bg-ink console:aria-selected:font-normal console:aria-selected:text-paper dossier:mr-0 dossier:-mb-px dossier:border dossier:border-b-0 dossier:border-hairline dossier:bg-panel dossier:px-3 dossier:pt-1 dossier:pb-1 dossier:text-sm dossier:font-normal dossier:tracking-[0.05em] dossier:[font-variant:small-caps] dossier:aria-selected:border-rule dossier:aria-selected:bg-paper dossier:aria-selected:font-normal"
          >
            <span className="mr-1.5 text-[10.5px] console:hidden dossier:hidden">{String(i + 1).padStart(2, "0")}</span>
            <span className="hidden console:inline">{i + 1} </span>
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 font-normal text-muted">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} className="pt-5 console:pt-2">
        {children}
      </div>
    </div>
  );
}
```

```tsx file=src/components/HeadersTab.tsx
import type { HeaderField } from "@/lib/email";
import { formatDelay, formatTime } from "@/lib/format";
import type { HeaderReport } from "@/lib/headers/analyze";
import { entryDetails, isFailing, type AuthSummary } from "@/lib/headers/auth";
import type { Hop } from "@/lib/headers/received";
import type { SenderInfo, SenderRow } from "@/lib/headers/sender";
import type { VendorVerdict } from "@/lib/headers/vendors";
import { DATA, FLAG, LABEL, SECTION_TITLE } from "./ui";

const METHOD_LABEL: Record<string, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  compauth: "Compauth",
  arc: "ARC",
  bimi: "BIMI",
};

const VERDICT_LABEL: Record<NonNullable<VendorVerdict["verdict"]>, string> = {
  phishing: "Phishing",
  malware: "Malware",
  spam: "Spam",
  bulk: "Bulk",
  clean: "Clean",
};

export default function HeadersTab({ report, headers }: { report: HeaderReport; headers: HeaderField[] }) {
  return (
    <div className="grid gap-x-8 gap-y-8 lg:grid-cols-12 console:gap-y-4 dossier:gap-y-6 dossier:lg:grid-cols-2">
      <Authentication auth={report.auth} />
      <Sender sender={report.sender} />
      <Route hops={report.hops} />
      <Vendors vendors={report.vendors} />
      <AllHeaders headers={headers} />
    </div>
  );
}

function Authentication({ auth }: { auth: AuthSummary }) {
  return (
    <section
      aria-labelledby="auth-title"
      className="lg:col-span-5 console:lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-1 dossier:lg:row-start-1"
    >
      <h2 id="auth-title" className={SECTION_TITLE}>
        Authentication
        {auth.recordedBy && (
          <span className="normal-case tracking-normal">
            {" "}
            · recorded by <span className={DATA}>{auth.recordedBy}</span>
          </span>
        )}
      </h2>
      {auth.entries.length === 0 ? (
        <p className="text-muted">No authentication results in these headers.</p>
      ) : (
        <dl className="border-t border-rule console:border-t-0 dossier:border-t-0">
          {auth.entries.map((entry, i) => (
            <div
              key={i}
              className="grid grid-cols-[6.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-hairline py-1.5 console:grid-cols-[10ch_7ch_minmax(0,1fr)] console:border-b-0 console:py-0 dossier:grid-cols-[6rem_5.5rem_minmax(0,1fr)] dossier:py-1"
            >
              <dt className="text-[15px] font-bold console:text-xs console:font-normal console:lowercase dossier:text-sm dossier:font-normal dossier:tracking-[0.05em] dossier:text-muted dossier:[font-variant:small-caps]">
                {METHOD_LABEL[entry.method] ?? entry.method}
              </dt>
              <dd className="text-[15px] font-bold console:text-xs dossier:font-data dossier:text-sm dossier:font-normal">
                <span
                  className={
                    isFailing(entry)
                      ? "text-signal-fg suisse:capitalize dossier:inline-block dossier:-rotate-3 dossier:rounded-[50%] dossier:border-[1.5px] dossier:border-signal dossier:px-1.5"
                      : "suisse:capitalize console:font-normal"
                  }
                >
                  {entry.result}
                </span>
              </dd>
              <dd className={`${DATA} break-all text-muted`}>{entryDetails(entry) || entry.comment || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function describeRow(row: SenderRow): { text: string; flagged: boolean } | null {
  const notes: string[] = [];
  if (row.matchesFrom === false) notes.push("≠ From");
  if (row.freeMail) notes.push("free mail");
  if (row.header === "Return-Path" && row.domain === null) notes.push("null sender");
  return notes.length > 0 ? { text: notes.join(" · "), flagged: row.matchesFrom === false } : null;
}

function SenderLine({ label, value, note, data = true }: {
  label: string;
  value: string;
  note: { text: string; flagged: boolean } | null;
  data?: boolean;
}) {
  return (
    <tr className="border-b border-hairline console:border-b-0">
      <th scope="row" className={`${LABEL} w-28 py-1.5 pr-3 text-left align-baseline console:w-[13ch] console:py-0`}>
        {label}
      </th>
      <td className={`${data ? DATA : ""} break-all py-1.5 align-baseline console:py-0`}>{value}</td>
      <td className={`whitespace-nowrap py-1.5 pl-3 text-right align-baseline console:py-0 console:text-left ${note?.flagged ? FLAG : "text-muted"}`}>
        {note?.text}
      </td>
    </tr>
  );
}

function Sender({ sender }: { sender: SenderInfo }) {
  return (
    <section
      aria-labelledby="sender-title"
      className="lg:col-span-7 console:lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-2 dossier:lg:row-start-2"
    >
      <h2 id="sender-title" className={SECTION_TITLE}>
        Sender consistency
      </h2>
      <table className="w-full border-collapse border-t border-rule text-sm console:border-t-0 console:text-xs dossier:border-t-0">
        <tbody>
          {sender.from?.name && <SenderLine label="Display name" value={sender.from.name} note={null} data={false} />}
          {sender.rows.map((row, i) => (
            <SenderLine key={i} label={row.header} value={row.value} note={describeRow(row)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function hopFlags(hop: Hop): string[] {
  const flags: string[] = [];
  if (hop.heloMismatch) flags.push(hop.rdns ? "HELO ≠ rDNS" : "HELO, no rDNS");
  if (hop.ipScope && hop.ipScope !== "public") flags.push(hop.ipScope);
  if (hop.delay !== null && hop.delay < -300) flags.push("clock skew");
  return flags;
}

function Route({ hops }: { hops: Hop[] }) {
  return (
    <section
      aria-labelledby="route-title"
      className="lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-2 dossier:lg:row-start-1"
    >
      <h2 id="route-title" className={SECTION_TITLE}>
        Received chain · {hops.length} {hops.length === 1 ? "hop" : "hops"}, oldest first
      </h2>
      {hops.length === 0 ? (
        <p className="text-muted">No Received headers.</p>
      ) : (
        <>
          <div
            aria-hidden
            className="hidden grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-2 border-b border-hairline text-xs text-muted console:grid"
          >
            <span>#</span>
            <span>time</span>
            <span>Δ</span>
            <span>from</span>
            <span>by</span>
            <span>flags</span>
          </div>
          <ol className="grid border-t border-rule [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] console:block console:border-t-0 dossier:block dossier:border-t-0">
            {hops.map((hop) => (
              <HopItem key={hop.index} hop={hop} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function HopItem({ hop }: { hop: Hop }) {
  const flags = hopFlags(hop);
  const host = hop.helo ?? hop.rdns ?? hop.ip ?? "unknown";
  const transport = [hop.protocol, hop.tls ? "TLS" : null].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] content-start gap-x-2 border-r border-hairline px-3 pt-2 pb-3 first:pl-0 last:border-r-0 console:grid-cols-[3ch_10ch_7ch_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] console:border-r-0 console:p-0 console:text-xs dossier:grid-cols-[5.5rem_1.75rem_minmax(0,1fr)] dossier:border-r-0 dossier:border-b dossier:px-0 dossier:py-1.5">
      <span className="font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:88%] console:text-xs console:font-normal console:tracking-normal console:text-muted dossier:col-start-2 dossier:row-start-1 dossier:text-sm dossier:font-semibold dossier:tracking-normal dossier:after:content-['.']">
        {hop.index}
      </span>
      <span className="text-right text-xs font-bold tabular-nums console:text-left console:font-normal dossier:col-start-1 dossier:row-start-1 dossier:text-left dossier:font-data dossier:font-normal dossier:text-muted">
        {hop.date ? formatTime(hop.date) : "—"}
      </span>
      <span className="text-right text-xs tabular-nums text-muted console:text-left dossier:col-start-1 dossier:row-start-2 dossier:text-left dossier:font-data">
        {formatDelay(hop.delay)}
      </span>
      <span className="col-span-3 mt-2 break-all console:col-span-1 console:mt-0 dossier:col-span-1 dossier:col-start-3 dossier:row-start-1 dossier:mt-0">
        <span className={DATA}>{host}</span>
        {hop.ip && hop.ip !== host && (
          <span className={`${DATA} block console:ml-1 console:inline ${hop.heloMismatch ? FLAG : "text-muted"}`}>
            [{hop.ip}]
          </span>
        )}
      </span>
      <span className="col-span-3 break-all text-muted console:col-span-1 dossier:col-span-1 dossier:col-start-3 dossier:row-start-2">
        <span className="console:hidden">by </span>
        <span className={DATA}>{hop.by ?? "—"}</span>
      </span>
      <span className="col-span-3 text-xs console:col-span-1 dossier:col-span-1 dossier:col-start-3 dossier:row-start-3 dossier:text-sm dossier:italic">
        {flags.length > 0 && <span className={`${FLAG} mr-2`}>{flags.join(" · ")}</span>}
        {transport && <span className="text-muted dossier:not-italic">{transport}</span>}
      </span>
    </li>
  );
}

function Vendors({ vendors }: { vendors: VendorVerdict[] }) {
  return (
    <section
      aria-labelledby="vendors-title"
      className="lg:col-span-12 dossier:lg:col-span-1 dossier:lg:col-start-1 dossier:lg:row-start-2"
    >
      <h2 id="vendors-title" className={SECTION_TITLE}>
        Gateway verdicts
      </h2>
      {vendors.length === 0 ? (
        <p className="text-muted">No mail-filter verdict in these headers.</p>
      ) : (
        vendors.map((vendor) => (
          <div key={vendor.vendor} className="mb-4 last:mb-0">
            <p className="mb-1 flex items-baseline gap-3 font-bold console:font-normal dossier:font-semibold">
              {vendor.vendor}
              {vendor.verdict && (
                <span className={vendor.verdict === "clean" || vendor.verdict === "bulk" ? "font-normal text-muted" : FLAG}>
                  {VERDICT_LABEL[vendor.verdict]}
                </span>
              )}
            </p>
            <dl className="grid border-t border-hairline [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] console:border-t-0">
              {vendor.fields.map((field) => (
                <div key={field.key} className="border-b border-hairline py-1.5 pr-3 console:border-b-0 console:py-0">
                  <dt className={`${DATA} ${field.flagged ? FLAG : ""}`}>
                    {field.key}: {field.value}
                  </dt>
                  {field.meaning && <dd className="text-xs text-muted">{field.meaning}</dd>}
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </section>
  );
}

function AllHeaders({ headers }: { headers: HeaderField[] }) {
  return (
    <details className="lg:col-span-12 dossier:lg:col-span-2">
      <summary className={`${SECTION_TITLE} cursor-pointer select-none`}>All headers · {headers.length}</summary>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {headers.map((header, i) => (
            <tr key={i} className="border-b border-hairline align-baseline">
              <th scope="row" className={`${DATA} w-56 py-1 pr-3 text-left font-semibold`}>
                {header.name}
              </th>
              <td className={`${DATA} whitespace-pre-wrap break-all py-1`}>{header.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
```

```tsx file=src/components/RawTab.tsx
import { DATA } from "./ui";

// Rendering a multi-megabyte <pre> freezes the tab; the head of the file is what analysts read.
const LIMIT = 2_000_000;

export default function RawTab({ raw }: { raw: string }) {
  const clipped = raw.length > LIMIT;
  return (
    <div>
      {clipped && (
        <p className="mb-2 text-muted">
          Showing the first {LIMIT.toLocaleString("en")} of {raw.length.toLocaleString("en")} characters.
        </p>
      )}
      <pre className={`${DATA} overflow-x-auto whitespace-pre-wrap break-all text-xs`}>
        {clipped ? raw.slice(0, LIMIT) : raw}
      </pre>
    </div>
  );
}
```

```tsx file=src/components/ReportView.tsx
"use client";

import { useState } from "react";
import type { ParsedEmail } from "@/lib/email";
import { formatUtc } from "@/lib/format";
import type { HeaderReport } from "@/lib/headers/analyze";
import { decodeEncodedWords } from "@/lib/mime/encoded-words";
import { getHeader } from "@/lib/mime/headers";
import FindingsPanel from "./FindingsPanel";
import HeadersTab from "./HeadersTab";
import RawTab from "./RawTab";
import Tabs from "./Tabs";
import { DATA, LABEL } from "./ui";

type TabId = "headers" | "raw";

export default function ReportView({ email, report }: { email: ParsedEmail; report: HeaderReport }) {
  const [tab, setTab] = useState<TabId>("headers");
  const from = report.sender.from;
  const to = getHeader(email.headers, "to");

  return (
    <main className="flex-1 px-4 pb-12 sm:px-6">
      <div className="grid gap-x-8 gap-y-6 border-b-[3px] border-rule py-6 lg:grid-cols-12 console:border-b console:border-hairline console:py-3 dossier:border-b-0 dossier:py-8">
        <div className="lg:col-span-5 console:lg:col-span-12 dossier:lg:col-span-12">
          <p className={LABEL}>Subject</p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-bold tracking-tight console:text-sm console:font-medium console:tracking-normal dossier:text-[1.6rem] dossier:font-semibold dossier:before:content-['«_'] dossier:after:content-['_»']">
            {report.subject || "(no subject)"}
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
            <dd className="tabular-nums">{report.date ? formatUtc(report.date) : "—"}</dd>
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
          { id: "raw", label: "Raw source" },
        ]}
        active={tab}
        onChange={setTab}
      >
        {tab === "headers" ? <HeadersTab report={report} headers={email.headers} /> : <RawTab raw={email.raw} />}
      </Tabs>
    </main>
  );
}
```

- [ ] **Step 4: Page**

```tsx file=src/app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EntryPanel from "@/components/EntryPanel";
import Footer from "@/components/Footer";
import ReportView from "@/components/ReportView";
import TopBar, { type FileMeta } from "@/components/TopBar";
import { useSettings } from "@/hooks/useSettings";
import type { ParsedEmail } from "@/lib/email";
import { analyzeHeaders, type HeaderReport } from "@/lib/headers/analyze";
import { parseEmail, parseHeadersOnly } from "@/lib/mime/parse";

/** Everything about the current email. It lives here, in memory, and nowhere else. */
type Analysis = { id: number; email: ParsedEmail; report: HeaderReport; file: FileMeta };

export default function Home() {
  const { settings, setSettings, loaded } = useSettings();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);

  const analyse = useCallback((parse: () => ParsedEmail, name: string, size: number) => {
    try {
      const start = performance.now();
      const email = parse();
      // Organisation domains arrive with the settings panel (milestone 4).
      const report = analyzeHeaders(email, { orgDomains: [] });
      const parseMs = Math.round(performance.now() - start);
      setAnalysis({ id: ++nextId.current, email, report, file: { name, size, parseMs } });
      setError(null);
    } catch (err) {
      setError(`Could not read this email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (/\.msg$/i.test(file.name)) {
        setError("Outlook .msg files are not supported yet. Save the message as .eml, or paste its headers.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      analyse(() => parseEmail(bytes), file.name, bytes.length);
    },
    [analyse],
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

  return (
    <>
      <TopBar
        file={analysis?.file ?? null}
        theme={loaded ? settings.theme : null}
        onTheme={(theme) => setSettings((current) => ({ ...current, theme }))}
        onClose={() => setAnalysis(null)}
      />
      {analysis ? (
        <ReportView key={analysis.id} email={analysis.email} report={analysis.report} />
      ) : (
        <EntryPanel
          dragging={dragging}
          error={error}
          onFile={(file) => void openFile(file)}
          onHeaders={(text) => analyse(() => parseHeadersOnly(text), "Pasted headers", new TextEncoder().encode(text).length)}
        />
      )}
      <Footer />
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS, lint clean, build succeeds. Then `npm run dev`, open `http://localhost:3000`, drop `fixtures/spoofed-invoice.eml`, switch through the three themes: the four findings, the 4-hop chain, the failing auth results and the Microsoft verdict all render in each theme; "New email" returns to the entry screen; "Paste headers" accepts the fixture's header block.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Show the Headers tab in all three themes

The entry screen opens a .eml by file picker or drop anywhere on the
page, or takes pasted headers. The report shows the subject, sender and
findings, then tabs for Headers (authentication, sender consistency,
relay chain, gateway verdicts, every header) and the raw source.

Each component is written once against the theme tokens; the console
and dossier looks are variants on the Swiss base, so a fourth theme or a
change to one never forks the markup. The analysis lives in React state
only."
```

---

### Task 13: Browser smoke test on the fixtures

**Files:**
- Modify: `fixtures/smoke.json`

**Interfaces:**
- Consumes: `scripts/smoke.mjs` (Task 1), the page (Task 12), the fixtures (Task 4).

- [ ] **Step 1: List the fixtures and what each must show**

```json file=fixtures/smoke.json
[
  {
    "file": "spoofed-invoice.eml",
    "expect": [
      "DMARC failed for rhone-energie.fr",
      "Replies go to a different domain",
      "Microsoft 365 classified it as phishing",
      "Sending server misnames itself",
      "mx01.mta-relay.click",
      "CAT: PHSH"
    ]
  },
  {
    "file": "clean-newsletter.eml",
    "expect": ["Nos coups de cœur d'octobre", "No finding in the headers", "mx.google.com"]
  }
]
```

- [ ] **Step 2: Run the smoke test**

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed: 3 themes × 2 fixtures.` If a string is missing, fix the component (not the expectation) unless the expectation is wrong about the spec.

- [ ] **Step 3: Review the screenshots**

Open the eight PNGs in `.smoke/`. Check, per theme: nothing overflows horizontally; failing auth results are in the signal colour (circled in dossier); the relay chain reads as columns (suisse), a table (console), a ledger (dossier); severity is visible (squares, inverted tags, red margin weights). Fix and re-run until all three read cleanly.

- [ ] **Step 4: Commit**

```bash
git add fixtures/smoke.json src
git commit -m "Smoke-test both fixtures in every theme

The smoke test now opens the spoofed invoice and the clean newsletter in
each of the three themes through the real file input, checks the key
findings and verdicts are on screen, and fails if the page makes a
single request outside the local server while doing so."
```

---

## Milestone 1 exit criteria

- `npm test`, `npm run lint`, `npm run build`, `npm run smoke` all pass.
- Spoofed invoice: 4 findings (DMARC fail, Microsoft phishing verdict, Reply-To mismatch, HELO mismatch); clean newsletter: none.
- Zero external requests during load and analysis, in every theme.
- Only `perspicax.settings.v1` in Local Storage.
