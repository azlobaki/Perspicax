import type { IocType } from "./collect.ts";

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
