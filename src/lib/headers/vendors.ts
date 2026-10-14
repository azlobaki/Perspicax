import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeader } from "../mime/headers.ts";

export type VendorField = { key: string; value: string; meaning: string | null; flagged: boolean };

export type VendorVerdict = {
  vendor: string;
  verdict: "phishing" | "malware" | "spam" | "bulk" | "clean" | null;
  fields: VendorField[];
};

const SFV: Record<string, string> = {
  BLK: "Blocked: sender on the user's blocked list",
  NSPM: "Not spam",
  SFE: "Allowed: sender on the user's safe list",
  SKA: "Allowed by an anti-spam policy",
  SKB: "Blocked by an anti-spam policy",
  SKI: "Internal message, filtering skipped",
  SKN: "Marked not spam by a mail flow rule",
  SKQ: "Released from quarantine",
  SKS: "Marked spam by a mail flow rule",
  SPM: "Spam",
};

const CAT: Record<string, string> = {
  AMP: "Malware (anti-malware)",
  BIMP: "Brand impersonation",
  BULK: "Bulk",
  DIMP: "Domain impersonation",
  FTBP: "Blocked file type",
  GIMP: "Mailbox-intelligence impersonation",
  HPHSH: "High-confidence phishing",
  HPHISH: "High-confidence phishing",
  HSPM: "High-confidence spam",
  INTOS: "Internal phishing",
  MALW: "Malware",
  OSPM: "Outbound spam",
  PHSH: "Phishing",
  SAP: "Safe Attachments",
  SPM: "Spam",
  SPOOF: "Spoofing",
  UIMP: "User impersonation",
  NONE: "No category",
};

const IPV: Record<string, string> = { CAL: "IP allowed by the connection filter", NLI: "IP not on any reputation list" };
const DIR: Record<string, string> = { INB: "Inbound", OUT: "Outbound", INT: "Internal" };
const SFTY: Record<string, string> = { "9.19": "domain impersonation", "9.20": "user impersonation" };
const PHISH_CATS = new Set(["PHSH", "HPHSH", "HPHISH", "SPOOF", "DIMP", "UIMP", "GIMP", "BIMP", "INTOS"]);
const MALWARE_CATS = new Set(["MALW", "AMP", "FTBP", "SAP"]);

function colonPairs(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of value.split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) map.set(part.slice(0, colon).trim().toUpperCase(), part.slice(colon + 1).trim());
  }
  return map;
}

function sclMeaning(scl: number): string {
  if (scl === -1) return "Filtering skipped";
  if (scl <= 1) return "Not spam";
  if (scl <= 6) return "Spam";
  return "High-confidence spam";
}

function bclMeaning(bcl: number): string {
  if (bcl === 0) return "Not bulk";
  if (bcl <= 3) return "Bulk, few complaints";
  if (bcl <= 7) return "Bulk, some complaints";
  return "Bulk, many complaints";
}

function microsoft(headers: readonly HeaderField[]): VendorVerdict | null {
  const report = getHeader(headers, "x-forefront-antispam-report");
  const orgScl = getHeader(headers, "x-ms-exchange-organization-scl");
  const antispam = getHeader(headers, "x-microsoft-antispam");
  const pcl = getHeader(headers, "x-ms-exchange-organization-pcl")?.trim();
  if (report === null && orgScl === null && antispam === null) return null;

  const f = colonPairs(report ?? "");
  const fields: VendorField[] = [];
  const add = (key: string, value: string | undefined, meaning: string | null, flagged: boolean) => {
    if (value) fields.push({ key, value, meaning, flagged });
  };
  const sfv = f.get("SFV");
  const cat = f.get("CAT");
  const scl = f.get("SCL") ?? orgScl?.trim();
  const bcl = colonPairs(antispam ?? "").get("BCL");
  const ptr = f.get("PTR");
  const sfty = f.get("SFTY");
  add("SFV", sfv, sfv ? (SFV[sfv] ?? null) : null, sfv !== undefined && ["SPM", "SKS", "BLK", "SKB"].includes(sfv));
  add("CAT", cat, cat ? (CAT[cat] ?? null) : null, cat !== undefined && cat !== "NONE");
  add("SCL", scl, scl ? sclMeaning(Number(scl)) : null, Number(scl) >= 5);
  add("BCL", bcl, bcl ? bclMeaning(Number(bcl)) : null, Number(bcl) >= 8);
  add("PCL", pcl, pcl ? (Number(pcl) >= 4 ? "Likely phishing" : "Unlikely phishing") : null, Number(pcl) >= 4);
  add("IPV", f.get("IPV"), IPV[f.get("IPV") ?? ""] ?? null, false);
  add("CTRY", f.get("CTRY"), "Country of the connecting IP", false);
  add("CIP", f.get("CIP"), "Connecting IP", false);
  add("PTR", ptr, ptr === "InfoNoRecords" ? "No reverse DNS" : "Reverse DNS of the connecting IP", ptr === "InfoNoRecords");
  add("LANG", f.get("LANG"), "Detected language", false);
  add("DIR", f.get("DIR"), DIR[f.get("DIR") ?? ""] ?? null, false);
  add("SFTY", sfty, sfty ? `Safety tip${SFTY[sfty] ? `: ${SFTY[sfty]}` : ""}` : null, sfty !== undefined);

  let verdict: VendorVerdict["verdict"] = null;
  if (cat && PHISH_CATS.has(cat)) verdict = "phishing";
  else if (cat && MALWARE_CATS.has(cat)) verdict = "malware";
  else if (cat === "SPM" || cat === "HSPM" || sfv === "SPM" || Number(scl) >= 5) verdict = "spam";
  else if (cat === "BULK" || Number(bcl) >= 7) verdict = "bulk";
  else if (sfv === "NSPM" || cat === "NONE") verdict = "clean";
  return { vendor: "Microsoft 365", verdict, fields };
}

function proofpoint(headers: readonly HeaderField[]): VendorVerdict | null {
  const details = getHeader(headers, "x-proofpoint-spam-details");
  if (details === null) return null;
  const pairs = new Map<string, string>();
  for (const token of details.trim().split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq > 0) pairs.set(token.slice(0, eq).toLowerCase(), token.slice(eq + 1));
  }
  const fields: VendorField[] = [];
  const rule = pairs.get("rule");
  if (rule) fields.push({ key: "rule", value: rule, meaning: "Matched rule", flagged: rule !== "notspam" });
  for (const key of ["phishscore", "malwarescore", "spamscore", "bulkscore", "suspectscore"]) {
    const value = pairs.get(key);
    if (value !== undefined) fields.push({ key, value, meaning: "0–100", flagged: Number(value) >= 50 });
  }
  const r = (rule ?? "").toLowerCase();
  let verdict: VendorVerdict["verdict"] = null;
  if (r.includes("phish") || Number(pairs.get("phishscore")) >= 50) verdict = "phishing";
  else if (r.includes("malware") || Number(pairs.get("malwarescore")) >= 50) verdict = "malware";
  else if (r === "notspam") verdict = "clean";
  else if (r.includes("bulk")) verdict = "bulk";
  else if (r.includes("spam")) verdict = "spam";
  return { vendor: "Proofpoint", verdict, fields };
}

function mimecast(headers: readonly HeaderField[]): VendorVerdict | null {
  const score = getHeader(headers, "x-mimecast-spam-score");
  const impersonation = getHeader(headers, "x-mimecast-impersonation-protect");
  if (score === null && impersonation === null) return null;
  const fields: VendorField[] = [];
  if (score !== null) fields.push({ key: "Spam score", value: score.trim(), meaning: null, flagged: false });
  for (const part of (impersonation ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    fields.push({ key, value, meaning: null, flagged: value.toLowerCase() === "true" });
  }
  return { vendor: "Mimecast", verdict: fields.some((f) => f.flagged) ? "phishing" : null, fields };
}

function google(headers: readonly HeaderField[]): VendorVerdict | null {
  const phishy = getHeader(headers, "x-gm-phishy")?.trim();
  const spam = getHeader(headers, "x-gm-spam")?.trim();
  if (phishy === undefined && spam === undefined) return null;
  const fields: VendorField[] = [];
  if (phishy !== undefined) fields.push({ key: "X-Gm-Phishy", value: phishy, meaning: "Gmail phishing flag", flagged: phishy === "1" });
  if (spam !== undefined) fields.push({ key: "X-Gm-Spam", value: spam, meaning: "Gmail spam flag", flagged: spam === "1" });
  const verdict = phishy === "1" ? "phishing" : spam === "1" ? "spam" : "clean";
  return { vendor: "Gmail", verdict, fields };
}

function spamAssassin(headers: readonly HeaderField[]): VendorVerdict | null {
  const status = getHeader(headers, "x-spam-status");
  const flag = getHeader(headers, "x-spam-flag");
  if (status === null && flag === null) return null;
  const yes = /^\s*yes\b/i.test(status ?? flag ?? "");
  const fields: VendorField[] = [{ key: "status", value: yes ? "Yes" : "No", meaning: "Spam", flagged: yes }];
  const score = /score=(-?[\d.]+)/.exec(status ?? "");
  const required = /required=(-?[\d.]+)/.exec(status ?? "");
  if (score) fields.push({ key: "score", value: score[1], meaning: required ? `threshold ${required[1]}` : null, flagged: yes });
  return { vendor: "SpamAssassin", verdict: yes ? "spam" : "clean", fields };
}

// Hornetsecurity (formerly antispameurope) states its verdict in plain words.
function hornetsecurity(headers: readonly HeaderField[]): VendorVerdict | null {
  const status = getHeader(headers, "x-antispameurope-spamstatus")?.trim();
  const reason = getHeader(headers, "x-antispameurope-reason")?.trim();
  const virus = getHeader(headers, "x-antispameurope-virusscan")?.trim();
  if (status === undefined && virus === undefined) return null;
  const s = (status ?? "").toUpperCase();
  const infected = virus !== undefined && virus.toUpperCase() !== "CLEAN";
  let verdict: VendorVerdict["verdict"] = null;
  if (infected || /VIRUS|MALWARE|THREAT/.test(s)) verdict = "malware";
  else if (s.includes("PHISH")) verdict = "phishing";
  else if (s.includes("SPAM")) verdict = "spam";
  else if (s === "INFOMAIL" || s.includes("NEWSLETTER")) verdict = "bulk";
  else if (s === "CLEAN") verdict = "clean";
  const fields: VendorField[] = [];
  if (status !== undefined) fields.push({ key: "Spamstatus", value: status, meaning: null, flagged: s !== "CLEAN" && s !== "INFOMAIL" });
  if (reason !== undefined) fields.push({ key: "Reason", value: reason, meaning: null, flagged: false });
  if (virus !== undefined) fields.push({ key: "Virusscan", value: virus, meaning: null, flagged: infected });
  return { vendor: "Hornetsecurity", verdict, fields };
}

/** Verdicts left by mail filters on the way in. */
export function vendorVerdicts(headers: readonly HeaderField[]): VendorVerdict[] {
  return [microsoft, proofpoint, mimecast, google, spamAssassin, hornetsecurity]
    .map((decode) => decode(headers))
    .filter((v): v is VendorVerdict => v !== null);
}

export function vendorFindings(verdicts: readonly VendorVerdict[]): Finding[] {
  return verdicts.flatMap((v): Finding[] => {
    const id = `vendor.${v.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const evidence = v.fields
      .filter((f) => f.flagged)
      .map((f) => `${f.key}: ${f.value}${f.meaning ? ` (${f.meaning})` : ""}`);
    const base = { id, category: "vendor" as const, evidence };
    switch (v.verdict) {
      case "phishing":
        return [{ ...base, severity: "high",
          title: { en: `${v.vendor} classified it as phishing`, fr: `${v.vendor} l’a classé comme hameçonnage` },
          explanation: {
            en: "The mail filter this message went through flagged it as phishing when it arrived.",
            fr: "La passerelle de messagerie traversée par ce message l’a signalé comme hameçonnage à son arrivée.",
          }, weight: 15 }];
      case "malware":
        return [{ ...base, severity: "high",
          title: { en: `${v.vendor} detected malware`, fr: `${v.vendor} a détecté un logiciel malveillant` },
          explanation: {
            en: "The mail filter this message went through found malware in it.",
            fr: "La passerelle de messagerie traversée par ce message y a trouvé un logiciel malveillant.",
          }, weight: 20 }];
      case "spam":
        return [{ ...base, severity: "medium",
          title: { en: `${v.vendor} classified it as spam`, fr: `${v.vendor} l’a classé comme spam` },
          explanation: {
            en: "The mail filter this message went through scored it as spam.",
            fr: "La passerelle de messagerie traversée par ce message l’a évalué comme spam.",
          }, weight: 6 }];
      case "bulk":
        return [{ ...base, severity: "info",
          title: { en: `${v.vendor} classified it as bulk mail`, fr: `${v.vendor} l’a classé comme envoi en masse` },
          explanation: {
            en: "Bulk mail is marketing or notifications sent in volume. Not malicious by itself.",
            fr: "Un envoi en masse est un message marketing ou une notification expédié en volume. Il n’est pas malveillant en soi.",
          }, weight: 0 }];
      default:
        return [];
    }
  });
}
