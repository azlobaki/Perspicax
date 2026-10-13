export type Brand = {
  name: string;
  /** Matched against display names. */
  pattern: RegExp;
  /** Domains the brand really mails from; compared by organisation. */
  domains: string[];
};

/** Brands most often impersonated in display names. */
export const BRANDS: Brand[] = [
  {
    name: "Microsoft",
    pattern: /\b(microsoft|office ?365|microsoft ?365|onedrive|sharepoint)\b/i,
    domains: ["microsoft.com", "office.com", "office365.com", "microsoftonline.com", "sharepointonline.com", "onedrive.com", "live.com", "outlook.com"],
  },
  { name: "Google", pattern: /\b(google|gmail)\b/i, domains: ["google.com", "youtube.com"] },
  { name: "Apple", pattern: /\b(apple|icloud|itunes|app ?store)\b/i, domains: ["apple.com", "icloud.com", "me.com"] },
  {
    name: "PayPal",
    pattern: /\bpay ?pal\b/i,
    domains: ["paypal.com", "paypal.fr", "paypal.de", "paypal.co.uk", "paypal.it", "paypal.es", "paypal.nl"],
  },
  {
    name: "Amazon",
    pattern: /\bamazon\b/i,
    domains: ["amazon.com", "amazon.fr", "amazon.de", "amazon.co.uk", "amazon.it", "amazon.es", "amazon.ca", "amazon.co.jp"],
  },
  { name: "DocuSign", pattern: /\bdocu ?sign\b/i, domains: ["docusign.net", "docusign.com"] },
  { name: "Adobe", pattern: /\badobe\b/i, domains: ["adobe.com", "adobesign.com", "echosign.com"] },
  { name: "Dropbox", pattern: /\bdropbox\b/i, domains: ["dropbox.com", "dropboxmail.com"] },
  { name: "WeTransfer", pattern: /\bwe ?transfer\b/i, domains: ["wetransfer.com"] },
  { name: "DHL", pattern: /\bdhl\b/i, domains: ["dhl.com", "dhl.de", "dhl.fr", "dhl.co.uk"] },
  { name: "FedEx", pattern: /\bfed ?ex\b/i, domains: ["fedex.com"] },
  // Case-sensitive: "ups" is also an ordinary word ending ("follow-ups").
  { name: "UPS", pattern: /\bUPS\b/, domains: ["ups.com"] },
  {
    name: "La Poste",
    pattern: /\b(la ?poste|colissimo|chronopost)\b/i,
    domains: ["laposte.fr", "laposte.net", "colissimo.fr", "chronopost.fr"],
  },
  { name: "Netflix", pattern: /\bnetflix\b/i, domains: ["netflix.com"] },
  { name: "LinkedIn", pattern: /\blinked ?in\b/i, domains: ["linkedin.com"] },
  { name: "Facebook", pattern: /\b(facebook|instagram)\b/i, domains: ["facebookmail.com", "facebook.com", "instagram.com", "meta.com"] },
  { name: "Assurance Maladie", pattern: /\b(ameli|assurance ?maladie)\b/i, domains: ["ameli.fr", "assurance-maladie.fr"] },
  {
    name: "Impôts",
    pattern: /\b(imp[oô]ts?|dgfip|finances publiques)\b/i,
    domains: ["impots.gouv.fr", "dgfip.finances.gouv.fr"],
  },
  { name: "ANTAI", pattern: /\bantai\b/i, domains: ["antai.gouv.fr"] },
];
