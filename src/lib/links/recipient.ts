import type { HeaderField } from "../email.ts";
import { parseAddressList } from "../mime/address.ts";
import { getHeaders } from "../mime/headers.ts";

/** Stands in for the recipient's address wherever a link leaves the page: pivots, indicator lists, reports. */
export const REDACTED = "REDACTED";

export type RecipientMatch = {
  address: string;
  /** "plain" covers URL-encoding too: both read as an address to anyone who looks. */
  encoding: "plain" | "base64";
  start: number;
  end: number;
};

/** Who the message was sent to, lower-cased, each once. */
export function recipientAddresses(headers: readonly HeaderField[]): string[] {
  const addresses = ["to", "cc", "delivered-to"]
    .flatMap((name) => getHeaders(headers, name))
    .flatMap(parseAddressList)
    .map((a) => a.address.toLowerCase());
  return [...new Set(addresses)];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * The characters of the address's base64 that do not depend on what
 * surrounds it, for each of the three byte alignments it can fall on
 * inside a longer encoded string.
 */
function base64Forms(address: string): string[] {
  const bytes = new TextEncoder().encode(address);
  const forms: string[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const padded = new Uint8Array(offset + bytes.length);
    padded.set(bytes, offset);
    const encoded = toBase64(padded);
    const first = Math.ceil((offset * 8) / 6);
    const last = Math.floor(((offset + bytes.length) * 8) / 6);
    const stable = encoded.slice(first, last);
    forms.push(stable, stable.replace(/\+/g, "-").replace(/\//g, "_"));
  }
  return [...new Set(forms)];
}

/**
 * Where a recipient's address appears in a link: written out, URL-encoded,
 * or base64-encoded the way phishing kits pass the target to the fake
 * sign-in page.
 */
export function findRecipients(url: string, addresses: readonly string[]): RecipientMatch[] {
  const matches: RecipientMatch[] = [];
  for (const address of addresses) {
    if (address.length < 6 || !address.includes("@")) continue;
    const plain = [address, encodeURIComponent(address), address.replace("@", "%40")];
    for (const m of url.matchAll(new RegExp([...new Set(plain)].map(escape).join("|"), "gi"))) {
      matches.push({ address, encoding: "plain", start: m.index, end: m.index + m[0].length });
    }
    for (const m of url.matchAll(new RegExp(base64Forms(address).map(escape).join("|"), "g"))) {
      matches.push({ address, encoding: "base64", start: m.index, end: m.index + m[0].length });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

/** The link with every recipient address replaced by a placeholder. */
export function redactRecipients(url: string, addresses: readonly string[]): string {
  let out = "";
  let cursor = 0;
  for (const m of findRecipients(url, addresses)) {
    if (m.start < cursor) {
      cursor = Math.max(cursor, m.end);
      continue;
    }
    out += url.slice(cursor, m.start) + REDACTED;
    cursor = m.end;
  }
  return out + url.slice(cursor);
}
