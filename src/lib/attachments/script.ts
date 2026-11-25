/** What the scripts of an HTML or SVG attachment do, read without running them. */
export type WebScriptInfo = {
  /** Addresses in script sources and code, decoded strings included. */
  urls: string[];
  /** The page sends the browser elsewhere by script. */
  redirects: boolean;
  /** Services that receive what is typed: chat bots, webhooks, form relays. */
  exfiltration: string[];
  /** For an SVG: what makes it more than an image. */
  svgActive: string[];
};

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const HANDLER = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const URL_IN_CODE = /https?:\/\/[^\s"'`<>\\)]+/g;
const REDIRECT =
  /\b(?:(?:window|document|top|self|parent)\.)?location(?:\.href)?\s*=(?!=)|\blocation\.(?:replace|assign)\s*\(|\bwindow\.open\s*\(/;
const EXFILTRATION: [RegExp, string][] = [
  [/api\.telegram\.org\/bot/i, "api.telegram.org/bot"],
  [/discord(?:app)?\.com\/api\/webhooks/i, "discord.com/api/webhooks"],
  [/hooks\.slack\.com\/services/i, "hooks.slack.com/services"],
  [/formspree\.io/i, "formspree.io"],
  [/getform\.io/i, "getform.io"],
  [/submit-form\.com/i, "submit-form.com"],
  [/formsubmit\.co/i, "formsubmit.co"],
  [/webhook\.site/i, "webhook.site"],
  [/ntfy\.sh/i, "ntfy.sh"],
  [/pipedream\.net/i, "pipedream.net"],
];
const MAX_URLS = 50;

function safely(decode: () => string): string | null {
  try {
    return decode();
  } catch {
    return null;
  }
}

/** Literal strings the code decodes at run time: atob("…"), unescape("…"), String.fromCharCode(…). */
function decodedStrings(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\batob\(\s*["'`]([A-Za-z0-9+/=\s_-]{8,})["'`]\s*\)/g)) {
    const text = safely(() => new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    if (text) out.push(text);
  }
  for (const m of code.matchAll(/\b(?:unescape|decodeURIComponent|decodeURI)\(\s*["'`]([^"'`]{6,})["'`]\s*\)/g)) {
    const text = safely(() => decodeURIComponent(m[1]));
    if (text) out.push(text);
  }
  for (const m of code.matchAll(/\bString\.fromCharCode\(\s*([\d\s,]+)\)/g)) {
    out.push(String.fromCharCode(...m[1].split(",").map((n) => Number(n.trim())).filter((n) => n > 0 && n < 0x10000)));
  }
  return out;
}

/**
 * Phishing pages sent as HTML or SVG attachments do their work in script:
 * they send the browser to a kit decoded at the last moment, and post
 * what is typed to a chat bot or a form relay, so they need no server.
 * Strings are decoded, never evaluated.
 */
export function inspectWebScripts(text: string, kind: "html" | "svg"): WebScriptInfo {
  const scripts = [...text.matchAll(SCRIPT)];
  const handlers = [...text.matchAll(HANDLER)].map((m) => m[1] ?? m[2] ?? "");
  const code = [...scripts.map((m) => m[2]), ...handlers].join("\n");
  const decoded = decodedStrings(code);
  const readable = [code, ...decoded].join("\n");

  const urls: string[] = [];
  for (const m of scripts) {
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1];
    if (src && /^https?:\/\//i.test(src)) urls.push(src);
  }
  for (const m of readable.matchAll(URL_IN_CODE)) urls.push(m[0]);

  const svgActive: string[] = [];
  if (kind === "svg") {
    if (scripts.length > 0) svgActive.push("script");
    if (handlers.length > 0) svgActive.push("event handler");
    if (/<foreignObject\b/i.test(text)) svgActive.push("embedded HTML");
    if (/href\s*=\s*["']\s*javascript:/i.test(text)) svgActive.push("javascript: link");
  }
  return {
    urls: [...new Set(urls)].slice(0, MAX_URLS),
    redirects: REDIRECT.test(readable),
    exfiltration: EXFILTRATION.filter(([pattern]) => pattern.test(readable) || pattern.test(text)).map(([, label]) => label),
    svgActive,
  };
}
