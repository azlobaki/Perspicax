import { isLocale, LOCALES, type Locale } from "./i18n/text.ts";
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
  /** Interface language; null follows the browser. */
  locale: Locale | null;
  /** The analyst's own domains: spoofing them weighs more, lookalikes of them are flagged. */
  orgDomains: string[];
  /** People a fraudster would impersonate (executives, finance): their name on an outside address is flagged. */
  vipNames: string[];
  /** Defang indicators by default when displaying, copying and reporting. */
  defang: boolean;
  pivots: PivotService[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  locale: null,
  orgDomains: [],
  vipNames: [],
  defang: true,
  pivots: DEFAULT_PIVOTS,
};

const MAX_DOMAINS = 50;
const MAX_VIPS = 100;

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

/** A first and a last name, spaces tidied; null for anything shorter, which would match too much. */
export function normaliseVipName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length > 80) return null;
  const words = name.split(" ").filter((word) => /\p{L}.*\p{L}/u.test(word));
  return words.length >= 2 ? name : null;
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
  const vips = new Map<string, string>();
  for (const value of Array.isArray(raw.vipNames) ? raw.vipNames : []) {
    const name = typeof value === "string" ? normaliseVipName(value) : null;
    if (name && !vips.has(name.toLowerCase())) vips.set(name.toLowerCase(), name);
  }
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_THEME,
    locale: isLocale(raw.locale) ? raw.locale : null,
    orgDomains: [...new Set(domains)].slice(0, MAX_DOMAINS),
    vipNames: [...vips.values()].slice(0, MAX_VIPS),
    defang: typeof raw.defang === "boolean" ? raw.defang : true,
    pivots: "pivots" in raw ? parsePivots(raw.pivots) : DEFAULT_PIVOTS,
  };
}

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
