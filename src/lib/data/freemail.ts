import { normaliseHost } from "../net/domain.ts";

/** Free webmail providers: anyone can open an address there in a minute. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.fr", "outlook.de", "outlook.es", "outlook.it",
  "hotmail.com", "hotmail.fr", "hotmail.co.uk", "hotmail.es", "hotmail.it", "hotmail.de",
  "live.com", "live.fr", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.fr", "yahoo.co.uk", "yahoo.es", "yahoo.de", "yahoo.it", "ymail.com",
  "aol.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "tutanota.com", "tuta.io",
  "gmx.com", "gmx.net", "gmx.de", "gmx.fr", "web.de", "t-online.de", "mail.com",
  "mail.ru", "yandex.ru", "yandex.com", "zoho.com",
  "laposte.net", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr",
  "libero.it", "virgilio.it", "qq.com", "163.com", "126.com", "naver.com",
  "seznam.cz", "wp.pl", "o2.pl", "interia.pl", "btinternet.com",
  "terra.com.br", "uol.com.br", "bol.com.br", "rediffmail.com",
  "skynet.be", "telenet.be", "bluewin.ch",
]);

export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(normaliseHost(domain));
}
