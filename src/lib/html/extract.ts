import { cssUrls, HIDDEN_PHRASES, hiddenReason, normaliseColor, parseStyle, parseStylesheet, type StyleRules } from "./style.ts";

export type HtmlOrigin = "a" | "area" | "form" | "img" | "css" | "link" | "meta-refresh" | "frame" | "media";

export type HtmlLink = {
  origin: HtmlOrigin;
  /** Attribute value as written. */
  raw: string;
  /** Visible text of a link, alt text of an image or map area. */
  text: string | null;
  /** Why the reader cannot see it, or null. */
  hidden: string | null;
  /** Declared size, for images. */
  width: number | null;
  height: number | null;
};

export type HtmlForm = { action: string; method: string; fields: string[]; hasPassword: boolean };

export type HtmlExtract = {
  base: string | null;
  links: HtmlLink[];
  forms: HtmlForm[];
  /** Visible words with invisible characters inside, shown with `·`. */
  brokenWords: string[];
  /** Unicode direction overrides in visible text. */
  bidiOverrides: number;
};

const SKIP_TEXT = new Set(["script", "style", "head", "title", "noscript", "template"]);
const INVISIBLE = /[​‌⁠﻿­]/g;
const BROKEN_WORD = /[A-Za-zÀ-ɏ]+(?:[​‌⁠﻿­]+[A-Za-zÀ-ɏ]+)+/g;
const BIDI_OVERRIDE = /[‪-‮⁦-⁩]/g;
const SHOW_TEXT = 4;

function cleanText(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t || null;
}

function dimension(el: Element, name: "width" | "height"): number | null {
  const attr = el.getAttribute(name);
  const fromStyle = parseStyle(el.getAttribute("style") ?? "").get(name);
  const value = attr ?? (fromStyle && /^\d+(\.\d+)?(px)?$/.test(fromStyle) ? fromStyle : null);
  if (value === null) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Text colour and background colour in effect for an element, from inline styles and legacy attributes. */
function effectiveColors(el: Element): { color: string | null; background: string | null } {
  let color: string | null = null;
  let background: string | null = null;
  for (let node: Element | null = el; node && (color === null || background === null); node = node.parentElement) {
    const style = parseStyle(node.getAttribute("style") ?? "");
    color ??= normaliseColor(style.get("color")) ?? normaliseColor(node.tagName.toLowerCase() === "font" ? node.getAttribute("color") : null);
    background ??=
      normaliseColor(style.get("background-color")) ??
      (style.get("background") ?? "").split(/\s+/).map(normaliseColor).find((c) => c !== null) ??
      normaliseColor(node.getAttribute("bgcolor"));
  }
  return { color, background };
}

export function extractHtml(doc: Document): HtmlExtract {
  const sheets = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  const rules: StyleRules = parseStylesheet(sheets);
  const cache = new Map<Element, string | null>();

  const ownHidden = (el: Element): string | null => {
    if (el.hasAttribute("hidden")) return HIDDEN_PHRASES.attribute;
    const id = el.getAttribute("id");
    const keys = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).map((c) => `.${c}`);
    if (id) keys.push(`#${id}`);
    // Responsive mail hides a variant inline and shows it again in a media query.
    if (keys.some((key) => rules.revealed.has(key))) return null;
    const inline = hiddenReason(parseStyle(el.getAttribute("style") ?? ""));
    if (inline) return inline;
    for (const key of keys) {
      const reason = rules.hidden.get(key);
      if (reason) return reason;
    }
    return null;
  };

  const hiddenOf = (el: Element | null): string | null => {
    if (el === null) return null;
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    const reason = ownHidden(el) ?? hiddenOf(el.parentElement);
    cache.set(el, reason);
    return reason;
  };

  const links: HtmlLink[] = [];
  const forms: HtmlForm[] = [];
  const add = (origin: HtmlOrigin, raw: string | null, el: Element | null, text: string | null = null) => {
    if (raw && raw.trim()) {
      links.push({ origin, raw: raw.trim(), text, hidden: el ? hiddenOf(el) : null, width: null, height: null });
    }
  };
  const addImage = (raw: string | null, el: Element) => {
    if (raw && raw.trim()) {
      links.push({
        origin: "img", raw: raw.trim(), text: cleanText(el.getAttribute("alt")), hidden: hiddenOf(el),
        width: dimension(el, "width"), height: dimension(el, "height"),
      });
    }
  };

  for (const el of doc.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "a": {
        const href = el.getAttribute("href");
        if (href && href.trim()) {
          const { color, background } = effectiveColors(el);
          const sameColour = color !== null && color === background ? HIDDEN_PHRASES.sameColour : null;
          links.push({
            origin: "a", raw: href.trim(), text: cleanText(el.textContent),
            hidden: hiddenOf(el) ?? sameColour, width: null, height: null,
          });
        }
        break;
      }
      case "area":
        add("area", el.getAttribute("href"), el, cleanText(el.getAttribute("alt")));
        break;
      case "form": {
        const fields = [...el.querySelectorAll("input, select, textarea")];
        forms.push({
          action: (el.getAttribute("action") ?? "").trim(),
          method: (el.getAttribute("method") ?? "get").toLowerCase(),
          fields: fields.map((f) => f.getAttribute("name") ?? f.getAttribute("type") ?? f.tagName.toLowerCase()),
          hasPassword: fields.some((f) => (f.getAttribute("type") ?? "").toLowerCase() === "password"),
        });
        add("form", el.getAttribute("action"), el);
        break;
      }
      case "img":
        addImage(el.getAttribute("src"), el);
        break;
      case "input":
        if ((el.getAttribute("type") ?? "").toLowerCase() === "image") addImage(el.getAttribute("src"), el);
        break;
      case "link":
        add("link", el.getAttribute("href"), el);
        break;
      case "meta":
        if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh") {
          add("meta-refresh", /url\s*=\s*['"]?([^'"]+)/i.exec(el.getAttribute("content") ?? "")?.[1] ?? null, el);
        }
        break;
      case "iframe":
      case "frame":
      case "embed":
        add("frame", el.getAttribute("src"), el);
        break;
      case "object":
        add("frame", el.getAttribute("data"), el);
        break;
      case "video":
      case "audio":
      case "source":
      case "track":
        add("media", el.getAttribute("src"), el);
        if (tag === "video") add("img", el.getAttribute("poster"), el);
        break;
    }
    const background = el.getAttribute("background");
    if (background) addImage(background, el);
    const style = el.getAttribute("style");
    if (style) for (const url of cssUrls(style)) add("css", url, el);
  }
  for (const url of cssUrls(sheets)) add("css", url, null);

  // Only text a reader can actually see is checked for invisible tricks.
  // Adjacent text nodes of one element are joined as is (a parser may split
  // text at entities); text from different elements is kept apart.
  let visible = "";
  let previous: Element | null = null;
  const root = doc.body ?? doc.documentElement;
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName.toLowerCase()) || hiddenOf(parent)) continue;
    visible += `${parent === previous ? "" : " "}${node.textContent ?? ""}`;
    previous = parent;
  }

  return {
    base: doc.querySelector("base[href]")?.getAttribute("href") ?? null,
    links,
    forms,
    brokenWords: [...new Set([...visible.matchAll(BROKEN_WORD)].map((m) => m[0].replace(INVISIBLE, "·")))],
    bidiOverrides: (visible.match(BIDI_OVERRIDE) ?? []).length,
  };
}
