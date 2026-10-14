import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import type { Text } from "../i18n/text.ts";
import { getHeader } from "../mime/headers.ts";

export type VendorField = { key: string; value: string; meaning: Text | null; flagged: boolean };

export type VendorVerdict = {
  vendor: string;
  verdict: "phishing" | "malware" | "spam" | "bulk" | "clean" | null;
  fields: VendorField[];
};

const SFV: Record<string, Text> = {
  BLK: { en: "Blocked: sender on the user's blocked list", fr: "Bloqué : expéditeur dans la liste des expéditeurs bloqués de l’utilisateur" },
  NSPM: { en: "Not spam", fr: "Pas du spam" },
  SFE: { en: "Allowed: sender on the user's safe list", fr: "Autorisé : expéditeur dans la liste des expéditeurs fiables de l’utilisateur" },
  SKA: { en: "Allowed by an anti-spam policy", fr: "Autorisé par une stratégie anti-spam" },
  SKB: { en: "Blocked by an anti-spam policy", fr: "Bloqué par une stratégie anti-spam" },
  SKI: { en: "Internal message, filtering skipped", fr: "Message interne, filtrage ignoré" },
  SKN: { en: "Marked not spam by a mail flow rule", fr: "Marqué comme non-spam par une règle de flux de messagerie" },
  SKQ: { en: "Released from quarantine", fr: "Libéré de la quarantaine" },
  SKS: { en: "Marked spam by a mail flow rule", fr: "Marqué comme spam par une règle de flux de messagerie" },
  SPM: { en: "Spam", fr: "Spam" },
};

const CAT: Record<string, Text> = {
  AMP: { en: "Malware (anti-malware)", fr: "Logiciel malveillant (anti-malware)" },
  BIMP: { en: "Brand impersonation", fr: "Usurpation de marque" },
  BULK: { en: "Bulk", fr: "Envoi en masse" },
  DIMP: { en: "Domain impersonation", fr: "Usurpation de domaine" },
  FTBP: { en: "Blocked file type", fr: "Type de fichier bloqué" },
  GIMP: { en: "Mailbox-intelligence impersonation", fr: "Usurpation détectée par Mailbox Intelligence" },
  HPHSH: { en: "High-confidence phishing", fr: "Hameçonnage à forte confiance" },
  HPHISH: { en: "High-confidence phishing", fr: "Hameçonnage à forte confiance" },
  HSPM: { en: "High-confidence spam", fr: "Spam à forte confiance" },
  INTOS: { en: "Internal phishing", fr: "Hameçonnage interne" },
  MALW: { en: "Malware", fr: "Logiciel malveillant" },
  OSPM: { en: "Outbound spam", fr: "Spam sortant" },
  PHSH: { en: "Phishing", fr: "Hameçonnage" },
  SAP: { en: "Safe Attachments", fr: "Pièces jointes fiables (Safe Attachments)" },
  SPM: { en: "Spam", fr: "Spam" },
  SPOOF: { en: "Spoofing", fr: "Usurpation d’identité" },
  UIMP: { en: "User impersonation", fr: "Usurpation d’utilisateur" },
  NONE: { en: "No category", fr: "Aucune catégorie" },
};

const IPV: Record<string, Text> = {
  CAL: { en: "IP allowed by the connection filter", fr: "IP autorisée par le filtre de connexion" },
  NLI: { en: "IP not on any reputation list", fr: "IP absente de toute liste de réputation" },
};
const DIR: Record<string, Text> = {
  INB: { en: "Inbound", fr: "Entrant" },
  OUT: { en: "Outbound", fr: "Sortant" },
  INT: { en: "Internal", fr: "Interne" },
};
const SFTY: Record<string, Text> = {
  "9.19": { en: "domain impersonation", fr: "usurpation de domaine" },
  "9.20": { en: "user impersonation", fr: "usurpation d’utilisateur" },
};
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

function sclMeaning(scl: number): Text {
  if (scl === -1) return { en: "Filtering skipped", fr: "Filtrage ignoré" };
  if (scl <= 1) return { en: "Not spam", fr: "Pas du spam" };
  if (scl <= 6) return { en: "Spam", fr: "Spam" };
  return { en: "High-confidence spam", fr: "Spam à forte confiance" };
}

function bclMeaning(bcl: number): Text {
  if (bcl === 0) return { en: "Not bulk", fr: "Pas un envoi en masse" };
  if (bcl <= 3) return { en: "Bulk, few complaints", fr: "Envoi en masse, peu de plaintes" };
  if (bcl <= 7) return { en: "Bulk, some complaints", fr: "Envoi en masse, quelques plaintes" };
  return { en: "Bulk, many complaints", fr: "Envoi en masse, nombreuses plaintes" };
}

function safetyTip(sfty: string): Text {
  const kind = SFTY[sfty];
  return {
    en: `Safety tip${kind ? `: ${kind.en}` : ""}`,
    fr: `Astuce de sécurité${kind ? ` : ${kind.fr}` : ""}`,
  };
}

function microsoft(headers: readonly HeaderField[]): VendorVerdict | null {
  const report = getHeader(headers, "x-forefront-antispam-report");
  const orgScl = getHeader(headers, "x-ms-exchange-organization-scl");
  const antispam = getHeader(headers, "x-microsoft-antispam");
  const pcl = getHeader(headers, "x-ms-exchange-organization-pcl")?.trim();
  if (report === null && orgScl === null && antispam === null) return null;

  const f = colonPairs(report ?? "");
  const fields: VendorField[] = [];
  const add = (key: string, value: string | undefined, meaning: Text | null, flagged: boolean) => {
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
  add("PCL", pcl, pcl ? (Number(pcl) >= 4 ? { en: "Likely phishing", fr: "Phishing probable" } : { en: "Unlikely phishing", fr: "Phishing improbable" }) : null, Number(pcl) >= 4);
  add("IPV", f.get("IPV"), IPV[f.get("IPV") ?? ""] ?? null, false);
  add("CTRY", f.get("CTRY"), { en: "Country of the connecting IP", fr: "Pays de l’IP qui se connecte" }, false);
  add("CIP", f.get("CIP"), { en: "Connecting IP", fr: "IP qui se connecte" }, false);
  add("PTR", ptr, ptr === "InfoNoRecords" ? { en: "No reverse DNS", fr: "Pas de DNS inverse" } : { en: "Reverse DNS of the connecting IP", fr: "DNS inverse de l’IP qui se connecte" }, ptr === "InfoNoRecords");
  add("LANG", f.get("LANG"), { en: "Detected language", fr: "Langue détectée" }, false);
  add("DIR", f.get("DIR"), DIR[f.get("DIR") ?? ""] ?? null, false);
  add("SFTY", sfty, sfty ? safetyTip(sfty) : null, sfty !== undefined);

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
  if (rule) fields.push({ key: "rule", value: rule, meaning: { en: "Matched rule", fr: "Règle déclenchée" }, flagged: rule !== "notspam" });
  for (const key of ["phishscore", "malwarescore", "spamscore", "bulkscore", "suspectscore"]) {
    const value = pairs.get(key);
    if (value !== undefined) fields.push({ key, value, meaning: { en: "0–100", fr: "0–100" }, flagged: Number(value) >= 50 });
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
  if (phishy !== undefined) fields.push({ key: "X-Gm-Phishy", value: phishy, meaning: { en: "Gmail phishing flag", fr: "Indicateur de phishing Gmail" }, flagged: phishy === "1" });
  if (spam !== undefined) fields.push({ key: "X-Gm-Spam", value: spam, meaning: { en: "Gmail spam flag", fr: "Indicateur de spam Gmail" }, flagged: spam === "1" });
  const verdict = phishy === "1" ? "phishing" : spam === "1" ? "spam" : "clean";
  return { vendor: "Gmail", verdict, fields };
}

function spamAssassin(headers: readonly HeaderField[]): VendorVerdict | null {
  const status = getHeader(headers, "x-spam-status");
  const flag = getHeader(headers, "x-spam-flag");
  if (status === null && flag === null) return null;
  const yes = /^\s*yes\b/i.test(status ?? flag ?? "");
  const fields: VendorField[] = [{ key: "status", value: yes ? "Yes" : "No", meaning: { en: "Spam", fr: "Spam" }, flagged: yes }];
  const score = /score=(-?[\d.]+)/.exec(status ?? "");
  const required = /required=(-?[\d.]+)/.exec(status ?? "");
  if (score) fields.push({ key: "score", value: score[1], meaning: required ? { en: `threshold ${required[1]}`, fr: `seuil ${required[1]}` } : null, flagged: yes });
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
      .map((f) => `${f.key}: ${f.value}${f.meaning ? ` (${f.meaning.en})` : ""}`);
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
