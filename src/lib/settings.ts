import { IOC_TYPES, type IocType } from "./ioc/types.ts";
import { isIPv4 } from "./net/ip.ts";
import { DEFAULT_PIVOTS, type PivotService } from "./pivots/pivots.ts";

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

export type Settings = {
  theme: Theme;
  /** The analyst's own domains: spoofing them weighs more, lookalikes of them are flagged. */
  orgDomains: string[];
  /** Defang indicators by default when displaying, copying and reporting. */
  defang: boolean;
  pivots: PivotService[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  orgDomains: [],
  defang: true,
  pivots: DEFAULT_PIVOTS,
};

const MAX_DOMAINS = 50;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** `https://www.Example.com/x`, `user@example.com`, `*.example.com` → the bare domain; null if it is not one. */
export function normaliseDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/^.*@/, "")
    .replace(/[/?#:].*$/, "")
    .replace(/\.$/, "");
  if (!value || /\s/.test(value)) return null;
  let host: string;
  try {
    host = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !isIPv4(host) ? host : null;
}

export function isValidTemplate(template: string): boolean {
  return /^https?:\/\/\S+$/i.test(template) && /\{(value|raw|base64url)\}/.test(template);
}

export function parsePivots(value: unknown): PivotService[] {
  if (!Array.isArray(value)) return DEFAULT_PIVOTS;
  const pivots: PivotService[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const types = Array.isArray(p.types)
      ? p.types.filter((t): t is IocType => (IOC_TYPES as readonly unknown[]).includes(t))
      : [];
    if (typeof p.name !== "string" || !p.name.trim()) continue;
    if (typeof p.template !== "string" || !isValidTemplate(p.template) || types.length === 0) continue;
    pivots.push({
      id: typeof p.id === "string" && p.id ? p.id : `custom-${pivots.length + 1}`,
      name: p.name.trim(),
      types,
      template: p.template,
    });
  }
  return pivots;
}

/**
 * Values coming out of localStorage are untrusted (hand-edited, from an older
 * version, or plain corrupted), so every field is re-checked before use.
 */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const raw = value as Record<string, unknown>;
  const domains = Array.isArray(raw.orgDomains)
    ? raw.orgDomains
        .filter((d): d is string => typeof d === "string")
        .map(normaliseDomain)
        .filter((d): d is string => d !== null)
    : [];
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_THEME,
    orgDomains: [...new Set(domains)].slice(0, MAX_DOMAINS),
    defang: typeof raw.defang === "boolean" ? raw.defang : true,
    pivots: "pivots" in raw ? parsePivots(raw.pivots) : DEFAULT_PIVOTS,
  };
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
