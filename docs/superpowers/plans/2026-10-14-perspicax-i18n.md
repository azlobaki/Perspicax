# Perspicax — French and English (i18n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every visible text of Perspicax exists in French and English, picked from the browser on the first visit and switchable from the top bar.

**Architecture:** The engine writes each reader-facing sentence as a `Text` (`{ en, fr }`) where it writes a string today; the UI picks one language. Interface strings live in two typed dictionaries (`fr: typeof en`). The language is a setting (`locale: Locale | null`), applied before first paint by the boot script that already applies the theme.

**Tech Stack:** unchanged — Next.js 16 static export, React 19, Tailwind 4, TypeScript, `node:test`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-perspicax-i18n-design.md`

## Global Constraints

- Languages: `"en"` and `"fr"`; English is the fallback for every other browser language.
- No network request, no new dependency, no machine translation.
- Settings are written only when the user changes one; a first visit writes nothing to `localStorage` (the smoke test checks it).
- Finding ids, weights, categories, bands and the JSON structure do not change; only reader-facing strings become `Text`.
- `evidence` stays raw: it quotes the email and is never translated.
- Theme names (Suisse, Console, Dossier), service names (VirusTotal…), indicator types (url, domain, sha256…), header names and protocol tokens (SPF, DKIM, DMARC, SCL…) are not translated.
- The English text of every existing sentence stays exactly as it is; existing tests change only from `.title` to `.title.en` (and the like).
- Commands: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run smoke` (needs `npm run build` first; `CHROME` picks the browser, default `chromium`).
- Next.js in this repo differs from older versions: read `node_modules/next/dist/docs/` before touching routing, layout or metadata APIs.

## French style (all tasks)

Write French a French SOC analyst would write, not a word-for-word copy.

- Keep: SPF, DKIM, DMARC, ARC, compauth, SCL, BCL, HELO, Reply-To, Return-Path, Message-ID, From, IOC, URL, QR code, Punycode, homoglyph → *homoglyphe*.
- Glossary: finding → *constat*; phishing → *hameçonnage* in prose, *phishing* in short labels; spoofing → *usurpation*; lookalike domain → *domaine sosie*; display name → *nom affiché*; webmail address → *adresse de messagerie gratuite*; link → *lien*; shortened link → *lien raccourci*; tracking pixel → *pixel de suivi*; attachment → *pièce jointe*; archive → *archive*; macro → *macro*; payload → *charge utile*; relay chain → *chaîne de relais*; hop → *saut*; sender → *expéditeur*; recipient → *destinataire*; mail filter / gateway → *passerelle de messagerie*; verdict → *verdict*; Clean → *Sain*; Suspicious → *Suspect*; Likely phishing → *Hameçonnage probable*; Malicious indicators → *Indicateurs malveillants*; High/Medium/Low/Info → *Élevé/Moyen/Faible/Info*; Settings → *Réglages*; Safe preview → *Aperçu sécurisé*; Raw source → *Source brute*; defang → *neutraliser*.
- French typography: typographic apostrophe `’` (never `'`); non-breaking space before `: ; ? !` and inside `« »` — write it `\u00a0` in code; decimal comma; "Ko", "Mo".

---

### Task 1: Locale, settings and boot script (engine side)

**Files:**
- Create: `src/lib/i18n/text.ts`, `src/lib/i18n/text.test.ts`
- Modify: `src/lib/settings.ts`, `src/lib/settings.test.ts`

**Interfaces:**
- Produces: `type Locale = "en" | "fr"`, `LOCALES`, `type Text = Record<Locale, string>`, `detectLocale(languages: readonly string[]): Locale`, `isLocale(value: unknown): value is Locale`; `Settings.locale: Locale | null` (default `null`); `BOOT_SCRIPT` (renamed from `THEME_BOOT_SCRIPT`), which sets `data-theme` and `lang` on `<html>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/i18n/text.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLocale, isLocale } from "./text.ts";

test("French for any French browser, English otherwise", () => {
  assert.equal(detectLocale(["fr-FR", "en-US"]), "fr");
  assert.equal(detectLocale(["fr"]), "fr");
  assert.equal(detectLocale(["FR-ca"]), "fr");
  assert.equal(detectLocale(["de-DE", "fr-FR"]), "fr");
  assert.equal(detectLocale(["en-GB"]), "en");
  assert.equal(detectLocale(["es"]), "en");
  assert.equal(detectLocale([]), "en");
});

test("knows its locales", () => {
  assert.equal(isLocale("fr"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(null), false);
});
```

`detectLocale(["de-DE", "fr-FR"])` is French on purpose: the first supported language in the browser's list wins.

In `src/lib/settings.test.ts`, rename `THEME_BOOT_SCRIPT` to `BOOT_SCRIPT` in the import and in `runBootScript`, make `runBootScript` return both attributes and take the browser's languages, and add the locale cases:

```ts
function runBootScript(stored: string | null, languages: string[] = ["en-US"]): Record<string, string> {
  const attributes: Record<string, string> = {};
  const storage = { getItem: (key: string) => (key === SETTINGS_KEY ? stored : null) };
  const doc = { documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
  new Function("localStorage", "document", "navigator", BOOT_SCRIPT)(storage, doc, { languages });
  return attributes;
}

test("boot script applies a saved theme", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "dossier" }))["data-theme"], "dossier");
});

test("boot script ignores unknown, broken or missing values", () => {
  assert.equal(runBootScript(JSON.stringify({ theme: "neon" }))["data-theme"], undefined);
  assert.equal(runBootScript("{not json")["data-theme"], undefined);
  assert.equal(runBootScript(null)["data-theme"], undefined);
});

test("boot script sets the language: saved, else the browser's, else English", () => {
  assert.equal(runBootScript(JSON.stringify({ locale: "en" }), ["fr-FR"]).lang, "en");
  assert.equal(runBootScript(null, ["fr-FR"]).lang, "fr");
  assert.equal(runBootScript(JSON.stringify({ locale: "xx" }), ["fr-BE"]).lang, "fr");
  assert.equal(runBootScript("{not json", ["de"]).lang, "en");
});

test("keeps a known locale, null otherwise", () => {
  assert.equal(parseSettings({ locale: "fr" }).locale, "fr");
  assert.equal(parseSettings({ locale: "de" }).locale, null);
  assert.equal(parseSettings({}).locale, null);
  assert.equal(DEFAULT_SETTINGS.locale, null);
});
```

Add `locale: "fr"` to the input and `locale: "fr"` to the expected object of the existing test "keeps valid settings and drops the rest".

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/i18n/text.test.ts src/lib/settings.test.ts`
Expected: FAIL — `./text.ts` not found, `BOOT_SCRIPT` not exported.

- [ ] **Step 3: Implement**

`src/lib/i18n/text.ts`:

```ts
export type Locale = "en" | "fr";
export const LOCALES: readonly Locale[] = ["en", "fr"];

/** A sentence in every supported language. Missing a language is a type error. */
export type Text = Record<Locale, string>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The first supported language in the browser's list; English when there is none. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
```

In `src/lib/settings.ts`:
- `import { isLocale, type Locale } from "./i18n/text.ts";`
- add to `Settings`: `/** Interface language; null follows the browser. */ locale: Locale | null;`
- add `locale: null` to `DEFAULT_SETTINGS`
- in `parseSettings`'s returned object: `locale: isLocale(raw.locale) ? raw.locale : null,`
- replace `THEME_BOOT_SCRIPT` with:

```ts
/**
 * Runs inline in <head>, before first paint: applies the saved theme and the
 * language (saved, else the browser's first supported one, else English), so
 * neither flashes. A string: no imports, nothing to bundle.
 */
export const BOOT_SCRIPT = `(function(){var s=null;try{s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY,
)})||"null")}catch(e){}var d=document.documentElement;var t=s&&s.theme;if(${JSON.stringify(
  THEMES,
)}.indexOf(t)>-1)d.setAttribute("data-theme",t);var L=${JSON.stringify(LOCALES)};var l=s&&s.locale;if(L.indexOf(l)<0){l="en";var n=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""]);for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split("-")[0];if(L.indexOf(b)>-1){l=b;break}}}d.setAttribute("lang",l)})()`;
```

(import `LOCALES` too). In `src/app/layout.tsx`, import and use `BOOT_SCRIPT` instead of `THEME_BOOT_SCRIPT`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n src/lib/settings.ts src/lib/settings.test.ts src/app/layout.tsx
git commit -m "Add the locale setting, detected from the browser before first paint"
```

---

### Task 2: Dictionaries, locale context and the FR | EN switch

**Files:**
- Create: `src/i18n/messages.ts`, `src/i18n/LocaleContext.tsx`, `src/components/LocaleSwitch.tsx`
- Modify: `src/hooks/useSettings.ts`, `src/app/page.tsx`, `src/components/TopBar.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `Locale`, `Text`, `detectLocale`, `Settings.locale` (Task 1).
- Produces:
  - `messages: Record<Locale, Messages>` where `type Messages = typeof en`; `fr` is declared `const fr: Messages`.
  - `LocaleProvider({ locale, children })`, `useLocale(): Locale`, `useT(): Messages`, `usePick(): (text: Text) => string`.
  - `useSettings()` additionally returns `locale: Locale` (effective: saved, else browser; before settings load, the `lang` the boot script set) and `setLocale(locale: Locale): void`.
  - `LocaleSwitch({ locale, onChange })`.

- [ ] **Step 1: Write the dictionaries with the top bar's strings**

`src/i18n/messages.ts`:

```ts
import type { Locale } from "@/lib/i18n/text";

const en = {
  topBar: {
    file: "File",
    sizeParse: "Size · parse",
    newEmail: "New email",
    settings: "Settings",
    theme: "Theme",
    language: "Language",
  },
};

export type Messages = typeof en;

// Same shape as `en`, enforced by the type: a missing or extra key fails `tsc`.
const fr: Messages = {
  topBar: {
    file: "Fichier",
    sizeParse: "Taille · analyse",
    newEmail: "Nouvel e-mail",
    settings: "Réglages",
    theme: "Thème",
    language: "Langue",
  },
};

export const messages: Record<Locale, Messages> = { en, fr };
```

Later tasks add one key group per component, in both objects.

- [ ] **Step 2: Context and hooks**

`src/i18n/LocaleContext.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import type { Locale, Text } from "@/lib/i18n/text";
import { messages, type Messages } from "./messages";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);
export const useT = (): Messages => messages[useContext(LocaleContext)];

/** Picks the current language out of an engine `Text`. */
export function usePick(): (text: Text) => string {
  const locale = useContext(LocaleContext);
  return (text) => text[locale];
}
```

`src/hooks/useSettings.ts` — add the effective locale. The boot script already put it on `<html lang>`; React reads it through `useSyncExternalStore` so the server render (English) and hydration agree, then switches without an extra effect:

```ts
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { detectLocale, isLocale, type Locale } from "@/lib/i18n/text";
import { DEFAULT_SETTINGS, SETTINGS_KEY, parseSettings, type Settings } from "@/lib/settings";
import { useLocalStorage } from "./useLocalStorage";

const noSubscription = () => () => {};
const bootLocale = (): Locale => {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : "en";
};

/** Settings, plus their side effects on `<html>`: the theme and the language. */
export function useSettings() {
  const [settings, setSettings, loaded] = useLocalStorage<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings);
  const booted = useSyncExternalStore(noSubscription, bootLocale, () => "en" as Locale);
  const locale: Locale = loaded ? (settings.locale ?? detectLocale(navigator.languages ?? [])) : booted;

  useEffect(() => {
    // Until the stored value is read, the boot script's choice must stand.
    if (loaded) document.documentElement.dataset.theme = settings.theme;
  }, [loaded, settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    // French visitors' content is hidden until now (globals.css), so English never flashes.
    if (loaded) root.dataset.localeReady = "";
  }, [loaded, locale]);

  const setLocale = (next: Locale) => setSettings((s) => ({ ...s, locale: next }));
  return { settings, setSettings, loaded, locale, setLocale };
}
```

`src/app/globals.css` — append:

```css
/* A French visitor sees the prerendered English page only until the app has applied French. */
html[lang="fr"]:not([data-locale-ready]) [data-localised] {
  visibility: hidden;
}
```

- [ ] **Step 3: The switch, in the top bar**

`src/components/LocaleSwitch.tsx` (same look as `ThemeSwitch`):

```tsx
"use client";

import { LOCALES, type Locale } from "@/lib/i18n/text";
import { useT } from "@/i18n/LocaleContext";

export default function LocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t.topBar.language} className="flex border border-rule text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          id={`locale-${l}`}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => onChange(l)}
          className="border-l border-rule px-2.5 py-1 first:border-l-0 hover:bg-panel aria-pressed:bg-ink aria-pressed:text-paper console:aria-pressed:bg-signal console:aria-pressed:text-on-signal dossier:font-data"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

`TopBar`: add props `locale: Locale` and `onLocale: (locale: Locale) => void`; render `<LocaleSwitch locale={locale} onChange={onLocale} />` right before `<ThemeSwitch …/>`; replace "File", "Size · parse", "New email", "Settings" with `t.topBar.*` (`const t = useT();`). `ThemeSwitch`'s `aria-label="Theme"` becomes `t.topBar.theme`.

`src/app/page.tsx`: take `locale, setLocale` from `useSettings()`; wrap the returned fragment in `<LocaleProvider locale={locale}>`; pass `locale={locale} onLocale={setLocale}` to `TopBar`; add `data-localised` to the element holding `{main}` — wrap it: `<div data-localised className="flex flex-1 flex-col">{main}</div>`.

- [ ] **Step 4: Check it**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run smoke`
Expected: all pass (the smoke test does not know about the switch yet; nothing it checks changed). Then `npm run dev`, open http://localhost:3000, click FR: the top bar reads *Fichier, Réglages*; reload: still French; Settings → Reset: back to the browser's language.

- [ ] **Step 5: Commit**

```bash
git add src/i18n src/hooks/useSettings.ts src/app/page.tsx src/app/globals.css src/components/LocaleSwitch.tsx src/components/TopBar.tsx src/components/ThemeSwitch.tsx
git commit -m "Add the FR | EN switch and the interface dictionaries"
```

---

### Task 3: Findings in both languages

**Files:**
- Modify: `src/lib/finding.ts`; every producer: `src/lib/headers/auth.ts`, `sender.ts`, `received.ts`, `date.ts`, `vendors.ts` (`vendorFindings`), `src/lib/links/analyze.ts`, `src/lib/attachments/analyze.ts`, `src/lib/dkim/bodyhash.ts`, `src/lib/content/bank.ts`; consumers: `src/components/FindingsPanel.tsx`, `src/lib/report/markdown.ts` (temporarily `.en`, localised in Task 6); tests reading `.title`/`.explanation`.
- Create: `src/lib/i18n/findings.test.ts`

**Interfaces:**
- Consumes: `Text` (Task 1), `usePick` (Task 2).
- Produces: `Finding.title: Text`, `Finding.explanation: Text`.

- [ ] **Step 1: Write the failing test**

`src/lib/i18n/findings.test.ts` — every finding of every fixture, under every setting the fixtures use, has both languages:

```ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeEmail } from "../analyze.ts";
import { parseEmail } from "../mime/parse.ts";
import { parseMsg } from "../msg/parse.ts";
import { parseTestHtml as parseHtml } from "../testing/dom.ts";
import { decodePng } from "../testing/png.ts";
import { LOCALES } from "./text.ts";

const dir = new URL("../../../fixtures/", import.meta.url);
const files = readdirSync(dir).filter((f) => /\.(eml|msg)$/.test(f));

test("every finding of every fixture reads in every language", async () => {
  for (const file of files) {
    const bytes = readFileSync(new URL(file, dir));
    const email = file.endsWith(".msg") ? parseMsg(bytes) : parseEmail(bytes);
    const report = await analyzeEmail(email, {
      orgDomains: ["rhone-energie.fr"],
      vipNames: ["Claire Martin"],
      parseHtml,
      decodeImage: async (data) => decodePng(data),
    });
    for (const finding of report.findings) {
      for (const locale of LOCALES) {
        assert.ok(finding.title[locale]?.trim(), `${file} ${finding.id}: title.${locale}`);
        assert.ok(finding.explanation[locale]?.trim(), `${file} ${finding.id}: explanation.${locale}`);
      }
    }
  }
});

test("French findings read as French", async () => {
  const email = parseEmail(readFileSync(new URL("spoofed-invoice.eml", dir)));
  const report = await analyzeEmail(email, { orgDomains: ["rhone-energie.fr"], parseHtml, decodeImage: async (d) => decodePng(d) });
  const titles = Object.fromEntries(report.findings.map((f) => [f.id, f.title.fr]));
  assert.equal(titles["auth.dmarc-fail"], "Échec d’authentification de l’expéditeur pour votre propre domaine");
  assert.equal(titles["sender.reply-to-mismatch"], "Les réponses partent vers un autre domaine");
  assert.equal(titles["link.deceptive"], "Le texte du lien montre une autre destination");

  const payroll = await analyzeEmail(parseEmail(readFileSync(new URL("vip-payroll.eml", dir))), {
    orgDomains: ["rhone-energie.fr"], vipNames: ["Claire Martin"], parseHtml,
  });
  assert.deepEqual(payroll.findings.map((f) => f.title.fr), [
    "Nom affiché d’une personne protégée\u00a0: Claire Martin",
    "Demande de paiement ou de coordonnées bancaires depuis une adresse de messagerie gratuite",
  ]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/i18n/findings.test.ts`
Expected: FAIL — `finding.title.en` is undefined (titles are strings).

- [ ] **Step 3: Change the type, then every producer**

`src/lib/finding.ts`:

```ts
import type { Text } from "./i18n/text.ts";
// …
  title: Text;
  /** Why this matters, in plain words, in every language. */
  explanation: Text;
```

Then run `npx tsc --noEmit`: each error is a producer to convert. Convert every `title: "…"` / `explanation: "…"` to a `Text`, keeping the English byte for byte. Interpolations stay template literals in each language. Worked examples:

```ts
// headers/sender.ts
title: { en: "Replies go to a different domain", fr: "Les réponses partent vers un autre domaine" },
explanation: {
  en: `Answering this email sends the reply to ${domains}, not to the sender shown` + (free ? ", and to a free webmail address." : "."),
  fr: `Répondre à cet e-mail envoie la réponse à ${domains}, et non à l’expéditeur affiché` + (free ? ", et vers une adresse de messagerie gratuite." : "."),
},

// headers/auth.ts
title: own
  ? { en: "Sender authentication failed for your own domain", fr: "Échec d’authentification de l’expéditeur pour votre propre domaine" }
  : { en: `DMARC failed for ${domain ?? "the sender's domain"}`, fr: `Échec DMARC pour ${domain ?? "le domaine de l’expéditeur"}` },

// vendors.ts — the vendor name stays as is
title: { en: `${v.vendor} classified it as phishing`, fr: `${v.vendor} l’a classé comme hameçonnage` },
```

Where a module builds findings from a rules table (`links/analyze.ts` `FLAG_RULES`, `attachments/analyze.ts` rules), turn the table's `title`/`explanation` into `Text` once; the code that copies them needs no change. Where a sentence is assembled from parts (`explanation: a + (cond ? b : "")`), assemble each language separately.

Consumers: in `FindingsPanel.tsx`, `const pick = usePick();` and render `pick(finding.title)`, `pick(finding.explanation)`. In `markdown.ts`, use `.en` for now (Task 6 localises it).

Tests: replace `.title` with `.title.en` and `.explanation` with `.explanation.en` wherever a test reads them (`grep -rn '\.title\|\.explanation' src/lib --include='*.test.ts'`). Do not change any expected English string.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npm test`
Expected: all pass, including both new tests.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib src/components/FindingsPanel.tsx
git commit -m "Write every finding in French and English"
```

---

### Task 4: The engine's other texts, parser warnings and errors

**Files:**
- Modify: `src/lib/headers/vendors.ts` (`VendorField.meaning`), `src/lib/headers/auth.ts` (`AUTH_SOURCE_NOTE`), `src/lib/score/score.ts` (`BAND_LABEL`), `src/lib/attachments/filetype.ts` (`FileKind.label`), `src/lib/email.ts` (`warnings`), `src/lib/mime/parse.ts`, `src/lib/msg/parse.ts`, `src/lib/msg/rtf.ts`, `src/lib/urls/unwrap.ts`, `src/lib/html/preview.ts`, `src/lib/mime/headers.ts`; their tests; consumers in `src/components/` and `src/lib/report/`.
- Create: `src/lib/i18n/error.ts`

**Interfaces:**
- Consumes: `Text`.
- Produces: `VendorField.meaning: Text | null`; `AUTH_SOURCE_NOTE: Record<…, Text | null>`; `BAND_LABEL: Record<Band, Text>`; `FileKind.label: Text`; `ParsedEmail.warnings: Text[]`; `class TextError extends Error { text: Text }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/msg/parse.test.ts`:

```ts
test("warns in both languages", () => {
  const email = parseMsg(build({
    "/__substg1.0_007D001F": utf16("Subject: x\r\n\r\n"),
    "/__substg1.0_10090102": new Uint8Array(16),
  }));
  assert.match(email.warnings[0].en, /could not be read/);
  assert.match(email.warnings[0].fr, /n’a pas pu être lu/);
});

test("refuses non-Outlook files with a message in both languages", () => {
  assert.throws(
    () => parseMsg(new TextEncoder().encode("not a msg")),
    (err: unknown) => err instanceof TextError && /Outlook/.test(err.text.fr) && err.message === err.text.en,
  );
});
```

(import `TextError` from `../i18n/error.ts`). Append to `src/lib/score/score.test.ts`:

```ts
test("labels every band in both languages", () => {
  assert.deepEqual(BAND_LABEL["likely-phishing"], { en: "Likely phishing", fr: "Hameçonnage probable" });
  assert.deepEqual(BAND_LABEL.clean, { en: "Clean", fr: "Sain" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/msg/parse.test.ts src/lib/score/score.test.ts`
Expected: FAIL — warnings are strings, `TextError` missing, `BAND_LABEL` values are strings.

- [ ] **Step 3: Implement**

`src/lib/i18n/error.ts`:

```ts
import type { Text } from "./text.ts";

/** An error the page shows to the reader: `message` is the English text. */
export class TextError extends Error {
  constructor(readonly text: Text) {
    super(text.en);
  }
}
```

Every `throw new Error("…")` that the page displays (`mime/parse.ts`, `msg/parse.ts`) becomes `throw new TextError({ en: "…", fr: "…" })`. `ParsedEmail.warnings` becomes `Text[]`; each `warnings.push("…")` pushes a `Text`. `BAND_LABEL`, `AUTH_SOURCE_NOTE`, the `SFV`/`CAT`/`IPV`/`DIR`/`SFTY` meaning tables and the `sclMeaning`/`bclMeaning` returns, `KINDS[*].label` and the remaining sentences in `rtf.ts`, `unwrap.ts`, `preview.ts`, `mime/headers.ts` become `Text`. Then follow `npx tsc --noEmit` through the consumers: components render with `usePick()`, `markdown.ts` and `json.ts` use `.en` until Task 6. In `src/app/page.tsx`, the catch shows `err instanceof TextError ? pick(err.text) : String(err)` inside the translated prefix added in Task 5. Existing tests reading these values move to `.en`.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Write warnings, labels and gateway meanings in both languages"
```

---

### Task 5: Every interface string in the dictionaries

**Files:**
- Modify: `src/i18n/messages.ts`; `src/components/EntryPanel.tsx`, `ReportView.tsx`, `VerdictBlock.tsx`, `FindingsPanel.tsx`, `SeverityTag.tsx`, `Tabs.tsx`, `HeadersTab.tsx`, `LinksTab.tsx`, `AttachmentsTab.tsx`, `IocsTab.tsx`, `PreviewTab.tsx`, `RawTab.tsx`, `ExportBar.tsx`, `CopyButton.tsx`, `SettingsPanel.tsx`, `Footer.tsx`; `src/app/page.tsx` (status and error texts); `src/lib/format.ts` (`formatSize`) and its callers.

**Interfaces:**
- Consumes: `useT`, `useLocale`, `usePick` (Task 2).
- Produces: `formatSize(bytes: number, locale: Locale = "en"): string`; one key group per component in `messages.ts` (`entry`, `report`, `verdict`, `findings`, `severity`, `tabs`, `headers`, `links`, `attachments`, `iocs`, `preview`, `raw`, `exportBar`, `copy`, `settings`, `footer`, `page`).

- [ ] **Step 1: Write the failing test for sizes**

Append to `src/lib/format.test.ts`:

```ts
test("formats sizes in the reader's language", () => {
  assert.equal(formatSize(6656, "en"), "6.5 KB");
  assert.equal(formatSize(6656, "fr"), "6,5\u00a0Ko");
  assert.equal(formatSize(512, "fr"), "512\u00a0o");
  assert.equal(formatSize(3 * 1024 * 1024, "fr"), "3,0\u00a0Mo");
  assert.equal(formatSize(6656), "6.5 KB");
});
```

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/format.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `formatSize`**

```ts
export function formatSize(bytes: number, locale: Locale = "en"): string {
  const [b, kb, mb, sep] = locale === "fr" ? ["o", "Ko", "Mo", "\u00a0"] : ["B", "KB", "MB", " "];
  const one = (n: number) => (locale === "fr" ? n.toFixed(1).replace(".", ",") : n.toFixed(1));
  if (bytes < 1024) return `${bytes}${sep}${b}`;
  if (bytes < 1024 * 1024) return `${one(bytes / 1024)}${sep}${kb}`;
  return `${one(bytes / 1024 / 1024)}${sep}${mb}`;
}
```

Callers in components pass `useLocale()`.

- [ ] **Step 3: Move every literal, component by component**

For each component listed: add `const t = useT();`, move every visible literal (headings, labels, buttons, placeholders, `aria-label`, `title`, empty states, counters) into the component's key group in **both** `en` and `fr`, and render `t.group.key`. Parametrised strings are functions in the dictionary:

```ts
// en
findings: { heading: (n: number) => `Findings · ${n}`, none: "No finding" },
// fr
findings: { heading: (n: number) => `Constats · ${n}`, none: "Aucun constat" },
```

The smoke test expects some English strings verbatim ("No finding", "Link text shows another destination", "matches the body", …): keep those English strings unchanged. Run `npx tsc --noEmit` after each component; it catches a key added to one language only.

When a component is done, grep it for leftovers: `grep -nE '>[^<{]*[A-Za-z]{3,}[^<{]*<|"[A-Z][a-z]+ [a-z]' src/components/<File>.tsx` must show only class names, proper names and technical tokens.

- [ ] **Step 4: Check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run smoke`
Expected: all pass (the smoke test runs in English). Then `npm run dev`, switch to FR, open `fixtures/spoofed-invoice.eml`, go through every tab and the settings: no English left except proper names, technical tokens and text quoted from the email.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Translate the interface"
```

---

### Task 6: Reports in the reader's language

**Files:**
- Modify: `src/lib/report/markdown.ts`, `src/lib/report/json.ts`, `src/lib/report/report.test.ts`, `src/components/ExportBar.tsx`

**Interfaces:**
- Consumes: `Text`, `Locale`, `BAND_LABEL` (Task 4), `formatSize(bytes, locale)` (Task 5).
- Produces: `ReportInput.locale?: Locale` (default `"en"`, so existing callers and tests are unchanged); `reportJson` emits every `Text` as `{ en, fr }` and `verdict.label` as a `Text`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/report/report.test.ts` (it already defines `spoofed()`, which builds the input for the spoofed invoice):

```ts
test("writes the Markdown report in French", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: true, locale: "fr" });
  assert.match(md, /^## Authentification$/m);
  assert.match(md, /^\*\*Verdict\u00a0:\*\* Indicateurs malveillants — score 100\/100$/m);
  assert.match(md, /Le texte du lien montre une autre destination/);
  assert.match(md, /ne remplace pas l’analyse d’une personne qualifiée/);
  assert.doesNotMatch(md, /^## Authentication$/m);
});

test("stays in English by default", async () => {
  const md = reportMarkdown({ ...(await spoofed()), defang: true });
  assert.match(md, /^## Authentication$/m);
  assert.match(md, /^\*\*Verdict:\*\* Malicious indicators — score 100\/100$/m);
});

test("JSON carries every language", async () => {
  const json = JSON.parse(reportJson(await spoofed()));
  assert.deepEqual(Object.keys(json.verdict.label).sort(), ["en", "fr"]);
  assert.equal(typeof json.findings[0].title.fr, "string");
});
```

The French closing warning, in full: *Perspicax est une aide à la décision\u00a0: son verdict repose sur des heuristiques, peut se tromper dans un sens comme dans l’autre, et ne remplace pas l’analyse d’une personne qualifiée.*

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/report/report.test.ts`
Expected: FAIL — `locale` is ignored, headings are English.

- [ ] **Step 3: Implement**

In `markdown.ts`: add `locale?: Locale` to `ReportInput` and read `const locale = input.locale ?? "en"`; a local `const L = { en: {…}, fr: {…} }[locale]` holding every heading, label, table header, `SEVERITY_LABEL`, `IOC_HEADING` and the closing warning; finding texts, warnings, band labels and meanings through `text[locale]`; `formatSize(…, locale)`. In `json.ts`: nothing to translate, only check it now passes `Text` values through (it does, since `findings` are spread). `ExportBar`: pass `locale: useLocale()` to `reportMarkdown`.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report src/components/ExportBar.tsx
git commit -m "Write the Markdown report in the reader's language"
```

---

### Task 7: The legal notice in both languages

**Files:**
- Modify: `src/app/mentions-legales/page.tsx`, `src/app/globals.css`
- Create: `src/components/LegalShell.tsx`

**Interfaces:**
- Consumes: `useSettings` (`locale`, `setLocale`), `LocaleSwitch`, `LocaleProvider`.
- Produces: nothing used elsewhere.

- [ ] **Step 1: Two articles, one shown**

Keep the page a server component. Move the current French body into `<article lang="fr" data-locale="fr">` unchanged. Add `<article lang="en" data-locale="en">` with the English translation of every section (Publisher, Host, Disclaimer — the tool's limits, Personal data, Source code), opening with:

> *This translation is provided for convenience; the French text is the legally binding one.*

The `<main>` loses its `lang="fr"`. Append to `globals.css`:

```css
/* The legal notice holds both languages; <html lang> picks one, before first paint. */
html[lang="fr"] [data-locale="en"],
html:not([lang="fr"]) [data-locale="fr"] {
  display: none;
}
```

Both titles go in the `<h1>` the same way (`<span data-locale="fr">Mentions légales et confidentialité</span><span data-locale="en">Legal notice and privacy</span>`). The prerendered `metadata.title` stays the French one; `LegalShell` (Step 2) sets `document.title` in an effect from `t.legal.title` (*Mentions légales et confidentialité — Perspicax* / *Legal notice and privacy — Perspicax*), so the tab follows the language.

- [ ] **Step 2: The switch on this page**

`src/components/LegalShell.tsx` (client) takes `children`, reads `locale` and `setLocale` from `useSettings()`, and renders inside `<LocaleProvider locale={locale}>`: the page's existing header (wordmark link to `/`) with `<LocaleSwitch locale={locale} onChange={setLocale} />` at its right, then `children`, then `<Footer />`. The page renders `<LegalShell>{articles}</LegalShell>` in place of its own header and footer. The footer's "Mentions légales" link label becomes `t.footer.legal` (*Mentions légales* / *Legal notice*), which is why `Footer` must sit inside a `LocaleProvider` on both pages (on the home page it already does since Task 2).

- [ ] **Step 3: Check, with the smoke test reading each language**

The smoke browser is English, so the French article is now hidden, and `innerText` skips hidden text: update `scripts/smoke.mjs` where it checks the legal notice. Load it once with `loadWithSettings({ theme, locale: "fr" })`, navigate to `${base}mentions-legales` and check the three French statements already listed; then once with `loadWithSettings({ theme, locale: "en" })` and check `"Vercel Inc."`, `"contact.azlobaki@pm.me"` and `"the French text is the legally binding one"`.

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run smoke`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/mentions-legales src/app/globals.css src/components/LegalShell.tsx src/components/Footer.tsx src/i18n/messages.ts scripts/smoke.mjs
git commit -m "Offer the legal notice in English, the French text binding"
```

---

### Task 8: Browser checks in French, and the README

**Files:**
- Modify: `scripts/smoke.mjs`, `README.md`

- [ ] **Step 1: French in the smoke test**

In `scripts/smoke.mjs`, after the existing loops:

1. **First visit from a French browser.** `await page("Emulation.setLocaleOverride", { locale: "fr-FR" })` and `await page("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0", acceptLanguage: "fr-FR,fr" })`; clear storage (`await load(\`${base}smoke-blank\`); await evaluate("localStorage.clear()")`); `await load(base)`; wait 1.5 s; fail unless `document.documentElement.lang === "fr"`, the page shows "Réglages", and `localStorage.length === 0`. Then reset both overrides (`setLocaleOverride` with `{}`, user agent with `acceptLanguage: "en-US,en"`).
2. **Every theme in French.** For each theme: `loadWithSettings({ theme, locale: "fr" })`, open `spoofed-invoice.eml`, click every tab; fail if the visible text contains any of `["Risk score", "Findings", "Relay chain", "Safe preview", "Raw source", "New email", "Settings", "Organisation domains", "Link text shows another destination"]`, or lacks any of `["Réglages", "Indicateurs malveillants", "Le texte du lien montre une autre destination", "Chaîne de relais"]`. Screenshot `${theme}-fr.png`. No external request (the existing counter already covers it).

Use the exact French strings the dictionaries ended up with in Tasks 3–5 for the "lacks" list.

- [ ] **Step 2: Run it**

Run: `npm run build && npm run smoke`
Expected: `Smoke test passed`, screenshots `*-fr.png` in `.smoke/` reading French throughout.

- [ ] **Step 3: README**

In `README.md`: under *What it checks* add a line *"In French or English: the browser's language on the first visit, then the FR | EN switch in the top bar (saved with the settings)."*; in *Only settings are stored*, list the language among the settings; in the project layout add `src/i18n/` (*interface dictionaries, locale context*) and `lib/i18n/` (*locale, two-language texts*).

- [ ] **Step 4: Full check and commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run smoke`
Expected: everything passes.

```bash
git add scripts/smoke.mjs README.md
git commit -m "Check the French interface in the browser test; document the languages"
```
