/**
 * The browser's own HTML parser. Documents it returns are inert: scripts do
 * not run and images are not fetched.
 */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
