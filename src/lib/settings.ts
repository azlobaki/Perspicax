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
