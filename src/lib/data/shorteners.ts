import { normaliseHost, orgDomain } from "../net/domain.ts";

/** URL shorteners: the real destination is one more hop away. */
const SHORTENERS = new Set([
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "v.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "tiny.cc", "lnkd.in", "s.id",
  "shorte.st", "sh.st", "adf.ly", "bl.ink", "qrco.de", "x.co", "trib.al", "soo.gd", "clck.ru",
  "u.to", "urlz.fr", "lc.cx", "short.gy", "tinyurl.is", "shorturl.gg",
]);

export function isShortener(host: string): boolean {
  const h = normaliseHost(host);
  return SHORTENERS.has(h) || SHORTENERS.has(orgDomain(h));
}
