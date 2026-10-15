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

/** The browser's languages, from `navigator`: some browsers leave `languages` empty and set only `language`. */
export function browserLanguages(nav: { languages?: readonly string[]; language?: string }): readonly string[] {
  return nav.languages?.length ? nav.languages : [nav.language ?? ""];
}
