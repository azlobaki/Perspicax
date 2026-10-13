/** Inline declarations, lowercased, `!important` dropped. Later declarations win. */
export function parseStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).replace(/!important/gi, "").trim().toLowerCase();
    map.set(name, value);
  }
  return map;
}

const ZERO = /^-?0*\.?0*(px|pt|em|rem|ex|ch|vw|vh|%)?$/;

function isZero(value: string | undefined): boolean {
  return value !== undefined && value !== "" && ZERO.test(value);
}

function isFarOff(value: string | undefined): boolean {
  const n = parseFloat(value ?? "");
  return !Number.isNaN(n) && n <= -500;
}

/** Why these declarations make an element invisible to the reader, or null. */
export function hiddenReason(style: Map<string, string>): string | null {
  const get = (name: string) => style.get(name);
  if (get("display") === "none") return "display:none";
  if (get("visibility") === "hidden" || get("visibility") === "collapse") return "visibility:hidden";
  if (isZero(get("opacity"))) return "opacity:0";
  if (isZero(get("font-size"))) return "font-size:0";
  if (
    get("overflow") === "hidden" &&
    (isZero(get("max-height")) || isZero(get("height")) || isZero(get("max-width")) || isZero(get("width")))
  ) {
    return "zero size";
  }
  const positioned = get("position") === "absolute" || get("position") === "fixed";
  if ((positioned && (isFarOff(get("left")) || isFarOff(get("top")))) || isFarOff(get("text-indent"))) return "off-screen";
  return null;
}

const NAMED_COLORS: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", yellow: "#ffff00", navy: "#000080",
};

/** `#rrggbb`, or null for anything that is not a plain colour (transparent, gradients…). */
export function normaliseColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  const short = /^#([0-9a-f]{3})$/.exec(v);
  if (short) return `#${[...short[1]].map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

export type StyleRules = {
  /** `.class` / `#id` → why rules outside media queries hide it. */
  hidden: Map<string, string>;
  /** `.class` / `#id` that a media query shows again (responsive mail). */
  revealed: Set<string>;
};

const MEDIA_BLOCK = /@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g;

function rules(css: string): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** The class or id each selector finally targets: `td .hide` → `.hide`. */
function targets(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim().split(/\s+/).pop() ?? "")
    .map((compound) => /([.#][\w-]+)$/.exec(compound)?.[1] ?? "")
    .filter(Boolean);
}

export function parseStylesheet(css: string): StyleRules {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const revealed = new Set<string>();
  for (const block of text.matchAll(MEDIA_BLOCK)) {
    for (const [selector, declarations] of rules(block[1])) {
      const style = parseStyle(declarations);
      const display = style.get("display");
      const height = style.get("max-height");
      if ((display !== undefined && display !== "none") || (height !== undefined && !isZero(height))) {
        for (const key of targets(selector)) revealed.add(key);
      }
    }
  }
  const hidden = new Map<string, string>();
  for (const [selector, declarations] of rules(text.replace(MEDIA_BLOCK, ""))) {
    const reason = hiddenReason(parseStyle(declarations));
    if (reason) for (const key of targets(selector)) hidden.set(key, reason);
  }
  return { hidden, revealed };
}

/** Every resource a stylesheet or style attribute would fetch. */
export function cssUrls(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map((m) => m[2].trim());
  const imports = [...css.matchAll(/@import\s+(['"])(.*?)\1/gi)].map((m) => m[2].trim());
  return [...urls, ...imports];
}
