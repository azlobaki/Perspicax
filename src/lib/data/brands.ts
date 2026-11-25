export type Brand = {
  name: string;
  /** Matched against display names. */
  pattern: RegExp;
  /** Domains the brand really mails from; compared by organisation. */
  domains: string[];
  /**
   * Names that, as a whole word of someone else's domain, borrow the brand
   * (`paypal-secure.com`). Only distinctive ones: "ups" or "google" would
   * match too much.
   */
  tokens?: string[];
  /** More domains the brand's links point to (CDNs, tenants, short links), beyond `domains`. */
  alsoOwns?: string[];
};

/** Brands most often impersonated in display names. */
export const BRANDS: Brand[] = [
  {
    name: "Microsoft",
    pattern: /\b(microsoft|office ?365|microsoft ?365|onedrive|sharepoint)\b/i,
    domains: ["microsoft.com", "office.com", "office365.com", "microsoftonline.com", "sharepointonline.com", "onedrive.com", "live.com", "outlook.com"],
    tokens: ["microsoft", "microsoft365", "office365", "onedrive", "sharepoint", "outlook", "hotmail"],
    alsoOwns: [
      "sharepoint.com", "onmicrosoft.com", "office.net", "live.net", "windows.net", "azure.com", "azureedge.net",
      "msauth.net", "msftauth.net", "msn.com", "bing.com", "skype.com", "aka.ms", "hotmail.com", "outlook.fr", "hotmail.fr",
    ],
  },
  { name: "Google", pattern: /\b(google|gmail)\b/i, domains: ["google.com", "youtube.com"] },
  {
    name: "Apple",
    pattern: /\b(apple|icloud|itunes|app ?store)\b/i,
    domains: ["apple.com", "icloud.com", "me.com"],
    tokens: ["apple", "icloud", "appleid", "itunes"],
    alsoOwns: ["mzstatic.com", "icloud-content.com", "cdn-apple.com", "apple.news"],
  },
  {
    name: "PayPal",
    pattern: /\bpay ?pal\b/i,
    domains: ["paypal.com", "paypal.fr", "paypal.de", "paypal.co.uk", "paypal.it", "paypal.es", "paypal.nl"],
    tokens: ["paypal"],
    alsoOwns: ["paypalobjects.com", "paypal-communication.com", "paypal-community.com", "paypal-prepaid.com", "paypal.me"],
  },
  {
    name: "Amazon",
    pattern: /\bamazon\b/i,
    domains: ["amazon.com", "amazon.fr", "amazon.de", "amazon.co.uk", "amazon.it", "amazon.es", "amazon.ca", "amazon.co.jp"],
    tokens: ["amazon"],
    alsoOwns: [
      "amazonaws.com", "amazon-adsystem.com", "media-amazon.com", "amazonses.com",
      "amazon.com.br", "amazon.com.mx", "amazon.com.au", "amazon.in", "amazon.nl", "amazon.se", "amazon.pl",
    ],
  },
  { name: "DocuSign", pattern: /\bdocu ?sign\b/i, domains: ["docusign.net", "docusign.com"], tokens: ["docusign"] },
  {
    name: "Adobe",
    pattern: /\badobe\b/i,
    domains: ["adobe.com", "adobesign.com", "echosign.com"],
    tokens: ["adobe"],
    alsoOwns: ["adobelogin.com", "adobe.io", "typekit.net", "acrobat.com", "adobe.ly"],
  },
  {
    name: "Dropbox",
    pattern: /\bdropbox\b/i,
    domains: ["dropbox.com", "dropboxmail.com"],
    tokens: ["dropbox"],
    alsoOwns: ["dropboxusercontent.com", "dropboxstatic.com", "db.tt"],
  },
  { name: "WeTransfer", pattern: /\bwe ?transfer\b/i, domains: ["wetransfer.com"], tokens: ["wetransfer"], alsoOwns: ["we.tl"] },
  {
    name: "DHL",
    pattern: /\bdhl\b/i,
    domains: ["dhl.com", "dhl.de", "dhl.fr", "dhl.co.uk"],
    tokens: ["dhl"],
    alsoOwns: ["dhl.at", "dhl.nl", "dhl.be", "dhl.es", "dhl.it", "dpdhl.com", "dhl.express"],
  },
  { name: "FedEx", pattern: /\bfed ?ex\b/i, domains: ["fedex.com"], tokens: ["fedex"] },
  // Case-sensitive: "ups" is also an ordinary word ending ("follow-ups").
  { name: "UPS", pattern: /\bUPS\b/, domains: ["ups.com"] },
  {
    name: "La Poste",
    pattern: /\b(la ?poste|colissimo|chronopost)\b/i,
    domains: ["laposte.fr", "laposte.net", "colissimo.fr", "chronopost.fr"],
    tokens: ["laposte", "colissimo", "chronopost"],
    alsoOwns: ["labanquepostale.fr"],
  },
  {
    name: "Netflix",
    pattern: /\bnetflix\b/i,
    domains: ["netflix.com"],
    tokens: ["netflix"],
    alsoOwns: ["nflxext.com", "nflximg.net", "nflxso.net"],
  },
  { name: "LinkedIn", pattern: /\blinked ?in\b/i, domains: ["linkedin.com"], tokens: ["linkedin"], alsoOwns: ["licdn.com", "lnkd.in"] },
  {
    name: "Facebook",
    pattern: /\b(facebook|instagram)\b/i,
    domains: ["facebookmail.com", "facebook.com", "instagram.com", "meta.com"],
    tokens: ["facebook", "instagram", "whatsapp"],
    alsoOwns: ["fb.com", "fbcdn.net", "whatsapp.com", "whatsapp.net", "fb.me"],
  },
  {
    name: "Assurance Maladie",
    pattern: /\b(ameli|assurance ?maladie)\b/i,
    domains: ["ameli.fr", "assurance-maladie.fr"],
    tokens: ["ameli"],
  },
  {
    name: "Impôts",
    pattern: /\b(imp[oô]ts?|dgfip|finances publiques)\b/i,
    domains: ["impots.gouv.fr", "dgfip.finances.gouv.fr"],
    tokens: ["impots", "dgfip"],
    alsoOwns: ["gouv.fr"],
  },
  { name: "ANTAI", pattern: /\bantai\b/i, domains: ["antai.gouv.fr"], tokens: ["antai"], alsoOwns: ["gouv.fr"] },
];
