import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeaders } from "../mime/headers.ts";
import { orgDomain } from "../net/domain.ts";
import { ipScope, isIp, type IpScope } from "../net/ip.ts";
import { parseMailDate } from "./date.ts";

export type Hop = {
  /** 1 is the oldest hop, closest to the sender. */
  index: number;
  /** Name the sending host announced (HELO/EHLO), as recorded by the receiver. */
  helo: string | null;
  /** Reverse DNS name the receiver found for the sending IP, when it recorded one. */
  rdns: string | null;
  ip: string | null;
  ipScope: IpScope | null;
  by: string | null;
  protocol: string | null;
  tls: boolean;
  date: Date | null;
  /** Seconds since the previous dated hop; negative means the clocks disagree. */
  delay: number | null;
  /** Public sender whose HELO name has no reverse DNS, or reverse DNS in another organisation. */
  heloMismatch: boolean;
  raw: string;
};

const KEYWORDS = new Set(["from", "by", "via", "with", "id", "for"]);

/** Cuts a Received header (minus its date) into its `from` / `by` / `with`… clauses, ignoring comments. */
function clauses(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let current: string | null = null;
  let buffer = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[A-Za-z]/.test(ch) && (i === 0 || text[i - 1] === " ")) {
      const word = /^[A-Za-z]+/.exec(text.slice(i))?.[0] ?? "";
      const lower = word.toLowerCase();
      const next = text[i + word.length];
      if (KEYWORDS.has(lower) && !(lower in out) && lower !== current && (next === " " || next === undefined)) {
        if (current) out[current] = buffer.trim();
        current = lower;
        buffer = "";
        i += word.length - 1;
        continue;
      }
    }
    buffer += ch;
  }
  if (current) out[current] = buffer.trim();
  return out;
}

type FromClause = { helo: string | null; rdns: string | null; ip: string | null; noRdns: boolean };

function parseFrom(clause: string): FromClause {
  const announced = /^[^\s(]+/.exec(clause)?.[0] ?? null;
  const comments = [...clause.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  let helo = announced;
  let ip: string | null = null;
  let rdns: string | null = null;
  for (const comment of comments) {
    if (ip === null) {
      const bracket = /\[(?:IPv6:)?([0-9A-Fa-f:.]+)\]/.exec(comment);
      const bare = comment.split(/[\s,;]+/).find((token) => isIp(token));
      const found = bracket && isIp(bracket[1]) ? bracket[1] : (bare ?? null);
      if (found) {
        ip = found;
        const before = comment.slice(0, bracket && bracket[1] === found ? bracket.index : comment.indexOf(found));
        const candidate = before.trim().split(/\s+/).pop() ?? "";
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\.?$/i.test(candidate)) rdns = candidate.replace(/\.$/, "");
      }
    }
    const heloComment = /\bhelo[=\s]+([^\s)\];]+)/i.exec(comment);
    if (heloComment) helo = heloComment[1];
  }
  if (announced && /^\[.*\]$/.test(announced)) {
    const inner = announced.slice(1, -1).replace(/^IPv6:/i, "");
    if (ip === null && isIp(inner)) ip = inner;
    if (helo === announced) helo = null;
  }
  return {
    helo: helo ? helo.replace(/\.$/, "") : null,
    rdns,
    ip,
    noRdns: comments.some((c) => /^\s*unknown\b/i.test(c)),
  };
}

export function parseReceived(raw: string): Omit<Hop, "index" | "delay"> {
  const value = raw.replace(/\s+/g, " ").trim();
  const semicolon = value.lastIndexOf(";");
  const head = semicolon === -1 ? value : value.slice(0, semicolon);
  // Some relays (SendGrid's filters, for one) write the date without a semicolon.
  const date = parseMailDate(semicolon === -1 ? value : value.slice(semicolon + 1));
  const parts = clauses(head);
  const from: FromClause = parts.from !== undefined
    ? parseFrom(parts.from)
    : { helo: null, rdns: null, ip: null, noRdns: false };
  const scope = from.ip ? ipScope(from.ip) : null;
  const heloMismatch =
    scope === "public" &&
    from.helo !== null &&
    !isIp(from.helo) &&
    (from.noRdns || (from.rdns !== null && orgDomain(from.rdns) !== orgDomain(from.helo)));
  const by = parts.by !== undefined ? (/^[^\s(]+/.exec(parts.by)?.[0] ?? null) : null;
  return {
    helo: from.helo,
    rdns: from.rdns,
    ip: from.ip,
    ipScope: scope,
    by: by ? by.replace(/\.$/, "") : null,
    protocol: parts.with !== undefined ? parts.with.split("(")[0].trim() || null : null,
    tls: /\b(?:E?SMTPSA?|UTF8SMTPSA?|LMTPSA?|HTTPS)\b|TLS/i.test(value),
    date,
    heloMismatch,
    raw,
  };
}

/** The Received chain, oldest hop first. */
export function relayChain(headers: readonly HeaderField[]): Hop[] {
  // Each server prepends its own Received header, so the file reads newest first.
  const raws = getHeaders(headers, "received").reverse();
  let previous: Date | null = null;
  return raws.map((raw, i) => {
    const hop = parseReceived(raw);
    const delay = hop.date && previous ? Math.round((hop.date.getTime() - previous.getTime()) / 1000) : null;
    if (hop.date) previous = hop.date;
    return { ...hop, index: i + 1, delay };
  });
}

export function routeFindings(hops: readonly Hop[]): Finding[] {
  if (hops.length === 0) {
    return [{
      id: "route.no-received", category: "route", severity: "info", title: { en: "No Received headers", fr: "Aucun en-tête Received" },
      explanation: {
        en: "Without Received headers the path the message took cannot be checked. Pasted headers are often incomplete.",
        fr: "Sans en-têtes Received, le chemin suivi par le message ne peut pas être vérifié. Les en-têtes collés sont souvent incomplets.",
      },
      evidence: [], weight: 0,
    }];
  }
  const findings: Finding[] = [];
  const origin = hops.find((h) => h.ipScope === "public");
  if (origin?.heloMismatch) {
    findings.push({
      id: "route.helo-mismatch", category: "route", severity: "low", title: { en: "Sending server misnames itself", fr: "Le serveur d’envoi se présente sous un faux nom" },
      explanation: {
        en: "The first external server introduced itself with a name its IP address does not resolve back to. Legitimate mail servers usually have matching forward and reverse DNS.",
        fr: "Le premier serveur externe s’est présenté sous un nom que son adresse IP ne résout pas en retour. Les serveurs de messagerie légitimes ont en général un DNS direct et inverse cohérents.",
      },
      evidence: [`HELO ${origin.helo}`, `from ${origin.ip} (${origin.rdns ?? "no reverse DNS"})`],
      weight: 4,
    });
  }
  const skewed = hops.filter((h) => h.delay !== null && h.delay < -300);
  if (skewed.length > 0) {
    findings.push({
      id: "route.clock-skew", category: "route", severity: "info", title: { en: "Relay clocks disagree", fr: "Les horloges des relais ne concordent pas" },
      explanation: {
        en: "At least one server stamped a time earlier than the server before it. Usually a misconfigured clock; inserted Received headers look the same.",
        fr: "Au moins un serveur a daté le message plus tôt que le serveur précédent. C’est généralement une horloge mal réglée\u00a0; des en-têtes Received insérés ont le même effet.",
      },
      evidence: skewed.map((h) => `hop ${h.index}: ${h.delay} s`), weight: 0,
    });
  }
  return findings;
}
