import { isAbusedTld } from "../data/tlds.ts";
import { isShortener } from "../data/shorteners.ts";
import { orgDomain } from "../net/domain.ts";
import { isIPv4 } from "../net/ip.ts";
import { isHomoglyph, lookalikeOf, type Reference } from "./lookalike.ts";
import { hostToUnicode } from "./punycode.ts";
import { unwrapUrl, type Wrapper } from "./unwrap.ts";

export type UrlFlag =
  | "javascript-url"
  | "data-url"
  | "userinfo"
  | "lookalike"
  | "homoglyph"
  | "disguised-domain"
  | "ip-host"
  | "shortener"
  | "abused-tld"
  | "punycode"
  | "opaque-wrapper"
  | "unparseable";

export type InspectedUrl = {
  /** As written in the email. */
  raw: string;
  /** Absolute and normalised; null when it cannot be parsed. */
  href: string | null;
  /** Destination after unwrapping. */
  final: string | null;
  wrappers: Wrapper[];
  opaque: string | null;
  scheme: string | null;
  /** Host of `final`, ASCII (Punycode) form. */
  host: string | null;
  /** Host of `final` as a reader would see it (Unicode). */
  displayHost: string | null;
  lookalikeOf: string | null;
  flags: UrlFlag[];
};

// The part of a host before its registrable domain, when that part itself
// ends like a domain: `rhone-energie.fr` in `rhone-energie.fr.secure-login.click`.
const DOMAIN_LIKE = /(^|\.)[a-z0-9-]+\.(com|net|org|info|biz|fr|de|uk|co|io|eu|be|ch|es|it|nl|gov|edu)$/;

export function inspectUrl(raw: string, options: { base?: string | null; references: readonly Reference[] }): InspectedUrl {
  // Browsers drop tabs and line breaks inside URLs; senders use that to split them.
  const cleaned = raw.trim().replace(/[\t\n\r]/g, "");
  const result: InspectedUrl = {
    raw, href: null, final: null, wrappers: [], opaque: null, scheme: null,
    host: null, displayHost: null, lookalikeOf: null, flags: [],
  };

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1].toLowerCase() ?? null;
  if (scheme === "javascript" || scheme === "data") {
    result.scheme = scheme;
    result.href = cleaned;
    result.final = cleaned;
    if (scheme === "javascript") result.flags.push("javascript-url");
    else if (!/^data:image\//i.test(cleaned)) result.flags.push("data-url");
    return result;
  }

  let url: URL;
  try {
    url = options.base ? new URL(cleaned, options.base) : new URL(cleaned);
  } catch {
    result.flags.push("unparseable");
    return result;
  }
  result.href = url.href;
  result.scheme = url.protocol.slice(0, -1);
  if (result.scheme !== "http" && result.scheme !== "https") {
    result.final = url.href;
    return result;
  }
  if (url.username || url.password) result.flags.push("userinfo");

  const unwrapped = unwrapUrl(url.href);
  result.final = unwrapped.final;
  result.wrappers = unwrapped.wrappers;
  result.opaque = unwrapped.opaque;
  if (unwrapped.opaque) result.flags.push("opaque-wrapper");

  let final: URL;
  try {
    final = new URL(unwrapped.final);
  } catch {
    result.flags.push("unparseable");
    return result;
  }
  if ((final.username || final.password) && !result.flags.includes("userinfo")) result.flags.push("userinfo");

  const host = final.hostname.toLowerCase();
  result.host = host;
  result.displayHost = hostToUnicode(host);
  if (isIPv4(host) || host.startsWith("[")) {
    result.flags.push("ip-host");
    return result;
  }

  const imitated = lookalikeOf(result.displayHost, options.references);
  if (imitated) {
    result.lookalikeOf = imitated;
    result.flags.push("lookalike");
  } else if (isHomoglyph(result.displayHost)) {
    result.flags.push("homoglyph");
  } else if (host.split(".").some((label) => label.startsWith("xn--"))) {
    result.flags.push("punycode");
  }
  const org = orgDomain(host);
  const subdomain = host.length > org.length ? host.slice(0, -org.length - 1) : "";
  if (DOMAIN_LIKE.test(subdomain)) result.flags.push("disguised-domain");
  if (isShortener(host)) result.flags.push("shortener");
  if (isAbusedTld(host)) result.flags.push("abused-tld");
  return result;
}
