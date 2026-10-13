import type { Attachment } from "../email.ts";
import { bytesToBinary } from "../mime/bytes.ts";

/** Inside the preview frame, nothing may load except inline styles and data: images. */
export const PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

const REMOVED = "script, noscript, iframe, frame, frameset, object, embed, applet, portal, link, meta, base, template";
const SOURCE_ATTRIBUTES = ["src", "background", "poster", "data"];
const MAX_INLINE_IMAGE = 2_000_000;

// Shown in place of every remote image; scaled to the image's declared size.
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='48'><rect width='100%' height='100%' fill='#e4e4e0'/>" +
      "<text x='50%' y='56%' font-family='sans-serif' font-size='11' fill='#555' text-anchor='middle'>remote image blocked</text></svg>",
  );

function stripCssUrls(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:image\/)[^)]*?\1\s*\)/gi, "none");
}

function safeImageSource(value: string, images: Map<string, Attachment>): string {
  const v = value.trim();
  if (/^cid:/i.test(v)) {
    const image = images.get(decodeURIComponent(v.slice(4)).toLowerCase());
    return image ? `data:${image.contentType};base64,${btoa(bytesToBinary(image.data))}` : PLACEHOLDER;
  }
  return /^data:image\//i.test(v) ? v : PLACEHOLDER;
}

/**
 * The email's HTML, made inert for display in a sandboxed `srcdoc` frame:
 * active and fetching elements removed, event handlers dropped, links and
 * forms disarmed, remote images swapped for placeholders, remote CSS cut,
 * and a CSP that forbids any load as a second line of defence.
 */
export function buildPreview(
  html: string,
  parseHtml: (html: string) => Document,
  attachments: readonly Attachment[],
): string {
  const doc = parseHtml(html);
  const images = new Map(
    attachments
      .filter((a) => a.contentId && a.contentType.startsWith("image/") && a.data.length <= MAX_INLINE_IMAGE)
      .map((a) => [(a.contentId as string).toLowerCase(), a] as const),
  );

  for (const el of [...doc.querySelectorAll(REMOVED)]) el.remove();

  for (const el of [...doc.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcset" || name === "formaction" || name === "ping") {
        el.removeAttribute(attribute.name);
      }
    }
    if (tag === "a" || tag === "area") {
      const href = el.getAttribute("href");
      el.removeAttribute("href");
      if (href) el.setAttribute("title", `Link disabled in preview: ${href}`);
    } else {
      el.removeAttribute("href");
      el.removeAttribute("xlink:href");
    }
    if (tag === "form") el.removeAttribute("action");
    for (const name of SOURCE_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value !== null) el.setAttribute(name, safeImageSource(value, images));
    }
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", stripCssUrls(style));
  }
  for (const sheet of doc.querySelectorAll("style")) sheet.textContent = stripCssUrls(sheet.textContent ?? "");

  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", PREVIEW_CSP);
  doc.head.insertBefore(csp, doc.head.firstChild);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
