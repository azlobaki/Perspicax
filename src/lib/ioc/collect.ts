import type { AttachmentReport } from "../attachments/analyze.ts";
import { isFreeMail } from "../data/freemail.ts";
import type { ParsedEmail } from "../email.ts";
import type { Text } from "../i18n/text.ts";
import type { HeaderReport } from "../headers/analyze.ts";
import { isClickable, type Link, type LinkOrigin } from "../links/analyze.ts";
import { parseAddressList } from "../mime/address.ts";
import { getHeaders } from "../mime/headers.ts";
import { normaliseHost } from "../net/domain.ts";
import { ipScope, isIp } from "../net/ip.ts";
import { IOC_TYPES, type Ioc, type IocType } from "./types.ts";

export { IOC_TYPES };
export type { Ioc, IocType };

const ORIGIN_NOUN: Record<LinkOrigin, Text> = {
  a: { en: "link", fr: "lien" }, area: { en: "link", fr: "lien" }, form: { en: "form", fr: "formulaire" },
  "meta-refresh": { en: "redirect", fr: "redirection" }, text: { en: "link", fr: "lien" },
  img: { en: "image", fr: "image" }, css: { en: "image", fr: "image" },
  link: { en: "stylesheet", fr: "feuille de style" }, frame: { en: "frame", fr: "cadre" },
  media: { en: "media", fr: "média" }, file: { en: "link", fr: "lien" }, qr: { en: "QR code", fr: "code QR" },
};

/** A source that reads the same in both languages (a header name). */
const same = (name: string): Text => ({ en: name, fr: name });

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Indicators worth searching for elsewhere: the sender's addresses and
 * infrastructure, every destination and remote resource (except mailing
 * services' trackers), attachment hashes, addresses written in the body.
 * Recipients, private addresses and free-mail domains are left out.
 */
export function collectIocs(input: { email: ParsedEmail; headers: HeaderReport; links: Link[]; attachments: AttachmentReport[] }): Ioc[] {
  const found = new Map<string, Ioc>();
  const add = (type: IocType, value: string, source: Text) => {
    const key = `${type}:${value}`;
    const existing = found.get(key);
    if (!existing) found.set(key, { type, value, sources: [source] });
    else if (!existing.sources.some((s) => s.en === source.en)) existing.sources.push(source);
  };
  const addHost = (host: string, source: Text) => {
    const h = normaliseHost(host.replace(/^\[|\]$/g, ""));
    if (isIp(h)) {
      if (ipScope(h) === "public") add("ip", h, source);
    } else if (h.includes(".") && !isFreeMail(h)) {
      add("domain", h, source);
    }
  };
  const addEmail = (address: string, source: Text) => {
    const at = address.lastIndexOf("@");
    if (at <= 0) return;
    const domain = address.slice(at + 1).toLowerCase();
    add("email", `${address.slice(0, at)}@${domain}`, source);
    addHost(domain, source);
  };

  for (const row of input.headers.sender.rows) {
    if (row.header !== "Message-ID" && row.value.includes("@")) addEmail(row.value, same(row.header));
  }
  const origin = input.headers.hops.find((hop) => hop.ipScope === "public");
  if (origin) {
    for (const value of [origin.ip, origin.helo, origin.rdns]) if (value) addHost(value, { en: "Received (origin)", fr: "Received (origine)" });
  }

  for (const link of input.links) {
    if (!isClickable(link) && link.tracking === "tracker") continue;
    const place: Text =
      link.source === "html"
        ? { en: "HTML body", fr: "le corps HTML" }
        : link.source === "text"
          ? { en: "text body", fr: "le corps texte" }
          : { en: `attachment ${link.attachment}`, fr: `la pièce jointe ${link.attachment}` };
    const noun = ORIGIN_NOUN[link.origin];
    const source: Text = { en: `${noun.en} in ${place.en}`, fr: `${noun.fr} dans ${place.fr}` };
    const { scheme, final, host } = link.url;
    if ((scheme === "http" || scheme === "https") && final) {
      add("url", final, source);
      if (host) addHost(host, source);
    } else if (scheme === "mailto" && final) {
      addEmail(decodeSafely(final.slice("mailto:".length).split("?")[0]), source);
    }
  }

  for (const attachment of input.attachments) {
    const source: Text = { en: `attachment ${attachment.visibleName}`, fr: `pièce jointe ${attachment.visibleName}` };
    add("sha256", attachment.hashes.sha256, source);
    add("sha1", attachment.hashes.sha1, source);
    add("md5", attachment.hashes.md5, source);
  }

  const recipients = new Set(
    ["to", "cc", "delivered-to"]
      .flatMap((name) => getHeaders(input.email.headers, name))
      .flatMap(parseAddressList)
      .map((a) => a.address.toLowerCase()),
  );
  const bodyText = `${input.email.text ?? ""}\n${(input.email.html ?? "").replace(/<[^>]+>/g, " ")}`;
  for (const match of bodyText.matchAll(EMAIL_IN_TEXT)) {
    if (!recipients.has(match[0].toLowerCase())) addEmail(match[0], { en: "body", fr: "corps du message" });
  }

  return [...found.values()].sort((a, b) => IOC_TYPES.indexOf(a.type) - IOC_TYPES.indexOf(b.type));
}
