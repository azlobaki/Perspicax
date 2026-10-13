import { decodeBase64 } from "../mime/bytes.ts";

export type Wrapper = { service: string; url: string };

export type Unwrapped = {
  /** Destination once every recognised wrapper is removed. */
  final: string;
  /** Each layer removed, outermost first, with the URL as it was at that layer. */
  wrappers: Wrapper[];
  /** A gateway that rewrote the link irreversibly (its destination is only known server-side). */
  opaque: string | null;
};

const MAX_LAYERS = 5;

// Parameters that commonly carry a redirect target; only absolute http(s) values count.
const REDIRECT_KEYS = ["url", "u", "target", "redirect", "redirect_url", "redirect_uri", "dest", "destination", "link", "goto", "next", "r"];

// Proofpoint v3 run-length alphabet: "**A" means two replaced characters, "**B" three…
const V3_RUNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const V3 = /^https?:\/\/urldefense(?:\.proofpoint)?\.com\/v3\/__(.+?)__;([^!]*)!/i;

function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function isAbsoluteHttp(value: string | null): value is string {
  return value !== null && /^https?:\/\//i.test(value);
}

function decodeProofpointV3(embedded: string, encoded: string): string {
  const replacement = [...new TextDecoder().decode(decodeBase64(encoded))];
  let next = 0;
  return embedded.replace(/\*(\*.)?/g, (_match, run: string | undefined) => {
    const length = run ? V3_RUNS.indexOf(run[1]) + 2 : 1;
    const chunk = replacement.slice(next, next + length).join("");
    next += length;
    return chunk;
  });
}

function unwrapOnce(href: string): Wrapper | { opaque: string } | null {
  const v3 = V3.exec(href);
  if (v3) return { service: "Proofpoint URL Defense", url: decodeProofpointV3(v3[1], v3[2]) };

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const param = (key: string) => url.searchParams.get(key);

  if (host.endsWith(".safelinks.protection.outlook.com") && isAbsoluteHttp(param("url"))) {
    return { service: "Microsoft Safe Links", url: param("url") as string };
  }
  if (host === "urldefense.proofpoint.com" && url.pathname.startsWith("/v2/url") && param("u")) {
    return { service: "Proofpoint URL Defense", url: decodeSafely((param("u") as string).replace(/-/g, "%").replace(/_/g, "/")) };
  }
  if (host === "urldefense.proofpoint.com" && url.pathname.startsWith("/v1/url") && isAbsoluteHttp(param("u"))) {
    return { service: "Proofpoint URL Defense", url: param("u") as string };
  }
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname === "/url") {
    const target = param("q") ?? param("url");
    if (isAbsoluteHttp(target)) return { service: "Google redirect", url: target };
  }
  if (host === "linkprotect.cudasvc.com" && isAbsoluteHttp(param("a"))) {
    return { service: "Barracuda Link Protection", url: param("a") as string };
  }
  if (host === "secure-web.cisco.com") {
    const last = decodeSafely(url.pathname.split("/").pop() ?? "");
    if (isAbsoluteHttp(last)) return { service: "Cisco Secure Email", url: last };
  }
  if (host.endsWith("protection.sophos.com") && param("u")) {
    const target = new TextDecoder().decode(decodeBase64(param("u") as string));
    if (isAbsoluteHttp(target)) return { service: "Sophos Time-of-Click", url: target };
  }
  if (/(^|\.)mimecast\.com$/.test(host) && url.pathname.startsWith("/s/")) return { opaque: "Mimecast URL Protect" };

  for (const key of REDIRECT_KEYS) {
    const target = param(key);
    if (isAbsoluteHttp(target)) return { service: "Redirect parameter", url: target };
  }
  return null;
}

/** Removes URL-rewriting layers (security gateways, redirectors) to reveal the real destination. */
export function unwrapUrl(href: string): Unwrapped {
  let current = href;
  const wrappers: Wrapper[] = [];
  for (let i = 0; i < MAX_LAYERS; i++) {
    const next = unwrapOnce(current);
    if (next === null) break;
    if ("opaque" in next) return { final: current, wrappers, opaque: next.opaque };
    wrappers.push({ service: next.service, url: current });
    current = next.url;
  }
  return { final: current, wrappers, opaque: null };
}
