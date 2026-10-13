import type { IocType } from "./types.ts";

/**
 * The form tickets and chat tools will not turn into live links:
 * `hxxps://evil[.]example/path`, `user[@]evil[.]example`, `1[.]2[.]3[.]4`.
 */
export function defang(type: IocType, value: string): string {
  switch (type) {
    case "url": {
      const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/.exec(value);
      if (!match) return value.replace(/\./g, "[.]");
      return `${match[1].replace(/^http/i, "hxxp")}://${match[2].replace(/\./g, "[.]")}${match[3]}`;
    }
    case "domain":
    case "ip":
      return value.replace(/\./g, "[.]");
    case "email": {
      const at = value.lastIndexOf("@");
      return at < 0 ? value : `${value.slice(0, at)}[@]${value.slice(at + 1).replace(/\./g, "[.]")}`;
    }
    default:
      return value;
  }
}

/** Undoes the common defanging notations, so pasted indicators can be used again. */
export function refang(text: string): string {
  return text
    .replace(/\bhxxp(s?)\[?:\/\/\]?/gi, "http$1://")
    .replace(/\bhxxp(s?)/gi, "http$1")
    .replace(/\[:\/\/\]/g, "://")
    .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)/gi, ".")
    .replace(/\[@\]|\(@\)|\[at\]|\(at\)/gi, "@");
}
// Top-level domains common enough in mail to recognise a bare domain in prose.
const PROSE_TLDS =
  "com|net|org|info|biz|fr|de|uk|io|co|eu|be|ch|es|it|nl|us|ru|cn|me|app|dev|online|site|shop|live|ly|click|top|xyz|cfd|sbs|icu|tk|ml|ga|cf|gq|zip|mov";
const PROSE_DOMAIN = new RegExp(`\\b((?:[a-z0-9-]+\\.)+(?:${PROSE_TLDS}))\\b`, "gi");

/** Defangs every URL, email address, IPv4 address and recognisable domain in free text. */
export function defangText(text: string): string {
  return text
    .replace(/\b(https?|ftp):\/\/([^\s/?#"'<>`)\]]+)/gi, (_m, scheme: string, host: string) =>
      `${scheme.replace(/^http/i, "hxxp")}://${host.replace(/\./g, "[.]")}`)
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g, (_m, local: string, domain: string) =>
      `${local}[@]${domain.replace(/\./g, "[.]")}`)
    .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, "$1[.]$2[.]$3[.]$4")
    .replace(PROSE_DOMAIN, (domain: string) => domain.replace(/\./g, "[.]"));
}
