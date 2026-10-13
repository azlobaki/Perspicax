import { isIp } from "./ip.ts";

/**
 * Public suffixes made of two or more labels, for the registrable-domain
 * approximation below. Not the full Public Suffix List — enough for the
 * mail and hosting domains an analyst meets; anything else falls back to
 * "the last two labels".
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "govt.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr",
  "com.br", "net.br", "org.br", "gov.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.hk", "com.sg", "com.tw", "com.my", "com.mx", "com.ar", "com.co", "com.tr",
  "com.ua", "com.pl", "com.vn", "com.ph", "com.pk", "com.eg", "com.sa", "com.ng",
  "co.in", "net.in", "org.in", "gov.in", "ac.in",
  "co.za", "org.za", "gov.za",
  "co.il", "org.il", "co.id", "or.id", "ac.id", "co.ke", "co.th", "in.th", "ac.th",
  "co.at", "or.at", "gv.at",
  "gouv.fr", "asso.fr", "nom.fr", "presse.fr",
  // Hosting platforms: each customer subdomain is a different owner.
  "github.io", "gitlab.io", "blogspot.com", "herokuapp.com", "netlify.app", "vercel.app",
  "pages.dev", "workers.dev", "r2.dev", "web.app", "firebaseapp.com", "appspot.com",
  "azurewebsites.net", "cloudfront.net", "s3.amazonaws.com", "glitch.me", "repl.co",
  "ngrok.io", "ngrok-free.app", "weebly.com", "wixsite.com", "000webhostapp.com",
]);

export function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Registrable ("organisational") domain: `mail.em.example.co.uk` → `example.co.uk`. IP literals come back as is. */
export function orgDomain(host: string): string {
  const h = normaliseHost(host);
  if (isIp(h)) return h;
  const labels = h.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  for (let take = Math.min(3, labels.length - 1); take >= 2; take--) {
    if (MULTI_LABEL_SUFFIXES.has(labels.slice(-take).join("."))) {
      return labels.slice(-take - 1).join(".");
    }
  }
  return labels.slice(-2).join(".");
}

export function sameOrg(a: string, b: string): boolean {
  return orgDomain(a) === orgDomain(b);
}

/** True when `host` is `domain` itself or one of its subdomains. */
export function isSubdomainOf(host: string, domain: string): boolean {
  const h = normaliseHost(host);
  const d = normaliseHost(domain);
  return h === d || h.endsWith(`.${d}`);
}
