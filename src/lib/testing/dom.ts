import { DOMParser } from "linkedom";

/**
 * A Document for tests, built by linkedom. Browsers wrap an HTML fragment in
 * <html><head><body>; linkedom does not, so fragments are wrapped here to
 * behave like the app's DOMParser. Never imported by the app.
 */
export function parseTestHtml(html: string): Document {
  const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
  return new DOMParser().parseFromString(full, "text/html") as unknown as Document;
}
