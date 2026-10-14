import type { HeaderField } from "../email.ts";
import type { Finding } from "../finding.ts";
import { getHeader, getHeaders } from "../mime/headers.ts";
import { sameOrg } from "../net/domain.ts";
import type { Hop } from "./received.ts";

export type AuthEntry = {
  /** spf, dkim, dmarc, compauth, arc… lowercased. */
  method: string;
  /** pass, fail, softfail, none… lowercased. */
  result: string;
  reason: string | null;
  comment: string | null;
  /** `smtp.mailfrom`, `header.from`, `header.d`, `action`… */
  props: Record<string, string>;
};

export type AuthSummary = {
  /** The server whose verdict this is. */
  recordedBy: string | null;
  source: "Authentication-Results" | "Hornetsecurity" | "Received-SPF" | "ARC-Authentication-Results" | null;
  entries: AuthEntry[];
};

/** Splits on separator characters outside double quotes and parentheses. */
function splitTopLevel(input: string, isSeparator: (ch: string) => boolean): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const ch of input) {
    if (ch === '"' && depth === 0) quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && isSeparator(ch)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Removes top-level comments, returning them separately. */
function stripComments(input: string): { text: string; comments: string[] } {
  let text = "";
  let comment = "";
  const comments: string[] = [];
  let depth = 0;
  let quoted = false;
  for (const ch of input) {
    if (depth === 0 && ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") {
      if (depth > 0) comment += ch;
      depth++;
      continue;
    }
    if (!quoted && ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        comments.push(comment.trim());
        comment = "";
        text += " ";
      } else {
        comment += ch;
      }
      continue;
    }
    if (depth > 0) comment += ch;
    else text += ch;
  }
  return { text, comments };
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function splitPair(token: string): [string, string] {
  const eq = token.indexOf("=");
  return [token.slice(0, eq).trim().toLowerCase(), unquote(token.slice(eq + 1).trim())];
}

/** Authentication-Results (RFC 8601) and ARC-Authentication-Results. */
export function parseAuthResults(value: string): { authservId: string | null; entries: AuthEntry[] } {
  const body = value.replace(/^\s*i=\d+\s*;/, "");
  const segments = splitTopLevel(body, (ch) => ch === ";");
  let authservId: string | null = null;
  if (segments.length > 0) {
    const first = stripComments(segments[0]).text.trim().split(/\s+/)[0] ?? "";
    // Microsoft omits the authserv-id and starts straight with "spf=…".
    if (!first.includes("=")) {
      authservId = first || null;
      segments.shift();
    }
  }
  const entries: AuthEntry[] = [];
  for (const segment of segments) {
    const { text, comments } = stripComments(segment);
    const tokens = splitTopLevel(text, (ch) => /\s/.test(ch));
    const head = tokens.shift();
    if (!head || !head.includes("=")) continue;
    const [method, result] = splitPair(head);
    const props: Record<string, string> = {};
    let reason: string | null = null;
    for (const token of tokens) {
      if (!token.includes("=")) continue;
      const [key, val] = splitPair(token);
      if (key === "reason") reason = val;
      else props[key] = val;
    }
    entries.push({ method, result: result.toLowerCase(), reason, comment: comments.join(" ") || null, props });
  }
  return { authservId, entries };
}

export function parseReceivedSpf(value: string): AuthEntry {
  const { text, comments } = stripComments(value);
  const [word = "", ...rest] = text.trim().split(/\s+/);
  const props: Record<string, string> = {};
  for (const part of splitTopLevel(rest.join(" "), (ch) => ch === ";")) {
    if (part.includes("=")) {
      const [key, val] = splitPair(part);
      props[key] = val;
    }
  }
  return { method: "spf", result: word.toLowerCase(), reason: null, comment: comments.join(" ") || null, props };
}

/**
 * The verdict that counts is the one written by the receiving server: the
 * topmost Authentication-Results. Lower ones, and every ARC copy, were
 * written further upstream and may come from the sender itself.
 */
export function authSummary(headers: readonly HeaderField[], hops: readonly Hop[]): AuthSummary {
  const lastBy = hops.at(-1)?.by ?? null;
  const top = getHeader(headers, "authentication-results");
  if (top !== null) {
    const parsed = parseAuthResults(top);
    return { recordedBy: parsed.authservId ?? lastBy, source: "Authentication-Results", entries: parsed.entries };
  }
  const hornet = hornetsecurityResults(headers);
  if (hornet.length > 0) return { recordedBy: "Hornetsecurity", source: "Hornetsecurity", entries: hornet };
  const spf = getHeader(headers, "received-spf");
  if (spf !== null) return { recordedBy: lastBy, source: "Received-SPF", entries: [parseReceivedSpf(spf)] };
  const arc = arcResults(headers);
  if (arc) return { recordedBy: arc.authservId, source: "ARC-Authentication-Results", entries: arc.entries };
  return { recordedBy: null, source: null, entries: [] };
}

/** Where the results came from, when it was not the receiving server's Authentication-Results. */
export const AUTH_SOURCE_NOTE: Record<NonNullable<AuthSummary["source"]>, string | null> = {
  "Authentication-Results": null,
  Hornetsecurity: "from the X-antispameurope headers",
  "Received-SPF": "from Received-SPF only",
  "ARC-Authentication-Results": "from an ARC copy, written upstream: a pass proves little",
};

const VERDICT = /^(pass|fail|softfail|neutral|none|temperror|permerror)$/;

/** The gateway's own SPF and DKIM headers, for when it wrote no Authentication-Results. */
function hornetsecurityResults(headers: readonly HeaderField[]): AuthEntry[] {
  const entry = (method: string, value: string): AuthEntry | null => {
    const result = value.trim().toLowerCase();
    return VERDICT.test(result) ? { method, result, reason: null, comment: null, props: {} } : null;
  };
  return [
    ...getHeaders(headers, "x-antispameurope-spfresult").map((v) => entry("spf", v)),
    // Other values ("Positive policy"…) are not verdicts.
    ...getHeaders(headers, "x-antispameurope-dkim").map((v) => entry("dkim", v)),
  ].filter((e): e is AuthEntry => e !== null);
}

/**
 * The last resort: an ARC copy, from the highest instance that recorded SPF,
 * DKIM or DMARC. ARC is written upstream, possibly by the sender, so a pass
 * proves little; a failure still counts, since no sender forges its own.
 */
function arcResults(headers: readonly HeaderField[]): { authservId: string | null; entries: AuthEntry[] } | null {
  const instances = getHeaders(headers, "arc-authentication-results")
    .map((value) => ({ i: Number(/^\s*i=(\d+)/.exec(value)?.[1] ?? 0), ...parseAuthResults(value) }))
    .filter((arc) => arc.entries.some((e) => ["spf", "dkim", "dmarc"].includes(e.method)))
    .sort((a, b) => b.i - a.i);
  return instances[0] ?? null;
}

const FAILING = new Set(["fail", "softfail", "permerror", "hardfail"]);

export function isFailing(entry: AuthEntry): boolean {
  return FAILING.has(entry.result) || (entry.result === "none" && ["spf", "dkim", "dmarc"].includes(entry.method));
}

/** `key=value` properties plus the reason, for display and evidence. */
export function entryDetails(entry: AuthEntry): string {
  const parts = Object.entries(entry.props).map(([key, value]) => `${key}=${value}`);
  if (entry.reason) parts.push(`reason=${entry.reason}`);
  return parts.join(" ");
}

function evidenceLine(entry: AuthEntry): string {
  return `${entry.method}=${entry.result} ${entryDetails(entry)}`.trim();
}

export function authFindings(summary: AuthSummary, fromDomain: string | null, orgDomains: readonly string[]): Finding[] {
  if (summary.entries.length === 0) {
    return [{
      id: "auth.missing", category: "auth", severity: "info", title: "No authentication results",
      explanation: "No receiving server recorded SPF, DKIM or DMARC results in these headers, so the sender's identity was not checked here.",
      evidence: [], weight: 0,
    }];
  }
  const first = (method: string) => summary.entries.find((e) => e.method === method);
  const dmarc = first("dmarc");
  const spf = first("spf");
  const compauth = first("compauth");
  const dkims = summary.entries.filter((e) => e.method === "dkim");

  if (dmarc?.result === "fail") {
    const domain = dmarc.props["header.from"] ?? fromDomain;
    const own = domain !== null && orgDomains.some((d) => sameOrg(d, domain));
    return [{
      id: "auth.dmarc-fail", category: "auth", severity: "high",
      title: own ? "Sender authentication failed for your own domain" : `DMARC failed for ${domain ?? "the sender's domain"}`,
      explanation:
        `The receiving server checked ${domain ?? "the From domain"} against its DMARC policy and the message failed: neither SPF nor DKIM proved it came from that domain.` +
        (own ? " The From address claims to be your organisation, which is the classic spoofing setup." : ""),
      evidence: [dmarc, spf, ...dkims, compauth].filter((e): e is AuthEntry => e !== undefined).map(evidenceLine),
      weight: own ? 25 : 18,
    }];
  }

  const findings: Finding[] = [];
  if (spf && (spf.result === "fail" || spf.result === "softfail")) {
    const hard = spf.result === "fail";
    findings.push({
      id: `auth.spf-${spf.result}`, category: "auth", severity: hard ? "medium" : "low",
      title: hard ? "SPF failed" : "SPF soft-failed",
      explanation: "The server that delivered the message is not on the list of servers allowed to send for the envelope sender's domain.",
      evidence: [evidenceLine(spf)], weight: hard ? 10 : 4,
    });
  }
  const broken = dkims.filter((e) => e.result === "fail" || e.result === "permerror");
  if (broken.length > 0) {
    findings.push({
      id: "auth.dkim-fail", category: "auth", severity: "medium", title: "DKIM signature did not verify",
      explanation: "The message was signed, but the signature no longer matches: it was altered after signing, or the signature is forged.",
      evidence: broken.map(evidenceLine), weight: 8,
    });
  }
  if (compauth?.result === "fail") {
    findings.push({
      id: "auth.compauth-fail", category: "auth", severity: "medium", title: "Microsoft composite authentication failed",
      explanation: "Microsoft 365 combined SPF, DKIM, DMARC and its own signals and could not confirm the sender.",
      evidence: [evidenceLine(compauth)], weight: 10,
    });
  }
  return findings;
}
