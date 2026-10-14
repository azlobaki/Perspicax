# Perspicax — French and English (i18n)

Date: 2026-10-14 · Status: draft, awaiting review

Perspicax is English-only today, apart from its French legal notice. This
change makes every visible text available in French and English, picked from
the browser's language on the first visit and switchable at any time. Innomi
follows with the same mechanism in a separate, shorter spec.

## 1. Decisions

| Question | Decision |
|---|---|
| Languages | English and French. English is the fallback for any other browser language. |
| How the language is chosen | Same URL. First visit: `navigator.language` starting with `fr` gives French, anything else English. A FR \| EN switch in the top bar overrides it, and the choice is saved with the other settings. |
| Translations | Written by hand and shipped with the page. No machine translation: the page makes no network request and its CSP forbids any. |
| Engine texts (findings, warnings…) | The engine writes each sentence in both languages, where it writes it today; the UI shows one. |
| Markdown report | In the interface's language. |
| JSON report | Language-neutral: finding ids as today, every text with both languages. |
| Legal notice | Both languages; the English version says the French text is the binding one. |
| Libraries | None. Two languages on a static page need a typed dictionary, not next-intl or i18next. |

### Why the engine writes both languages

Three ways were considered:

- **Ids and parameters only, translated by the UI.** The cleanest separation,
  but about 120 sentences would leave the code that knows what they mean for a
  catalogue, each with its own parameter plumbing.
- **A `locale` option passed to the engine.** Keeps sentences in place, but
  parser warnings are written when the file is read, before any analysis: a
  language switch would mean re-reading the email, and every module would need
  the option threaded through.
- **Both languages in place (chosen).** `title: { en: "…", fr: "…" }` where
  `title: "…"` is today. No locale enters the engine, switching language
  re-renders without re-analysing, and the JSON export stays neutral. The cost
  is mechanical: tests reading `finding.title` read `finding.title.en`; the
  English text itself does not change.

## 2. Types and storage

```ts
// src/lib/i18n/text.ts
export type Locale = "en" | "fr";
export const LOCALES: readonly Locale[] = ["en", "fr"];
/** A sentence in every supported language. */
export type Text = Record<Locale, string>;
/** First-visit language: French for any fr-* browser, English otherwise. */
export function detectLocale(languages: readonly string[]): Locale;
```

- `Settings` gains `locale: Locale | null` — null means "follow the browser".
  It is written only when the switch is used, like every other setting, and
  `parseSettings` drops anything that is not a known locale. *Reset settings*
  returns to null.
- The boot script that already sets `data-theme` before first paint also sets
  `<html lang>`: the saved locale, else `detectLocale(navigator.languages)`.

## 3. Engine (`src/lib/`)

Every text field meant for a reader becomes a `Text`:

| Where | Fields |
|---|---|
| `finding.ts` | `Finding.title`, `Finding.explanation` (`evidence` stays raw: it quotes the email) |
| `headers/vendors.ts` | `VendorField.meaning` (SFV, CAT, SCL… meanings) |
| `headers/auth.ts` | `AUTH_SOURCE_NOTE` |
| `score/score.ts` | `BAND_LABEL` |
| `attachments/filetype.ts` | type descriptions ("Windows program"…) |
| `mime/parse.ts`, `msg/parse.ts` | `ParsedEmail.warnings: Text[]` |
| `msg/rtf.ts`, `urls/unwrap.ts`, `html/preview.ts`, `dkim/bodyhash.ts`, `headers/date.ts`, `headers/received.ts` | any reader-facing sentence they produce |

Interpolated values stay template literals inside each language:
`{ en: \`DMARC failed for ${d}\`, fr: \`Échec DMARC pour ${d}\` }`.
Errors thrown for unreadable files (`throw new Error(…)`) are caught by the
page and shown to the user, so they carry a `Text` too (a small `TextError`
class with a `text` field; `message` stays the English text).

Finding ids, weights, categories, bands and every structured field are
unchanged.

## 4. Interface

- `src/i18n/messages.ts`: `const en = { … }` and `const fr: typeof en = { … }`.
  Missing or extra keys fail the type check. Values are strings or small
  functions for plurals and parameters (`findings: (n) => …`).
- `useLocale()` / `useT()`: a React context fed from settings (or the
  detected locale when none is saved). `useT()` returns the dictionary;
  `pick(text)` returns the current language of an engine `Text`.
- `LocaleSwitch` next to `ThemeSwitch` in the top bar, same look: two buttons,
  `aria-pressed`, labels "FR" and "EN", `lang` set on each.
- `formatSize` takes the locale: "6.5 KB" in English, "6,5 Ko" in French.
  Dates keep their current ISO-like format in both languages.
- Theme names (Suisse, Console, Dossier), service names (VirusTotal…) and
  indicator types (url, domain, sha256…) are proper names or technical tokens
  and stay as they are.

**First paint.** The page is prerendered in English. For a French visitor,
`html[lang="fr"]` hides the app's main content until the app has applied the
locale (one frame), so English never flashes. The app needs JavaScript to do
anything, so nothing usable is lost if it fails.

## 5. Reports

- **Markdown** takes the locale: headings, labels and verdict in that
  language, finding texts through `pick`. The decision-support warning that
  closes the report is translated.
- **JSON** keeps its structure; `Text` fields appear as `{ "en": …, "fr": … }`.
  `verdict.label` becomes a `Text` as well.

## 6. Legal notice

`/mentions-legales` renders both versions, each in an `<article lang>`; CSS
keyed on `html[lang]` shows one. It stays a static page with no flash and no
extra script. It gets the same `LocaleSwitch`. The English version opens
with: *"This translation is provided for convenience; the French text is the
legally binding one."* The page title follows the language.

## 7. Testing

- **Type check**: the French dictionary must have exactly the English one's
  shape; every `Text` must have both languages.
- **Unit**: `detectLocale`; `parseSettings` with valid, invalid and missing
  `locale`; the boot script picks saved, then browser, then English; existing
  engine tests read `.en`; a few tests assert French texts on fixtures (the
  spoofed invoice, the payroll diversion, the RTF `.msg`), and one walks every
  finding of every fixture checking that both languages are non-empty.
- **Markdown**: one report per language, snapshot of headings and verdict.
- **Browser smoke**: each fixture runs in English as today; one fixture per
  theme also runs in French and fails if any of a list of interface strings
  in English ("Risk score", "Findings", "Relay chain", "Safe preview",
  "Organisation domains"…) is still on screen, or if the French ones are
  missing. A first visit with a French browser (`Emulation.setLocaleOverride`)
  must come up in French and still write nothing to `localStorage`. The legal
  notice is checked in both languages.

## 8. Order of work

1. Foundation: `Text`, `Locale`, `detectLocale`, `settings.locale`, boot
   script, context, `LocaleSwitch`, empty dictionaries wired in.
2. Engine texts to `Text`, module by module, tests moved to `.en` as each
   module changes.
3. Interface strings into the dictionaries, component by component.
4. Markdown and JSON reports.
5. Legal notice in both languages.
6. French-language tests, smoke test in French, README.

## 9. Out of scope

- Languages other than French and English (the types make a third one a
  dictionary and a column away, not a redesign).
- Separate URLs per language, and search-engine metadata per language.
- Translating the email itself, or anything quoted from it.
